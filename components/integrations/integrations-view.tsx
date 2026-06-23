"use client";

import { useState, useId } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useWorkspace, getWorkspace } from "@/lib/workspace-context";
import { PageTransition } from "@/components/shell/page-transition";
import { Topbar } from "@/components/shell/topbar";
import { ScopeFilter } from "@/components/shell/scope-filter";
import { Dot } from "@/components/ui/primitives";
import { Icon } from "@/components/ui/icon";
import { CONNECTORS, type Connector } from "@/lib/mock/integrations";
import { cn } from "@/lib/utils";

export function IntegrationsView() {
  const { scope } = useWorkspace();
  const visible = scope === "all" ? CONNECTORS : CONNECTORS.filter((c) => c.scopes.includes(scope));
  const connected = visible.filter((c) => c.connected).length;
  const [openId, setOpenId] = useState<string | null>(null);

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
              open={openId === c.id}
              onToggle={() => setOpenId(openId === c.id ? null : c.id)}
            />
          </motion.div>
        ))}
      </motion.div>
    </PageTransition>
  );
}

function ConnectorCard({
  connector,
  open,
  onToggle,
}: {
  connector: Connector;
  open: boolean;
  onToggle: () => void;
}) {
  const [connected, setConnected] = useState(connector.connected);
  const [showKey, setShowKey] = useState(false);

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
              {connector.category === "db" ? (
                <TursoConnections />
              ) : connector.category === "messaging" ? (
                <>
                  <MaskedField label="Account SID" icon="KeyRound" placeholder="ACxxxxxxxxxxxxxxxx" />
                  <MaskedField label="Auth Token" icon="KeyRound" placeholder="Cole o auth token..." />
                  <div>
                    <label className="mb-1.5 block text-xs text-muted">Número Twilio</label>
                    <div className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5">
                      <input
                        type="text"
                        placeholder="+55 11 9xxxx-xxxx"
                        className="min-w-0 flex-1 bg-transparent font-mono text-sm outline-none placeholder:text-muted-2"
                      />
                    </div>
                  </div>
                </>
              ) : (
                <MaskedField
                  label="Credencial / API Key"
                  icon="KeyRound"
                  placeholder="Cole sua chave aqui..."
                  defaultValue={connected ? "sk-ant-api03-x7Qd...DEMO" : ""}
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

              {/* Actions */}
              <div className="flex items-center justify-end gap-2 pt-1">
                {connected && (
                  <motion.button
                    whileHover={{ scale: 1.04 }}
                    whileTap={{ scale: 0.96 }}
                    onClick={() => setConnected(false)}
                    className="rounded-full border border-[var(--border)] px-3.5 py-1.5 text-xs text-muted transition-colors hover:border-[var(--border-strong)] hover:text-white"
                  >
                    Desconectar
                  </motion.button>
                )}
                <motion.button
                  whileHover={{ scale: 1.04 }}
                  whileTap={{ scale: 0.96 }}
                  onClick={() => setConnected(true)}
                  className="rounded-full bg-white px-3.5 py-1.5 text-xs font-medium text-black"
                >
                  {connected ? "Salvar" : "Conectar"}
                </motion.button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

type DbConnection = { id: string; name: string; url: string; token: string };

const INITIAL_CONNECTIONS: DbConnection[] = [
  { id: "1", name: "Sheep Production", url: "libsql://sheep-prod.turso.io", token: "eyJhbGci...DEMO" },
];

function TursoConnections() {
  const [conns, setConns] = useState<DbConnection[]>(INITIAL_CONNECTIONS);

  const add = () =>
    setConns((prev) => [...prev, { id: String(Date.now()), name: "", url: "", token: "" }]);

  const remove = (id: string) => setConns((prev) => prev.filter((c) => c.id !== id));

  const update = (id: string, field: keyof DbConnection, value: string) =>
    setConns((prev) => prev.map((c) => (c.id === id ? { ...c, [field]: value } : c)));

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
                  defaultValue={conn.name}
                  onChange={(e) => update(conn.id, "name", e.target.value)}
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
                defaultValue={conn.url}
                onChange={(e) => update(conn.id, "url", e.target.value)}
                className="w-full bg-transparent font-mono text-xs text-muted outline-none placeholder:text-muted-2"
              />
              <div className="flex items-center gap-2 border-t border-[var(--border)] pt-2">
                <span className="text-[10px] text-muted-2">Auth Token</span>
                <input
                  type="password"
                  placeholder="Cole o token..."
                  defaultValue={conn.token}
                  onChange={(e) => update(conn.id, "token", e.target.value)}
                  className="min-w-0 flex-1 bg-transparent font-mono text-xs outline-none placeholder:text-muted-2"
                />
              </div>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

function MaskedField({
  label,
  icon = "KeyRound",
  placeholder,
  defaultValue = "",
  showKey,
  onToggleShow,
}: {
  label: string;
  icon?: string;
  placeholder: string;
  defaultValue?: string;
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
          defaultValue={defaultValue}
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
