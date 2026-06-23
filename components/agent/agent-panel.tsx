"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useWorkspace } from "@/lib/workspace-context";
import { PageTransition } from "@/components/shell/page-transition";
import { Topbar } from "@/components/shell/topbar";
import { GlassCard } from "@/components/ui/primitives";
import { WorkspaceBadge } from "@/components/shell/context-switcher";
import { Icon } from "@/components/ui/icon";
import { SAMPLE_STEPS, SUGGESTED_PROMPTS, type StepStatus } from "@/lib/mock/agent-runs";
import { cn } from "@/lib/utils";

type Phase = "idle" | "running" | "done";

export function AgentPanel() {
  const { active, activeWorkspace: ws } = useWorkspace();

  const [prompt, setPrompt] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [statuses, setStatuses] = useState<StepStatus[]>(SAMPLE_STEPS.map(() => "pending"));
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const run = () => {
    if (!prompt.trim() || phase === "running") return;
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setPhase("running");
    setStatuses(SAMPLE_STEPS.map((_, i) => (i === 0 ? "working" : "pending")));

    SAMPLE_STEPS.forEach((_, i) => {
      const t = setTimeout(() => {
        setStatuses((prev) => {
          const next = [...prev];
          next[i] = "done";
          if (i + 1 < next.length) next[i + 1] = "working";
          return next;
        });
        if (i === SAMPLE_STEPS.length - 1) setPhase("done");
      }, (i + 1) * 850);
      timers.current.push(t);
    });
  };

  const reset = () => {
    timers.current.forEach(clearTimeout);
    setPhase("idle");
    setStatuses(SAMPLE_STEPS.map(() => "pending"));
    setPrompt("");
  };

  return (
    <PageTransition>
      <Topbar title="Agente" subtitle="Execute ações com Claude usando o token do branch ativo." />

      {/* Active token banner */}
      <motion.div
        key={active}
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="mb-5"
      >
        <GlassCard glow className="flex items-center gap-3 p-4">
          <WorkspaceBadge icon={ws.icon} accent={ws.accent} accent2={ws.accent2} size={40} />
          <div className="flex-1">
            <p className="text-sm font-medium">
              Executando como <span style={{ color: ws.accent }}>{ws.name}</span>
            </p>
            <p className="flex items-center gap-1.5 text-xs text-muted">
              <Icon name="KeyRound" size={12} /> {ws.tagline}
            </p>
          </div>
          <span className="flex items-center gap-2 rounded-full bg-[var(--surface-2)] px-3 py-1 text-xs text-muted">
            <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-emerald-400" style={{ color: "#34d399" }} />
            conectado
          </span>
        </GlassCard>
      </motion.div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        {/* Composer */}
        <GlassCard className="p-5 lg:col-span-3">
          <motion.div
            whileFocus={{ boxShadow: `0 0 0 1px ${ws.accent}40` }}
            className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3 transition-all duration-200 focus-within:border-[var(--border-strong)]"
          >
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="O que você quer que o agente faça neste branch?"
              rows={3}
              className="w-full resize-none bg-transparent text-sm outline-none placeholder:text-muted-2"
            />
            <div className="mt-2 flex items-center justify-between">
              <span className="text-[11px] text-muted-2">Ações ficam registradas no log</span>
              <div className="flex items-center gap-2">
                <AnimatePresence>
                  {phase !== "idle" && (
                    <motion.button
                      initial={{ opacity: 0, x: 8 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 8 }}
                      onClick={reset}
                      className="rounded-full px-3 py-2 text-sm text-muted hover:text-white"
                    >
                      Limpar
                    </motion.button>
                  )}
                </AnimatePresence>
                <motion.button
                  whileHover={{ scale: 1.04, boxShadow: `0 0 20px -5px ${ws.accent}` }}
                  whileTap={{ scale: 0.95 }}
                  onClick={run}
                  disabled={!prompt.trim() || phase === "running"}
                  className="flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
                  style={{ background: `linear-gradient(135deg, ${ws.accent}, ${ws.accent2})` }}
                >
                  <motion.span
                    animate={phase === "running" ? { rotate: 360 } : { rotate: 0 }}
                    transition={{ repeat: phase === "running" ? Infinity : 0, duration: 1.2, ease: "linear" }}
                  >
                    <Icon name="Sparkles" size={15} />
                  </motion.span>
                  {phase === "running" ? "Executando…" : "Gerar"}
                </motion.button>
              </div>
            </div>
          </motion.div>

          {/* Suggestions */}
          <AnimatePresence>
            {phase === "idle" && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="mt-4 overflow-hidden"
              >
                <p className="mb-2 text-xs text-muted-2">Sugestões</p>
                <div className="flex flex-wrap gap-2">
                  {SUGGESTED_PROMPTS.map((s, i) => (
                    <motion.button
                      key={s}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.06 }}
                      whileHover={{ y: -2, borderColor: "var(--border-strong)" }}
                      onClick={() => setPrompt(s)}
                      className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs text-muted transition-colors hover:text-white"
                    >
                      {s}
                    </motion.button>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Steps */}
          <AnimatePresence>
            {phase !== "idle" && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="mt-4 space-y-1.5"
              >
                {SAMPLE_STEPS.map((step, i) => (
                  <StepRow key={step.id} label={step.label} status={statuses[i]} accent={ws.accent} index={i} />
                ))}
                <AnimatePresence>
                  {phase === "done" && (
                    <motion.div
                      initial={{ opacity: 0, y: 8, scale: 0.97 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      transition={{ type: "spring", stiffness: 300 }}
                      className="mt-3 flex items-center gap-2 rounded-xl bg-[var(--surface)] px-3 py-2.5 text-sm"
                    >
                      <Icon name="CheckCircle2" size={16} style={{ color: ws.accent }} />
                      Execução concluída — 5 passos registrados no log.
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            )}
          </AnimatePresence>
        </GlassCard>

        {/* Capabilities */}
        <GlassCard className="p-5 lg:col-span-2" delay={0.1}>
          <h2 className="mb-3 font-semibold">O que o agente acessa</h2>
          <ul className="space-y-2">
            {[
              { icon: "KeyRound", t: "Token Claude do branch", d: ws.name },
              { icon: "HardDrive", t: "Google Drive", d: "pastas & arquivos" },
              { icon: "Table",    t: "Planilhas",     d: "leitura & escrita" },
              { icon: "Database", t: "Banco de dados",d: "consultas" },
            ].map((c, i) => (
              <motion.li
                key={c.t}
                initial={{ opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.15 + i * 0.07 }}
                whileHover={{ x: 4 }}
                className="flex items-center gap-3 rounded-xl bg-[var(--surface)] px-3 py-2.5"
              >
                <motion.span
                  whileHover={{ scale: 1.15, rotate: 8 }}
                  transition={{ type: "spring", stiffness: 400 }}
                  className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--surface-2)]"
                >
                  <Icon name={c.icon} size={15} style={{ color: ws.accent }} />
                </motion.span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm">{c.t}</p>
                  <p className="text-[11px] text-muted-2">{c.d}</p>
                </div>
              </motion.li>
            ))}
          </ul>
        </GlassCard>
      </div>
    </PageTransition>
  );
}

function StepRow({ label, status, accent, index }: { label: string; status: StepStatus; accent: string; index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.04 }}
      className={cn(
        "flex items-center gap-3 rounded-xl border border-[var(--border)] px-3 py-2.5 transition-colors duration-300",
        status === "working" ? "bg-[var(--surface-2)]" : "bg-[var(--surface)]",
      )}
    >
      <span className="shrink-0">
        <AnimatePresence mode="wait" initial={false}>
          {status === "done" && (
            <motion.span
              key="done"
              initial={{ scale: 0, rotate: -90 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: "spring", stiffness: 500, damping: 20 }}
              className="flex h-5 w-5 items-center justify-center rounded-full text-white"
              style={{ background: accent, boxShadow: `0 0 12px -2px ${accent}` }}
            >
              <Icon name="Check" size={12} strokeWidth={3} />
            </motion.span>
          )}
          {status === "working" && (
            <motion.span key="working" initial={{ scale: 0 }} animate={{ scale: 1 }} className="flex h-5 w-5 items-center justify-center">
              <ThinkingDots accent={accent} />
            </motion.span>
          )}
          {status === "pending" && (
            <motion.span key="pending" initial={{ scale: 0 }} animate={{ scale: 1 }} className="block h-5 w-5 rounded-full border-2 border-[var(--border-strong)]" />
          )}
        </AnimatePresence>
      </span>

      <span className={cn("flex-1 text-sm", status === "pending" && "text-muted-2")}>{label}</span>

      <AnimatePresence>
        {status === "working" && (
          <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-[11px]" style={{ color: accent }}>
            working…
          </motion.span>
        )}
        {status === "done" && (
          <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-[11px] text-muted-2">
            done
          </motion.span>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function ThinkingDots({ accent }: { accent: string }) {
  return (
    <span className="flex items-center gap-0.5">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-1 w-1 rounded-full"
          style={{ background: accent, animation: `thinking 1s ease-in-out ${i * 0.15}s infinite` }}
        />
      ))}
    </span>
  );
}
