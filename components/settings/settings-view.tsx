"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { WORKSPACES, type Workspace } from "@/lib/theme";
import { useWorkspace, getWorkspace } from "@/lib/workspace-context";
import { PageTransition } from "@/components/shell/page-transition";
import { Topbar } from "@/components/shell/topbar";
import { GlassCard, Dot } from "@/components/ui/primitives";
import { WorkspaceBadge } from "@/components/shell/context-switcher";
import { Icon } from "@/components/ui/icon";
import { useToast } from "@/components/ui/toast";
import { CONNECTORS, type Connector } from "@/lib/mock/integrations";
import { cn } from "@/lib/utils";

const MASKED = "sk-ant-••••••••••••••••••••••••";

const TABS = [
  { id: "branches",      label: "Branchs",     icon: "GitPullRequest" },
  { id: "integrations",  label: "Integrações",  icon: "Plug"           },
];

export function SettingsView() {
  const [tab, setTab] = useState<"branches" | "integrations">("branches");
  const { setHideContextSwitcher } = useWorkspace();

  useEffect(() => {
    setHideContextSwitcher(tab === "branches");
    return () => setHideContextSwitcher(false);
  }, [tab, setHideContextSwitcher]);

  return (
    <PageTransition>
      <Topbar title="Configurações" subtitle="Identidade, créditos e integrações de cada branch." />

      {/* Tab switcher */}
      <div className="mb-6 flex gap-1 w-fit">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id as typeof tab)}
            className={cn(
              "relative flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-medium transition-colors duration-150",
              tab === t.id ? "text-white" : "text-muted hover:text-white/70 hover:bg-white/[0.04]"
            )}
          >
            {tab === t.id && (
              <motion.span
                layoutId="settings-tab-pill"
                className="absolute inset-0 rounded-lg bg-[var(--surface-2)]"
                style={{ border: "1px solid var(--border-strong)" }}
                transition={{ type: "spring", stiffness: 400, damping: 30 }}
              />
            )}
            <span className="relative z-10 flex items-center gap-1.5">
              <Icon name={t.icon} size={13} strokeWidth={1.75} />
              {t.label}
            </span>
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {tab === "branches" && (
          <motion.div
            key="branches"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18 }}
          >
            <BranchesTab />
          </motion.div>
        )}
        {tab === "integrations" && (
          <motion.div
            key="integrations"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18 }}
          >
            <IntegrationsTab />
          </motion.div>
        )}
      </AnimatePresence>
    </PageTransition>
  );
}

function BranchesTab() {
  return (
    <div className="space-y-4">
      {WORKSPACES.map((w, i) => (
        <motion.div
          key={w.id}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08 + i * 0.08, ease: [0.25, 0.46, 0.45, 0.94] }}
        >
          <WorkspaceVault workspace={w} />
        </motion.div>
      ))}
    </div>
  );
}

const MOCK_STATS: Record<string, { tokensUsed: number; tokensLimit: number; costUsd: number; creditsUsd: number }> = {
  dux:     { tokensUsed: 1_240_000, tokensLimit: 5_000_000, costUsd: 18.60, creditsUsd: 50 },
  sheep:   { tokensUsed: 3_100_000, tokensLimit: 5_000_000, costUsd: 46.50, creditsUsd: 50 },
  pessoal: { tokensUsed: 420_000,   tokensLimit: 2_000_000, costUsd: 6.30,  creditsUsd: 20 },
};

