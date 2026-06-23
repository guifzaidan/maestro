"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useWorkspace } from "@/lib/workspace-context";
import { ScopeFilter } from "@/components/shell/scope-filter";
import { Icon } from "@/components/ui/icon";
import { useToast } from "@/components/ui/toast";
import { CONNECTORS, type Connector } from "@/lib/mock/integrations";
import {
  fetchConnections,
  saveConnection,
  removeConnection,
  introspectConnection,
  importConnection,
  type ConnectionDTO,
  type IntrospectedTable,
} from "@/lib/connections-client";
import { autoDetectMapping, type TableMapping } from "@/lib/table-mapping";
import { cn } from "@/lib/utils";

/**
 * Lista de conectores persistida (fonte: API /connections). Renderizada na
 * aba Integrações das Configurações. `withScopeFilter` mostra o filtro de
 * contexto + contagem de ativas no topo.
 */
export function ConnectorsList({ withScopeFilter = false }: { withScopeFilter?: boolean }) {
  const { scope } = useWorkspace();
  const [persisted, setPersisted] = useState<ConnectionDTO[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);

  const reload = useCallback(() => {
    fetchConnections().then(setPersisted).catch(() => {});
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const visible =
    withScopeFilter && scope !== "all" ? CONNECTORS.filter((c) => c.scopes.includes(scope)) : CONNECTORS;

  // DB é a fonte da verdade quando há registro; senão cai no estado mock.
  const isConnected = (c: Connector) => {
    const row = persisted.find((p) => p.id === c.id);
    return row ? row.connected : c.connected;
  };
  const connected = visible.filter(isConnected).length;

  return (
    <>
      {withScopeFilter && (
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <ScopeFilter />
          <span className="shrink-0 text-xs text-muted-2">{connected} de {visible.length} ativas</span>
        </div>
      )}
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
    </>
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
    } catch (e) {
      toast(e instanceof Error ? e.message : "Falha ao salvar", "delete");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={cn("rounded-2xl", connected && "glow")}>
    <div className="glass rounded-2xl overflow-hidden">
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
    </div>
  );
}

type DbRow = {
  id: string;
  name: string;
  url: string;
  hasSecret: boolean;
  persisted: boolean;
  selected: string[];
  mappings: Record<string, TableMapping>;
};
type TablesState = { loading: boolean; error: string | null; tables: IntrospectedTable[] };

function rowsFromDTO(rows: ConnectionDTO[]): DbRow[] {
  return rows.map((r) => ({
    id: r.id,
    name: r.name ?? "",
    url: (r.config?.url as string) ?? "",
    hasSecret: r.hasSecret,
    persisted: true,
    selected: Array.isArray(r.config?.tables) ? (r.config!.tables as string[]) : [],
    mappings: (r.config?.mappings as Record<string, TableMapping>) ?? {},
  }));
}

function TursoConnections({ rows, onChanged }: { rows: ConnectionDTO[]; onChanged: () => void }) {
  const { toast } = useToast();
  const { active } = useWorkspace();
  const [conns, setConns] = useState<DbRow[]>(() => rowsFromDTO(rows));
  // importação em andamento por conexão
  const [importing, setImporting] = useState<Record<string, boolean>>({});
  // segredo (token) digitado por linha — só em memória até salvar
  const [tokens, setTokens] = useState<Record<string, string>>({});
  // tabelas introspeccionadas por conexão
  const [tablesByConn, setTablesByConn] = useState<Record<string, TablesState>>({});
  // seleção/mapeamento correntes por conexão — refs síncronos p/ evitar corrida em cliques rápidos
  const selRef = useRef<Record<string, string[]>>({});
  const mapRef = useRef<Record<string, Record<string, TableMapping>>>({});

  // Recarrega a lista quando a fonte persistida muda.
  useEffect(() => {
    const next = rowsFromDTO(rows);
    setConns(next);
    next.forEach((r) => {
      selRef.current[r.id] = r.selected;
      mapRef.current[r.id] = r.mappings;
    });
  }, [rows]);

  const add = () => {
    const id = crypto.randomUUID();
    selRef.current[id] = [];
    mapRef.current[id] = {};
    setConns((prev) => [...prev, { id, name: "", url: "", hasSecret: false, persisted: false, selected: [], mappings: {} }]);
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
        config: { url: c.url, tables: c.selected, mappings: c.mappings },
        secret: tokens[id] || undefined,
      });
      setConns((prev) => prev.map((x) => (x.id === id ? { ...c, persisted: true, hasSecret: x.hasSecret || !!tokens[id] } : x)));
      setTokens((prev) => ({ ...prev, [id]: "" }));
      onChanged();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Falha ao salvar conexão", "delete");
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
      const tables = res.tables ?? [];
      setTablesByConn((p) => ({ ...p, [id]: { loading: false, error: null, tables } }));
      // Para seleções já salvas sem mapeamento, deriva um agora.
      const selected = selRef.current[id] ?? [];
      const cur = mapRef.current[id] ?? {};
      const next = { ...cur };
      let changed = false;
      for (const name of selected) {
        if (!next[name]) {
          const t = tables.find((x) => x.name === name);
          if (t) { next[name] = autoDetectMapping(t.columns); changed = true; }
        }
      }
      if (changed) {
        mapRef.current[id] = next;
        setConns((prev) => prev.map((c) => (c.id === id ? { ...c, mappings: next } : c)));
        save(id, { mappings: next });
      }
    }
  };

  // Aplica nova seleção a partir dos refs síncronos (robusto a cliques rápidos).
  const applySelection = (id: string, selected: string[]) => {
    selRef.current[id] = selected;
    const tables = tablesByConn[id]?.tables ?? [];
    const cur = mapRef.current[id] ?? {};
    const mappings: Record<string, TableMapping> = {};
    for (const name of selected) {
      mappings[name] = cur[name] ?? autoDetectMapping(tables.find((x) => x.name === name)?.columns ?? []);
    }
    mapRef.current[id] = mappings;
    setConns((prev) => prev.map((c) => (c.id === id ? { ...c, selected, mappings } : c)));
    save(id, { selected, mappings });
  };

  // Override manual de um campo do mapeamento de uma tabela.
  const setMapping = (id: string, table: string, field: keyof TableMapping, value: string) => {
    const cur = mapRef.current[id] ?? {};
    const next = { ...cur, [table]: { ...cur[table], [field]: value || undefined } };
    mapRef.current[id] = next;
    setConns((prev) => prev.map((c) => (c.id === id ? { ...c, mappings: next } : c)));
    save(id, { mappings: next });
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

  const runImport = async (id: string) => {
    setImporting((p) => ({ ...p, [id]: true }));
    try {
      const { result, error } = await importConnection(id, active);
      if (error || !result) {
        toast(error ?? "Falha ao importar", "delete");
      } else {
        const parts = [`${result.imported} nova${result.imported === 1 ? "" : "s"}`, `${result.updated} atualizada${result.updated === 1 ? "" : "s"}`];
        toast(`Importado: ${parts.join(" · ")}`, "create");
        const failed = result.tables.filter((t) => t.error);
        if (failed.length) toast(`${failed.length} tabela(s) com erro`, "delete");
      }
    } finally {
      setImporting((p) => ({ ...p, [id]: false }));
    }
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
                  autoComplete="off"
                  value={conn.name}
                  onChange={(e) => setField(conn.id, "name", e.target.value)}
                  onBlur={() => save(conn.id)}
                  className="min-w-0 flex-1 bg-transparent text-sm font-medium outline-none placeholder:text-muted-2 [&:-webkit-autofill]:shadow-[inset_0_0_0_1000px_var(--surface)] [&:-webkit-autofill]:[-webkit-text-fill-color:white]"
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
                autoComplete="off"
                value={conn.url}
                onChange={(e) => setField(conn.id, "url", e.target.value)}
                onBlur={() => save(conn.id)}
                className="w-full bg-transparent font-mono text-xs text-muted outline-none placeholder:text-muted-2 [&:-webkit-autofill]:shadow-[inset_0_0_0_1000px_var(--surface)] [&:-webkit-autofill]:[-webkit-text-fill-color:theme(colors.zinc.400)]"
              />
              <div className="flex items-center gap-2 border-t border-[var(--border)] pt-2">
                <span className="text-[10px] text-muted-2">Auth Token</span>
                <input
                  type="password"
                  placeholder={conn.hasSecret ? "•••••••• (salvo) — cole para trocar" : "Cole o token..."}
                  autoComplete="new-password"
                  value={tokens[conn.id] ?? ""}
                  onChange={(e) => setTokens((prev) => ({ ...prev, [conn.id]: e.target.value }))}
                  onBlur={() => save(conn.id)}
                  className="min-w-0 flex-1 bg-transparent font-mono text-xs outline-none placeholder:text-muted-2 [&:-webkit-autofill]:shadow-[inset_0_0_0_1000px_var(--surface)] [&:-webkit-autofill]:[-webkit-text-fill-color:white]"
                />
              </div>

              {/* Tabelas — só após a conexão ter url + token salvos */}
              {conn.persisted && conn.url && (conn.hasSecret || tokens[conn.id]) && (
                <TablesPicker
                  state={tablesByConn[conn.id]}
                  selected={conn.selected}
                  mappings={conn.mappings}
                  onLoad={() => loadTables(conn.id)}
                  onToggle={(t) => toggleTable(conn.id, t)}
                  onToggleAll={(names) => toggleAll(conn.id, names)}
                  onMapping={(t, field, value) => setMapping(conn.id, t, field, value)}
                />
              )}

              {/* Importar/sincronizar — só com tabelas selecionadas */}
              {conn.persisted && conn.selected.length > 0 && (
                <div className="flex items-center justify-between border-t border-[var(--border)] pt-2">
                  <span className="text-[10px] text-muted-2">
                    Cria/atualiza tasks vinculadas em <span className="text-[var(--accent)]">{active}</span>
                  </span>
                  <motion.button
                    whileHover={{ scale: 1.04 }}
                    whileTap={{ scale: 0.96 }}
                    disabled={importing[conn.id]}
                    onClick={() => runImport(conn.id)}
                    className="flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-[11px] font-medium text-black disabled:opacity-50"
                  >
                    <Icon name={importing[conn.id] ? "Loader" : "Download"} size={11} className={importing[conn.id] ? "animate-spin" : ""} />
                    {importing[conn.id] ? "Importando..." : "Importar agora"}
                  </motion.button>
                </div>
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
  mappings,
  onLoad,
  onToggle,
  onToggleAll,
  onMapping,
}: {
  state: TablesState | undefined;
  selected: string[];
  mappings: Record<string, TableMapping>;
  onLoad: () => void;
  onToggle: (table: string) => void;
  onToggleAll: (names: string[]) => void;
  onMapping: (table: string, field: keyof TableMapping, value: string) => void;
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
              <div key={t.name}>
                <button
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
                <AnimatePresence initial={false}>
                  {on && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <MappingFields
                        columns={t.columns}
                        mapping={mappings[t.name] ?? {}}
                        onChange={(field, value) => onMapping(t.name, field, value)}
                      />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function MappingFields({
  columns,
  mapping,
  onChange,
}: {
  columns: { name: string; type: string; pk: boolean }[];
  mapping: TableMapping;
  onChange: (field: keyof TableMapping, value: string) => void;
}) {
  const opts = columns.map((c) => c.name);
  return (
    <div className="ml-6 mt-1 mb-1.5 grid grid-cols-3 gap-1.5">
      <MapSelect label="Título" value={mapping.title} options={opts} onChange={(v) => onChange("title", v)} />
      <MapSelect label="Data" value={mapping.date} options={opts} onChange={(v) => onChange("date", v)} />
      <MapSelect label="Status" value={mapping.status} options={opts} onChange={(v) => onChange("status", v)} />
    </div>
  );
}

function MapSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string | undefined;
  options: string[];
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onMouseDown = (e: MouseEvent) => {
      if (
        btnRef.current && !btnRef.current.contains(e.target as Node) &&
        listRef.current && !listRef.current.contains(e.target as Node)
      ) setOpen(false);
    };
    const onScroll = () => {
      if (btnRef.current) setRect(btnRef.current.getBoundingClientRect());
    };
    document.addEventListener("mousedown", onMouseDown);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open]);

  const toggle = () => {
    if (!open && btnRef.current) setRect(btnRef.current.getBoundingClientRect());
    setOpen((s) => !s);
  };

  const select = (v: string) => { onChange(v); setOpen(false); };

  return (
    <div className="flex flex-col gap-1">
      <span className="text-[9px] uppercase tracking-wider text-muted-2">{label}</span>
      <button
        ref={btnRef}
        type="button"
        onClick={toggle}
        className={cn(
          "flex w-full items-center justify-between gap-1 rounded-lg border px-2 py-1 font-mono text-[11px] transition-colors",
          open
            ? "border-[var(--border-strong)] bg-[var(--surface-2)] text-white/85"
            : "border-[var(--border)] bg-[var(--surface-2)] text-white/70 hover:border-[var(--border-strong)] hover:text-white/85"
        )}
      >
        <span className="truncate">{value || "—"}</span>
        <motion.span animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.15 }}>
          <Icon name="ChevronDown" size={10} className="shrink-0 text-muted-2" />
        </motion.span>
      </button>

      {open && rect && createPortal(
        <div
          ref={listRef}
          style={{
            position: "fixed",
            top: rect.bottom + 4,
            left: rect.left,
            width: Math.max(rect.width, 140),
            zIndex: 9999,
            maxHeight: 220,
          }}
          className="rounded-xl border border-[var(--border-strong)] bg-[var(--surface-2)] shadow-xl shadow-black/50 backdrop-blur-md overflow-y-auto"
        >
          <button
            type="button"
            onClick={() => select("")}
            className={cn(
              "flex w-full items-center px-3 py-2 text-left font-mono text-[11px] transition-colors hover:bg-white/[0.06]",
              !value ? "text-white/85" : "text-muted-2"
            )}
          >
            —
          </button>
          {options.map((o) => (
            <button
              key={o}
              type="button"
              onClick={() => select(o)}
              className={cn(
                "flex w-full items-center gap-2 px-3 py-2 text-left font-mono text-[11px] transition-colors hover:bg-white/[0.06]",
                value === o ? "text-[var(--accent)]" : "text-white/70"
              )}
            >
              {value === o && <Icon name="Check" size={9} className="shrink-0" />}
              <span className={cn("truncate", value !== o && "pl-[13px]")}>{o}</span>
            </button>
          ))}
        </div>,
        document.body
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
