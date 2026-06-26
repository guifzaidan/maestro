"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { Workspace } from "@/lib/theme";
import { useWorkspace } from "@/lib/workspace-context";
import { PageTransition } from "@/components/shell/page-transition";
import { Topbar } from "@/components/shell/topbar";
import { GlassCard, Dot } from "@/components/ui/primitives";
import { WorkspaceBadge } from "@/components/shell/context-switcher";
import { Icon } from "@/components/ui/icon";
import { useToast } from "@/components/ui/toast";
import { CONNECTORS } from "@/lib/mock/integrations";
import { ConnectorsList } from "@/components/integrations/integrations-view";
import { fetchConnections, type ConnectionDTO } from "@/lib/connections-client";
import { cn } from "@/lib/utils";

const MASKED = "sk-ant-••••••••••••••••••••••••";

const TABS = [
  { id: "branches",      label: "Branches",    icon: "GitPullRequest" },
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
  const { branches } = useWorkspace();
  return (
    <div className="space-y-4">
      {branches.map((w, i) => (
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

interface BranchStats { tokensUsed: number; tokensLimit: number; costUsd: number; creditsUsd: number }

const EMPTY_STATS: BranchStats = { tokensUsed: 0, tokensLimit: 5_000_000, costUsd: 0, creditsUsd: 50 };

/** #rrggbb → rgba(r, g, b, alpha) — gera o accentSoft a partir do accent. */
function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(full, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/** Seletor de cor compacto: swatch (abre o picker nativo) + hex. */
function ColorField({ value, onChange, title }: { value: string; onChange: (v: string) => void; title: string }) {
  return (
    <label className="flex cursor-pointer items-center gap-1.5" title={title}>
      <span className="relative h-6 w-6 shrink-0 overflow-hidden rounded-md border border-[var(--border-strong)]" style={{ background: value }}>
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="absolute -inset-2 cursor-pointer opacity-0"
        />
      </span>
      <span className="font-mono text-[11px] text-muted">{value}</span>
    </label>
  );
}

function WorkspaceVault({ workspace: w }: { workspace: Workspace }) {
  const { toast } = useToast();
  const { reloadBranches } = useWorkspace();
  const [show, setShow] = useState(false);
  const [tokenInput, setTokenInput] = useState("");
  const [saving, setSaving] = useState(false);
  // Cores editáveis (preview ao vivo); persistem ao salvar.
  const [accent, setAccent] = useState(w.accent);
  const [accent2, setAccent2] = useState(w.accent2);
  const [stats, setStats] = useState<BranchStats>(EMPTY_STATS);
  const [persisted, setPersisted] = useState<ConnectionDTO[]>([]);

  // Consumo REAL do mês (tokens + custo) — registrado a cada chamada do agente.
  useEffect(() => {
    fetch(`/api/branches/usage?branch=${encodeURIComponent(w.id)}`)
      .then((r) => r.json())
      .then((d) => { if (d && typeof d.tokensUsed === "number") setStats(d); })
      .catch(() => {});
  }, [w.id]);

  // Conexões reais da branch — para contar integrações ativas.
  useEffect(() => {
    fetchConnections(w.id).then(setPersisted).catch(() => {});
  }, [w.id]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/branches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: w.id, name: w.name, short: w.short, icon: w.icon,
          accent, accent2, accentSoft: hexToRgba(accent, 0.18), tagline: w.tagline,
          // Só envia token se o usuário digitou algo (senão preserva o salvo).
          ...(tokenInput.trim() ? { claudeToken: tokenInput.trim() } : {}),
        }),
      });
      if (!res.ok) throw new Error();
      const tokenChanged = !!tokenInput.trim();
      setTokenInput("");
      await reloadBranches();

      if (!tokenChanged) {
        toast(`Identidade da ${w.name} salva`, "success");
        return;
      }

      // Token novo → valida de verdade contra a API da Claude e dá feedback.
      const check = await fetch("/api/branches/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: w.id }),
      }).then((r) => r.json()).catch(() => ({ ok: false, error: "falha ao testar" }));

      if (check.ok) {
        toast(`Conectado à Claude · ${w.name}`, "success");
      } else {
        toast(`Token salvo, mas não conectou: ${check.error}`, "error");
      }
    } catch {
      toast("Falha ao salvar", "error");
    } finally {
      setSaving(false);
    }
  };
  const tokenPct = Math.round((stats.tokensUsed / stats.tokensLimit) * 100);
  const costPct   = Math.round((stats.costUsd / stats.creditsUsd) * 100);

  // Integrações disponíveis (catálogo) e ativas DE VERDADE nesta branch.
  const scoped = CONNECTORS.filter((c) => c.scopes.includes(w.id));
  const isActive = (c: (typeof CONNECTORS)[number]) =>
    c.category === "db"
      ? persisted.some((p) => p.connector === c.id) // banco: ao menos uma conexão salva
      : !!persisted.find((p) => p.id === `${c.id}--${w.id}`)?.connected; // não-db: toggle conectado
  const totalIntegrations = scoped.length;
  const connectedIntegrations = scoped.filter(isActive).length;
  const integrationPct = totalIntegrations > 0 ? Math.round((connectedIntegrations / totalIntegrations) * 100) : 0;

  return (
    <GlassCard className="p-5" hover>
      {/* Header */}
      <div className="flex items-center gap-3">
        <WorkspaceBadge icon={w.icon} accent={accent} accent2={accent2} size={40} />
        <div className="flex-1">
          <h2 className="font-semibold">{w.name}</h2>
          <p className="text-xs text-muted-2">{w.tagline}</p>
        </div>
        <span className="flex items-center gap-1.5 rounded-full bg-[var(--surface)] px-3 py-1 text-[11px] text-muted">
          <Dot color={accent} size={7} /> identidade
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
              type={show ? "text" : "password"}
              value={tokenInput}
              onChange={(e) => setTokenInput(e.target.value)}
              placeholder={w.hasToken ? `${MASKED} — cole para trocar` : "sk-ant-api03-..."}
              spellCheck={false}
              autoComplete="off"
              className="min-w-0 flex-1 bg-transparent font-mono text-sm outline-none placeholder:text-muted-2"
            />
            {w.hasToken && !tokenInput && (
              <span className="flex items-center gap-1 text-[10px] text-emerald-400/80" title="Token salvo e cifrado">
                <Icon name="Shield" size={12} /> salvo
              </span>
            )}
            {tokenInput && (
              <motion.button whileHover={{ scale: 1.05 }} type="button" onClick={() => setShow((s) => !s)} className="text-xs text-muted hover:text-white">
                {show ? "ocultar" : "mostrar"}
              </motion.button>
            )}
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-xs text-muted">Cores de acento</label>
          <div className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5">
            <span className="h-6 w-6 shrink-0 rounded-md" style={{ background: `linear-gradient(135deg, ${accent}, ${accent2})` }} />
            <ColorField value={accent} onChange={setAccent} title="Cor primária" />
            <ColorField value={accent2} onChange={setAccent2} title="Cor secundária" />
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
              style={{ background: `linear-gradient(90deg, ${accent}, ${accent2})` }}
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
              style={{ background: costPct > 80 ? "linear-gradient(90deg,#f59e0b,#ef4444)" : `linear-gradient(90deg, ${accent}, ${accent2})` }}
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
            <span className="text-[11px] font-medium" style={{ color: integrationPct === 100 ? "#34d399" : accent }}>
              {connectedIntegrations}/{totalIntegrations} ativas · {integrationPct}%
            </span>
          </div>
          <div className="h-1 w-full overflow-hidden rounded-full bg-[var(--surface-2)]">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${integrationPct}%` }}
              transition={{ duration: 0.8, ease: "easeOut", delay: 0.2 }}
              className="h-full rounded-full"
              style={{ background: integrationPct === 100 ? "#34d399" : `linear-gradient(90deg, ${accent}, ${accent2})` }}
            />
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="mt-4 flex items-center justify-between border-t border-[var(--border)] pt-4">
        <span className="text-xs text-muted-2">
          {w.hasToken ? "Token Claude cifrado no banco" : "Nenhum token Claude configurado"}
        </span>
        <motion.button
          whileHover={{ scale: saving ? 1 : 1.05, boxShadow: saving ? undefined : `0 0 18px -5px ${accent}` }}
          whileTap={{ scale: saving ? 1 : 0.95 }}
          onClick={handleSave}
          disabled={saving}
          className="rounded-full px-3.5 py-1.5 text-xs font-medium text-white disabled:opacity-50"
          style={{ background: `linear-gradient(135deg, ${accent}, ${accent2})` }}
        >
          {saving ? "Salvando…" : "Salvar"}
        </motion.button>
      </div>
    </GlassCard>
  );
}

function IntegrationsTab() {
  // Reusa a lista persistida real (mesma de /integrations), sem filtro de escopo.
  return <ConnectorsList />;
}