function WorkspaceVault({ workspace: w }: { workspace: Workspace }) {
  const { toast } = useToast();
  const [show, setShow] = useState(false);
  const stats = MOCK_STATS[w.id] ?? MOCK_STATS.pessoal;
  const tokenPct = Math.round((stats.tokensUsed / stats.tokensLimit) * 100);
  const costPct   = Math.round((stats.costUsd / stats.creditsUsd) * 100);

  const totalIntegrations = CONNECTORS.filter((c) => c.scopes.includes(w.id as never)).length;
  const connectedIntegrations = CONNECTORS.filter((c) => c.scopes.includes(w.id as never) && c.connected).length;
  const integrationPct = totalIntegrations > 0 ? Math.round((connectedIntegrations / totalIntegrations) * 100) : 0;

  return (
    <GlassCard className="p-5" hover>
      {/* Header */}
      <div className="flex items-center gap-3">
        <WorkspaceBadge icon={w.icon} accent={w.accent} accent2={w.accent2} size={40} />
        <div className="flex-1">
          <h2 className="font-semibold">{w.name}</h2>
          <p className="text-xs text-muted-2">{w.tagline}</p>
        </div>
        <span className="flex items-center gap-1.5 rounded-full bg-[var(--surface)] px-3 py-1 text-[11px] text-muted">
          <Dot color={w.accent} size={7} /> identidade
        </span>
      </div>

      {/* API Key + Cor */}
      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
        <div>
          <label className="mb-1.5 flex items-center gap-1.5 text-xs text-muted">
            <Icon name="KeyRound" size={13} /> Claude API key
          </label>
          <div className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 transition-colors focus-within:border-[var(--border-strong)]">
            <input
              readOnly
              value={show ? "sk-ant-api03-x7Qd...DEMO" : MASKED}
              className="min-w-0 flex-1 bg-transparent font-mono text-sm outline-none"
            />
            <motion.button whileHover={{ scale: 1.05 }} onClick={() => setShow((s) => !s)} className="text-xs text-muted hover:text-white">
              {show ? "ocultar" : "mostrar"}
            </motion.button>
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-xs text-muted">Cor de acento</label>
          <div className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5">
            <motion.span whileHover={{ scale: 1.15 }} className="h-6 w-6 rounded-md shrink-0" style={{ background: `linear-gradient(135deg, ${w.accent}, ${w.accent2})` }} />
            <span className="font-mono text-sm text-muted">{w.accent}</span>
            <motion.button whileHover={{ x: 2 }} className="ml-auto text-xs text-muted hover:text-white">editar</motion.button>
          </div>
        </div>
      </div>

      {/* Créditos & Consumo */}
      <div className="mt-4 grid grid-cols-1 gap-3 border-t border-[var(--border)] pt-4 md:grid-cols-2">
        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-xs text-muted"><Icon name="Zap" size={12} /> Tokens este mês</span>
            <span className="text-[11px] text-muted-2">{(stats.tokensUsed / 1_000_000).toFixed(1)}M / {(stats.tokensLimit / 1_000_000).toFixed(0)}M</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-2)]">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${tokenPct}%` }}
              transition={{ duration: 0.8, ease: "easeOut" }}
              className="h-full rounded-full"
              style={{ background: `linear-gradient(90deg, ${w.accent}, ${w.accent2})` }}
            />
          </div>
          <p className="mt-1 text-[10px] text-muted-2">{tokenPct}% utilizado</p>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-xs text-muted"><Icon name="Activity" size={12} /> Créditos (USD)</span>
            <span className="text-[11px] text-muted-2">${stats.costUsd.toFixed(2)} / ${stats.creditsUsd.toFixed(0)}</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-2)]">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${costPct}%` }}
              transition={{ duration: 0.8, ease: "easeOut", delay: 0.1 }}
              className="h-full rounded-full"
              style={{ background: costPct > 80 ? "linear-gradient(90deg,#f59e0b,#ef4444)" : `linear-gradient(90deg, ${w.accent}, ${w.accent2})` }}
            />
          </div>
          <p className="mt-1 text-[10px] text-muted-2">{costPct}% dos créditos consumido</p>
        </div>
      </div>

      {/* Perfil de integração */}
      <div className="mt-3 flex items-center gap-3 rounded-xl bg-[var(--surface)] px-3 py-2.5">
        <Icon name="Plug" size={13} className="shrink-0 text-muted" />
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-[11px] text-muted">Perfil de integração</span>
            <span className="text-[11px] font-medium" style={{ color: integrationPct === 100 ? "#34d399" : w.accent }}>
              {connectedIntegrations}/{totalIntegrations} ativas · {integrationPct}%
            </span>
          </div>
          <div className="h-1 w-full overflow-hidden rounded-full bg-[var(--surface-2)]">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${integrationPct}%` }}
              transition={{ duration: 0.8, ease: "easeOut", delay: 0.2 }}
              className="h-full rounded-full"
              style={{ background: integrationPct === 100 ? "#34d399" : `linear-gradient(90deg, ${w.accent}, ${w.accent2})` }}
            />
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="mt-4 flex items-center justify-between border-t border-[var(--border)] pt-4">
        <span className="text-xs text-muted-2">Última verificação da chave: há 2 dias</span>
        <motion.button
          whileHover={{ scale: 1.05, boxShadow: `0 0 18px -5px ${w.accent}` }}
          whileTap={{ scale: 0.95 }}
          onClick={() => toast(`Identidade da ${w.name} salva`, "success")}
          className="rounded-full px-3.5 py-1.5 text-xs font-medium text-white"
          style={{ background: `linear-gradient(135deg, ${w.accent}, ${w.accent2})` }}
        >
          Salvar
        </motion.button>
      </div>
    </GlassCard>
  );
}

function IntegrationsTab() {
  const visible = CONNECTORS;
  const connected = visible.filter((c) => c.connected).length;
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <div>

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
              show:   { opacity: 1, y: 0, transition: { duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] } },
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
    </div>
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
  const { toast } = useToast();
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
          connected ? "bg-emerald-400/10 text-emerald-400" : "bg-white/[0.04] text-muted-2"
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
            <div className="space-y-4 border-t border-[var(--border)] px-4 py-4">
              {connector.category === "db" ? (
                <TursoConnections />
              ) : connector.category === "messaging" ? (
                <>
                  <SettingsMaskedField label="Account SID" placeholder="ACxxxxxxxxxxxxxxxx" />
                  <SettingsMaskedField label="Auth Token" placeholder="Cole o auth token..." />
                  <div>
                    <label className="mb-1.5 block text-xs text-muted">Número Twilio</label>
                    <div className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5">
                      <input type="text" placeholder="+55 11 9xxxx-xxxx" className="min-w-0 flex-1 bg-transparent font-mono text-sm outline-none placeholder:text-muted-2" />
                    </div>
                  </div>
                </>
              ) : (
                <div>
                  <label className="mb-1.5 flex items-center gap-1.5 text-xs text-muted">
                    <Icon name="KeyRound" size={12} /> Credencial / API Key
                  </label>
                  <div className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 transition-colors focus-within:border-[var(--border-strong)]">
                    <input
                      type={showKey ? "text" : "password"}
                      placeholder="Cole sua chave aqui..."
                      defaultValue={connected ? "sk-ant-api03-x7Qd...DEMO" : ""}
                      className="min-w-0 flex-1 bg-transparent font-mono text-sm outline-none placeholder:text-muted-2"
                    />
                    <button onClick={() => setShowKey((s) => !s)} className="shrink-0 text-xs text-muted hover:text-white">
                      {showKey ? "ocultar" : "mostrar"}
                    </button>
                  </div>
                </div>
              )}

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

              <div className="flex items-center justify-end gap-2 pt-1">
                {connected && (
                  <motion.button
                    whileHover={{ scale: 1.04 }}
                    whileTap={{ scale: 0.96 }}
                    onClick={() => { setConnected(false); toast(`${connector.name} desconectado`, "delete"); }}
                    className="rounded-full border border-[var(--border)] px-3.5 py-1.5 text-xs text-muted transition-colors hover:border-[var(--border-strong)] hover:text-white"
                  >
                    Desconectar
                  </motion.button>
                )}
                <motion.button
                  whileHover={{ scale: 1.04 }}
                  whileTap={{ scale: 0.96 }}
                  onClick={() => {
                    toast(
                      connected ? `${connector.name} atualizado` : `${connector.name} conectado`,
                      connected ? "edit" : "success",
                    );
                    setConnected(true);
                  }}
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
  const { toast } = useToast();
  const [conns, setConns] = useState<DbConnection[]>(INITIAL_CONNECTIONS);

  const add = () => {
    setConns((prev) => [...prev, { id: String(Date.now()), name: "", url: "", token: "" }]);
    toast("Conexão adicionada", "create");
  };

  const remove = (id: string) => {
    setConns((prev) => prev.filter((c) => c.id !== id));
    toast("Conexão removida", "delete");
  };

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

function SettingsMaskedField({ label, placeholder }: { label: string; placeholder: string }) {
  const [show, setShow] = useState(false);
  return (
    <div>
      <label className="mb-1.5 flex items-center gap-1.5 text-xs text-muted">
        <Icon name="KeyRound" size={12} /> {label}
      </label>
      <div className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 transition-colors focus-within:border-[var(--border-strong)]">
        <input
          type={show ? "text" : "password"}
          placeholder={placeholder}
          className="min-w-0 flex-1 bg-transparent font-mono text-sm outline-none placeholder:text-muted-2"
        />
        <button onClick={() => setShow((s) => !s)} className="shrink-0 text-xs text-muted hover:text-white">
          {show ? "ocultar" : "mostrar"}
        </button>
      </div>
    </div>
  );
}
