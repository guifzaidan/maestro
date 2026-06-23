"use client";

import { motion } from "framer-motion";
import { useWorkspace, getWorkspace } from "@/lib/workspace-context";
import { PageTransition } from "@/components/shell/page-transition";
import { Topbar } from "@/components/shell/topbar";
import { ScopeFilter } from "@/components/shell/scope-filter";
import { GlassCard, Dot, ProgressBar } from "@/components/ui/primitives";
import { Sparkline } from "@/components/ui/sparkline";
import { Icon } from "@/components/ui/icon";
import { TASKS } from "@/lib/mock/tasks";
import { ACTIVITY, SPARK_TASKS, SPARK_AGENT } from "@/lib/mock/activity";
import { RECENT_RUNS } from "@/lib/mock/agent-runs";

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07 } },
};
const fadeUp = {
  hidden: { opacity: 0, y: 18 },
  show:   { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.25,0.46,0.45,0.94] } },
};

export function DashboardView() {
  const { scope } = useWorkspace();

  const tasks    = scope === "all" ? TASKS    : TASKS.filter((t) => t.workspace === scope);
  const activity = scope === "all" ? ACTIVITY : ACTIVITY.filter((a) => a.workspace === scope);

  const open         = tasks.filter((t) => !t.done).length;
  const doneToday    = tasks.filter((t) => t.done).length;
  const agentActions = scope === "all" ? 14 : 5;

  return (
    <PageTransition>
      <Topbar title="Dashboard" subtitle="Visão unificada de tarefas, agentes e integrações." />

      <div className="mb-6 flex items-center justify-between">
        <ScopeFilter />
        <span className="text-xs text-muted-2">Atualizado há instantes</span>
      </div>

      {/* Metric cards */}
      <motion.div
        variants={stagger}
        initial="hidden"
        animate="show"
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
      >
        <motion.div variants={fadeUp}>
          <MetricCard label="Tarefas abertas"  value={open}         icon="ListTodo"   spark={SPARK_TASKS} delta="+3 esta semana" />
        </motion.div>
        <motion.div variants={fadeUp}>
          <MetricCard label="Ações do agente"  value={agentActions} icon="Sparkles"   spark={SPARK_AGENT} delta="+8 esta semana" />
        </motion.div>
        <motion.div variants={fadeUp}>
          <GlassCard className="p-5" hover>
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted">Concluídas</p>
              <Icon name="CheckCircle2" size={18} style={{ color: "var(--accent)" }} />
            </div>
            <p className="mt-3 text-3xl font-bold tracking-tight">{doneToday}</p>
            <div className="mt-4">
              <ProgressBar value={doneToday} max={Math.max(open + doneToday, 1)} />
            </div>
            <p className="mt-2 text-xs text-muted-2">de {open + doneToday} no período</p>
          </GlassCard>
        </motion.div>
      </motion.div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Activity feed */}
        <GlassCard className="p-5 lg:col-span-2" delay={0.15}>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-semibold">Atividade recente</h2>
            <motion.button
              whileHover={{ x: 3 }}
              className="flex items-center gap-1 text-xs text-muted hover:text-white"
            >
              Ver tudo <Icon name="ChevronRight" size={14} />
            </motion.button>
          </div>
          <motion.ul
            variants={stagger}
            initial="hidden"
            animate="show"
            className="space-y-1"
          >
            {activity.map((a) => {
              const ws = getWorkspace(a.workspace);
              return (
                <motion.li
                  key={a.id}
                  variants={fadeUp}
                  whileHover={{ x: 4, backgroundColor: "var(--surface-hover)" }}
                  transition={{ duration: 0.15 }}
                  className="flex items-center gap-3 rounded-xl px-3 py-2.5"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--surface-2)]">
                    <Icon name={a.icon} size={16} style={{ color: ws.accent }} />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm">{a.text}</span>
                  <Dot color={ws.accent} size={7} />
                  <span className="w-20 shrink-0 text-right text-xs text-muted-2">{a.time}</span>
                </motion.li>
              );
            })}
          </motion.ul>
        </GlassCard>

        {/* Agent quick status */}
        <GlassCard className="p-5" delay={0.2}>
          <div className="mb-4 flex items-center gap-2">
            <Icon name="Bot" size={18} style={{ color: "var(--accent)" }} />
            <h2 className="font-semibold">Últimas execuções</h2>
          </div>
          <div className="space-y-3">
            {RECENT_RUNS.map((run, i) => {
              const ws = getWorkspace(run.workspace);
              const done = run.steps.filter((s) => s.status === "done").length;
              return (
                <motion.div
                  key={run.id}
                  initial={{ opacity: 0, x: 12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.25 + i * 0.1 }}
                  whileHover={{ scale: 1.02 }}
                  className="rounded-xl bg-[var(--surface)] p-3"
                >
                  <div className="mb-2 flex items-center gap-2">
                    <Dot color={ws.accent} size={7} pulse />
                    <span className="text-[11px] font-medium text-muted">{ws.name}</span>
                  </div>
                  <p className="mb-2 line-clamp-2 text-sm">{run.prompt}</p>
                  <ProgressBar value={done} max={run.steps.length} color={ws.accent} />
                  <p className="mt-1.5 text-[11px] text-muted-2">{done}/{run.steps.length} passos</p>
                </motion.div>
              );
            })}
          </div>
        </GlassCard>
      </div>
    </PageTransition>
  );
}

function MetricCard({
  label, value, icon, spark, delta,
}: {
  label: string; value: number; icon: string; spark: number[]; delta: string;
}) {
  return (
    <GlassCard className="p-5" hover>
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted">{label}</p>
        <motion.span whileHover={{ rotate: 15, scale: 1.15 }} transition={{ type: "spring", stiffness: 400 }}>
          <Icon name={icon} size={18} style={{ color: "var(--accent)" }} />
        </motion.span>
      </div>
      <div className="mt-3 flex items-end justify-between">
        <div>
          <motion.p
            initial={{ opacity: 0, scale: 0.7 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: "spring", stiffness: 300, delay: 0.1 }}
            className="text-3xl font-bold tracking-tight"
          >
            {value}
          </motion.p>
          <p className="mt-1 flex items-center gap-1 text-xs" style={{ color: "var(--accent)" }}>
            <Icon name="ArrowUpRight" size={13} /> {delta}
          </p>
        </div>
        <Sparkline data={spark} />
      </div>
    </GlassCard>
  );
}
