"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { WORKSPACES, type Workspace } from "@/lib/theme";
import { useWorkspace } from "@/lib/workspace-context";
import { PageTransition } from "@/components/shell/page-transition";
import { Topbar } from "@/components/shell/topbar";
import { GlassCard, Dot } from "@/components/ui/primitives";
import { WorkspaceBadge } from "@/components/shell/context-switcher";
import { Icon } from "@/components/ui/icon";
import { useToast } from "@/components/ui/toast";
import { CONNECTORS } from "@/lib/mock/integrations";
import { ConnectorsList } from "@/components/integrations/integrations-view";
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
  // Reusa a lista persistida real (mesma de /integrations), sem filtro de escopo.
  return <ConnectorsList />;
}
