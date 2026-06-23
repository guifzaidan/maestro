"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useWorkspace, getWorkspace } from "@/lib/workspace-context";
import { PageTransition } from "@/components/shell/page-transition";
import { Topbar } from "@/components/shell/topbar";
import { ScopeFilter } from "@/components/shell/scope-filter";
import { Dot } from "@/components/ui/primitives";
import { Icon } from "@/components/ui/icon";
import { useToast } from "@/components/ui/toast";
import { CONNECTORS, type Connector } from "@/lib/mock/integrations";
import {
  fetchConnections,
  saveConnection,
  removeConnection,
  introspectConnection,
  type ConnectionDTO,
  type IntrospectedTable,
} from "@/lib/connections-client";
import { cn } from "@/lib/utils";

export function IntegrationsView() {
  const { scope } = useWorkspace();
  const [persisted, setPersisted] = useState<ConnectionDTO[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);

  const reload = useCallback(() => {
    fetchConnections().then(setPersisted).catch(() => {});
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const visible = scope === "all" ? CONNECTORS : CONNECTORS.filter((c) => c.scopes.includes(scope));

  // DB é a fonte da verdade quando há registro; senão cai no estado mock.
  const isConnected = (c: Connector) => {
    const row = persisted.find((p) => p.id === c.id);
    return row ? row.connected : c.connected;
  };
  const connected = visible.filter(isConnected).length;

  return (
    <PageTransition>
      <Topbar title="Integrações" subtitle="Conecte a estrutura de cada empresa — Drive, planilhas, docs e bases." />
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <ScopeFilter />
        <span className="shrink-0 text-xs text-muted-2">{connected} de {visible.length} ativas</span>
      </div>
      <motion.div
        initial="hidden"
        animate="show"
        variants={{ show: { transition: { staggerChildren: 0.06 } } }}
        className="flex flex-col gap-2"
      >
        {visible.map((c) => (
          <motion.div
            key={c.id}
            variants={{
              hidden: { opacity: 0, y: 12 },
              show:   { opacity: 1, y: 0, transition: { duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] as [number,number,number,number] } },
            }}
          >
            <ConnectorCard
              connector={c}
              self={persisted.find((p) => p.id === c.id)}
              tursoRows={persisted.filter((p) => p.connector === "turso" && p.id !== c.id)}
              open={openId === c.id}
              onToggle={() => setOpenId(openId === c.id ? null : c.id)}
              onChanged={reload}
            />
          </motion.div>
        ))}
      </motion.div>
    </PageTransition>
  );
}

function ConnectorCard({
  connector,
  self,
  tursoRows,
  open,
  onToggle,
  onChanged,
}: {
  connector: Connector;
  self?: ConnectionDTO;
  tursoRows: ConnectionDTO[];
  open: boolean;
  onToggle: () => void;
  onChanged: () => void;
}) {
  const { toast } = useToast();
  const [connected, setConnected] = useState(self?.connected ?? connector.connected);
  const [showKey, setShowKey] = useState(false);
  const [cred, setCred] = useState("");
  const [saving, setSaving] = useState(false);

  // Sincroniza quando a lista persistida recarrega.
  useEffect(() => { setConnected(self?.connected ?? connector.connected); }, [self?.connected, connector.connected]);

  const isDb = connector.category === "db";

  const persist = async (nextConnected: boolean) => {
    setSaving(true);
    try {
      await saveConnection({
        id: connector.id,
        connector: connector.id,
        connected: nextConnected,
        secret: cred || undefined,
      });
      setConnected(nextConnected);
      setCred("");
      onChanged();
      toast(nextConnected ? "Conexão salva" : "Desconectado", nextConnected ? "create" : "delete");
    } catch {
      toast("Falha ao salvar", "delete");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={cn("glass rounded-2xl overflow-hidden", connected && "glow")}>
      {/* Row */}
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-4 px-4 py-3 text-left transition-colors hover:bg-white/[0.02]"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--surface-2)]">
          <Icon name={connector.icon} size={17} style={{ color: connected ? "var(--accent)" : undefined }} />
        </span>

        <div className="min-w-0 flex-1">
          <span className="text-sm font-medium">{connector.name}</span>
          <p className="mt-0.5 truncate text-[11px] text-muted-2">{connector.description}</p>
        </div>

        <span className={cn(
          "flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium",
          connected
            ? "bg-emerald-400/10 text-emerald-400"
            : "bg-white/[0.04] text-muted-2"
        )}>
          <span className={cn("h-1.5 w-1.5 rounded-full", connected ? "bg-emerald-400 pulse-dot" : "bg-zinc-600")} style={connected ? { color: "#34d399" } : undefined} />
          {connected ? "Ativo" : "Inativo"}
        </span>

        <motion.span
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: 0.2 }}
          className="shrink-0 text-muted-2"
        >
          <Icon name="ChevronDown" size={15} />
        </motion.span>
      </button>

      {/* Expanded panel */}
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.25, 0.46, 0.45, 0.94] }}
            className="overflow-hidden"
          >
            <div className="border-t border-[var(--border)] px-4 py-4 space-y-4">
              {/* Credential fields — varia por categoria */}
              {isDb ? (
                <TursoConnections rows={tursoRows} onChanged={onChanged} />
              ) : connector.category === "messaging" ? (
                <>
                  <MaskedField
                    label="Auth Token"
                    icon="KeyRound"
                    placeholder={self?.hasSecret ? "•••••••• (salvo) — cole para trocar" : "Cole o auth token..."}
                    value={cred}
                    onChange={setCred}
                  />
                  <p className="text-[11px] text-muted-2">Account SID e número podem ser editados em Configurações.</p>
                </>
              ) : (
                <MaskedField
                  label="Credencial / API Key"
                  icon="KeyRound"
                  placeholder={self?.hasSecret ? "•••••••• (salvo) — cole para trocar" : "Cole sua chave aqui..."}
                  value={cred}
                  onChange={setCred}
                  showKey={showKey}
                  onToggleShow={() => setShowKey((s) => !s)}
                />
              )}

              {/* Scopes */}
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-muted-2">Contextos:</span>
                <div className="flex items-center gap-1.5">
                  {connector.scopes.map((s) => {
                    const ws = getWorkspace(s);
                    return (
                      <span key={s} className="flex items-center gap-1 rounded-full bg-[var(--surface)] px-2 py-0.5 text-[10px] text-muted">
                        <Dot color={ws.accent} size={6} /> {ws.name}
                      </span>
                    );
                  })}
                </div>
              </div>

              {/* Actions — DB gerencia suas próprias conexões na lista acima */}
              {!isDb && (
                <div className="flex items-center justify-end gap-2 pt-1">
                  {connected && (
                    <motion.button
                      whileHover={{ scale: 1.04 }}
                      whileTap={{ scale: 0.96 }}
                      disabled={saving}
                      onClick={() => persist(false)}
                      className="rounded-full border border-[var(--border)] px-3.5 py-1.5 text-xs text-muted transition-colors hover:border-[var(--border-strong)] hover:text-white disabled:opacity-50"
                    >
                      Desconectar
                    </motion.button>
                  )}
                  <motion.button
                    whileHover={{ scale: 1.04 }}
                    whileTap={{ scale: 0.96 }}
                    disabled={saving}
                    onClick={() => persist(true)}
                    className="rounded-full bg-white px-3.5 py-1.5 text-xs font-medium text-black disabled:opacity-50"
                  >
                    {connected ? "Salvar" : "Conectar"}
                  </motion.button>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

type DbRow = { id: string; name: string; url: string; hasSecret: boolean; persisted: boolean; selected: string[] };
type TablesState = { loading: boolean; error: string | null; tables: IntrospectedTable[] };

function rowsFromDTO(rows: ConnectionDTO[]): DbRow[] {
  return rows.map((r) => ({
    id: r.id,
    name: r.name ?? "",
    url: (r.config?.url as string) ?? "",
    hasSecret: r.hasSecret,
    persisted: true,
    selected: Array.isArray(r.config?.tables) ? (r.config!.tables as string[]) : [],
  }));
}

function TursoConnections({ rows, onChanged }: { rows: ConnectionDTO[]; onChanged: () => void }) {
  const { toast } = useToast();
  const [conns, setConns] = useState<DbRow[]>(() => rowsFromDTO(rows));
  // segredo (token) digitado por linha — só em memória até salvar
  const [tokens, setTokens] = useState<Record<string, string>>({});
  // tabelas introspeccionadas por conexão
  const [tablesByConn, setTablesByConn] = useState<Record<string, TablesState>>({});
  // seleção corrente por conexão — ref síncrono para evitar corrida em cliques rápidos
  const selRef = useRef<Record<string, string[]>>({});

  // Recarrega a lista quando a fonte persistida muda.
  useEffect(() => {
    const next = rowsFromDTO(rows);
    setConns(next);
    next.forEach((r) => { selRef.current[r.id] = r.selected; });
  }, [rows]);

  const add = () => {
    const id = crypto.randomUUID();
    selRef.current[id] = [];
    setConns((prev) => [...prev, { id, name: "", url: "", hasSecret: false, persisted: false, selected: [] }]);
  };

  const setField = (id: string, field: "name" | "url", value: string) =>
    setConns((prev) => prev.map((c) => (c.id === id ? { ...c, [field]: value } : c)));

  const save = async (id: string, override?: Partial<DbRow>) => {
    const base = conns.find((x) => x.id === id);
    if (!base) return;
    const c = { ...base, ...override };
    if (!c.name && !c.url && !tokens[id] && c.selected.length === 0) return; // nada pra salvar
    try {
      await saveConnection({
        id,
        connector: "turso",
        name: c.name,
        config: { url: c.url, tables: c.selected },
        secret: tokens[id] || undefined,
      });
      setConns((prev) => prev.map((x) => (x.id === id ? { ...c, persisted: true, hasSecret: x.hasSecret || !!tokens[id] } : x)));
      setTokens((prev) => ({ ...prev, [id]: "" }));
      onChanged();
    } catch {
      toast("Falha ao salvar conexão", "delete");
    }
  };

  const remove = async (id: string) => {
    const c = conns.find((x) => x.id === id);
    setConns((prev) => prev.filter((x) => x.id !== id));
    if (c?.persisted) {
      try { await removeConnection(id); onChanged(); toast("Conexão removida", "delete"); } catch { /* ignore */ }
    }
  };

  const loadTables = async (id: string) => {
    setTablesByConn((p) => ({ ...p, [id]: { loading: true, error: null, tables: p[id]?.tables ?? [] } }));
    const token = tokens[id];
    const res = await introspectConnection(token ? { id, token } : { id });
    if (res.error) {
      setTablesByConn((p) => ({ ...p, [id]: { loading: false, error: res.error!, tables: [] } }));
      toast("Falha ao ler tabelas", "delete");
    } else {
      setTablesByConn((p) => ({ ...p, [id]: { loading: false, error: null, tables: res.tables ?? [] } }));
    }
  };

  // Aplica nova seleção a partir do ref síncrono (robusto a cliques rápidos).
  const applySelection = (id: string, selected: string[]) => {
    selRef.current[id] = selected;
    setConns((prev) => prev.map((c) => (c.id === id ? { ...c, selected } : c)));
    save(id, { selected });
  };

  const toggleTable = (id: string, table: string) => {
    const cur = selRef.current[id] ?? [];
    applySelection(id, cur.includes(table) ? cur.filter((t) => t !== table) : [...cur, table]);
  };

  const toggleAll = (id: string, allNames: string[]) => {
    const cur = selRef.current[id] ?? [];
    const allSelected = allNames.length > 0 && allNames.every((n) => cur.includes(n));
    applySelection(id, allSelected ? [] : allNames);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted">Conexões Turso</span>
        <motion.button
          whileHover={{ scale: 1.04 }}
          whileTap={{ scale: 0.96 }}
          onClick={add}
          className="flex items-center gap-1 rounded-full border border-[var(--border)] px-2.5 py-1 text-[11px] text-muted transition-colors hover:border-[var(--border-strong)] hover:text-white"
        >
          <Icon name="Plus" size={11} /> Adicionar
        </motion.button>
      </div>

      <AnimatePresence initial={false}>
        {conns.map((conn) => (
          <motion.div
            key={conn.id}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="space-y-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="Nome da conexão"
                  value={conn.name}
                  onChange={(e) => setField(conn.id, "name", e.target.value)}
                  onBlur={() => save(conn.id)}
                  className="min-w-0 flex-1 bg-transparent text-sm font-medium outline-none placeholder:text-muted-2"
                />
                <button
                  onClick={() => remove(conn.id)}
                  className="shrink-0 text-muted-2 transition-colors hover:text-white"
                >
                  <Icon name="X" size={13} />
                </button>
              </div>
              <input
                type="text"
                placeholder="libsql://nome.turso.io"
                value={conn.url}
                onChange={(e) => setField(conn.id, "url", e.target.value)}
                onBlur={() => save(conn.id)}
                className="w-full bg-transparent font-mono text-xs text-muted outline-none placeholder:text-muted-2"
              />
              <div className="flex items-center gap-2 border-t border-[var(--border)] pt-2">
                <span className="text-[10px] text-muted-2">Auth Token</span>
                <input
                  type="password"
                  placeholder={conn.hasSecret ? "•••••••• (salvo) — cole para trocar" : "Cole o token..."}
                  value={tokens[conn.id] ?? ""}
                  onChange={(e) => setTokens((prev) => ({ ...prev, [conn.id]: e.target.value }))}
                  onBlur={() => save(conn.id)}
                  className="min-w-0 flex-1 bg-transparent font-mono text-xs outline-none placeholder:text-muted-2"
                />
              </div>

              {/* Tabelas — só após a conexão ter url + token salvos */}
              {conn.persisted && conn.url && (conn.hasSecret || tokens[conn.id]) && (
                <TablesPicker
                  state={tablesByConn[conn.id]}
                  selected={conn.selected}
                  onLoad={() => loadTables(conn.id)}
                  onToggle={(t) => toggleTable(conn.id, t)}
                  onToggleAll={(names) => toggleAll(conn.id, names)}
                />
              )}
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

function TablesPicker({
  state,
  selected,
  onLoad,
  onToggle,
  onToggleAll,
}: {
  state: TablesState | undefined;
  selected: string[];
  onLoad: () => void;
  onToggle: (table: string) => void;
  onToggleAll: (names: string[]) => void;
}) {
  const tables = state?.tables ?? [];
  const names = tables.map((t) => t.name);
  const allSelected = names.length > 0 && names.every((n) => selected.includes(n));

  return (
    <div className="border-t border-[var(--border)] pt-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wider text-muted-2">
          Tabelas {selected.length > 0 && <span className="text-[var(--accent)]">· {selected.length} selecionada{selected.length > 1 ? "s" : ""}</span>}
        </span>
        <button
          onClick={onLoad}
          disabled={state?.loading}
          className="flex items-center gap-1 text-[11px] text-muted transition-colors hover:text-white disabled:opacity-50"
        >
          <Icon name="RefreshCcw" size={11} className={state?.loading ? "animate-spin" : ""} />
          {tables.length > 0 ? "Atualizar" : "Carregar tabelas"}
        </button>
      </div>

      {state?.error && <p className="mt-1.5 text-[11px] text-rose-400">{state.error}</p>}

      {tables.length > 0 && (
        <div className="mt-2 space-y-1">
          <button
            onClick={() => onToggleAll(names)}
            className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-white/[0.03]"
          >
            <span className={cn(
              "flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border",
              allSelected ? "border-[var(--accent)] bg-[var(--accent)]" : "border-[var(--border-strong)]"
            )}>
              {allSelected && <Icon name="Check" size={9} className="text-black" />}
            </span>
            <span className="text-[12px] font-medium text-muted">Selecionar todas</span>
          </button>
          {tables.map((t) => {
            const on = selected.includes(t.name);
            return (
              <button
                key={t.name}
                onClick={() => onToggle(t.name)}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-white/[0.03]"
              >
                <span className={cn(
                  "flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border",
                  on ? "border-[var(--accent)] bg-[var(--accent)]" : "border-[var(--border-strong)]"
                )}>
                  {on && <Icon name="Check" size={9} className="text-black" />}
                </span>
                <span className="flex-1 truncate font-mono text-[12px] text-white/85">{t.name}</span>
                <span className="shrink-0 text-[10px] text-muted-2">
                  {t.rowCount ?? "?"} linha{t.rowCount === 1 ? "" : "s"} · {t.columns.length} col
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function MaskedField({
  label,
  icon = "KeyRound",
  placeholder,
  value,
  onChange,
  showKey,
  onToggleShow,
}: {
  label: string;
  icon?: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  showKey?: boolean;
  onToggleShow?: () => void;
}) {
  const masked = showKey === undefined;
  return (
    <div>
      <label className="mb-1.5 flex items-center gap-1.5 text-xs text-muted">
        <Icon name={icon} size={12} /> {label}
      </label>
      <div className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 transition-colors focus-within:border-[var(--border-strong)]">
        <input
          type={masked || showKey ? "text" : "password"}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="min-w-0 flex-1 bg-transparent font-mono text-sm outline-none placeholder:text-muted-2"
        />
        {onToggleShow && (
          <button onClick={onToggleShow} className="shrink-0 text-xs text-muted hover:text-white">
            {showKey ? "ocultar" : "mostrar"}
          </button>
        )}
      </div>
    </div>
  );
}
