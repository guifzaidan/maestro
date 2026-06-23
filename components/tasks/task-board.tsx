"use client";

import { useState, useEffect, useRef } from "react";
import { DatePicker } from "@/components/ui/date-picker";
import { AnimatePresence, motion, type Variants } from "framer-motion";
import { useWorkspace, getWorkspace, WORKSPACES } from "@/lib/workspace-context";
import { WorkspaceDot } from "@/components/shell/header";
import { PageTransition } from "@/components/shell/page-transition";
import { Topbar } from "@/components/shell/topbar";
import { Icon } from "@/components/ui/icon";
import { Loader } from "@/components/ui/loader";
import { useToast } from "@/components/ui/toast";
import { TASK_LISTS, TODAY_LIST, type Task, type TaskList } from "@/lib/mock/tasks";
import type { WorkspaceId } from "@/lib/theme";
import { cn } from "@/lib/utils";

type View = "hoje" | "semana" | "mes";

const VALID_LISTS: TaskList[] = ["seg", "ter", "qua", "qui", "sex", "sab", "dom"];

interface DbTaskRow {
  id: string;
  title: string;
  workspace: string;
  list: string | null;
  done: boolean;
  due: string | null;
  instruction: string | null;
}

/** Mapeia uma linha do banco para o formato que a board usa. Sem dia → hoje. */
function toBoardTask(row: DbTaskRow): Task {
  const list = (row.list && VALID_LISTS.includes(row.list as TaskList) ? row.list : TODAY_LIST) as TaskList;
  return {
    id: row.id,
    title: row.title,
    workspace: row.workspace as WorkspaceId,
    list,
    done: row.done,
    due: row.due ?? undefined,
    description: row.instruction ?? undefined,
  };
}

const VIEWS: { id: View; label: string; icon: string }[] = [
  { id: "hoje",  label: "Hoje",   icon: "Clock" },
  { id: "semana",label: "Semana", icon: "CalendarRange" },
  { id: "mes",   label: "Mês",    icon: "Grid3x3" },
];

const itemAnim: Variants = {
  hidden: { opacity: 0, y: 6 },
  show:   { opacity: 1, y: 0, transition: { duration: 0.22, ease: [0.25,0.46,0.45,0.94] as [number,number,number,number] } },
};

export function TaskBoard() {
  const { active, allBranches } = useWorkspace();
  const { toast } = useToast();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>("semana");
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string } | null>(null);
  const [editTarget, setEditTarget] = useState<Task | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/tasks")
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        setTasks((data.tasks ?? []).map(toBoardTask));
      })
      .catch(() => {})
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, []);

  const toggle = (id: string) => {
    let next = false;
    setTasks((prev) => prev.map((t) => {
      if (t.id !== id) return t;
      next = !t.done;
      return { ...t, done: next };
    }));
    fetch("/api/tasks", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, done: next }),
    }).catch(() => {});
  };

  const removeTask = (id: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== id));
    setDeleteTarget(null);
    fetch("/api/tasks", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id }),
    }).catch(() => {});
    toast("Tarefa excluída", "delete");
  };

  const requestDelete = (id: string, title: string) => setDeleteTarget({ id, title });

  const editTask = (id: string, title: string) => {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, title } : t)));
    fetch("/api/tasks", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, title }),
    }).catch(() => {});
    toast("Tarefa atualizada", "edit");
  };

  const saveTaskEdit = (id: string, fields: { title: string; due?: string; description?: string; workspace?: WorkspaceId }) => {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...fields } : t)));
    setEditTarget(null);
    fetch("/api/tasks", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, title: fields.title, due: fields.due ?? null, instruction: fields.description ?? null, workspace: fields.workspace ?? null }),
    }).catch(() => {});
    toast("Tarefa atualizada", "edit");
  };

  const addTask = async (list: TaskList, title: string, due: string) => {
    const trimmed = title.trim();
    if (!trimmed) return;
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: trimmed, workspace: active, list, due }),
      });
      const data = await res.json();
      if (data.task) {
        setTasks((prev) => [...prev, toBoardTask(data.task)]);
        toast("Tarefa criada", "create");
      }
    } catch {
      /* ignore */
    }
  };

  const visible = allBranches ? tasks : tasks.filter((t) => t.workspace === active);

  return (
    <PageTransition>
      <div className="mb-6">
        <Topbar
          title="Tarefas"
          subtitle={allBranches ? "Tarefas de todas as branches reunidas." : "Tarefas do branch ativo — troque pelo seletor no topo."}
        />
      </div>

      {/* Tab switcher + alternância de escopo (branch ativo ↔ todas) */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1">
          {VIEWS.map((v) => (
            <button
              key={v.id}
              onClick={() => setView(v.id)}
              title={v.label}
              className={cn(
                "relative flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-medium transition-colors duration-150",
                view === v.id ? "text-white" : "text-muted hover:text-white/70 hover:bg-white/[0.04]"
              )}
            >
              {view === v.id && (
                <motion.span
                  layoutId="tab-pill"
                  className="absolute inset-0 rounded-lg bg-[var(--surface-2)]"
                  style={{ border: "1px solid var(--border-strong)" }}
                  transition={{ type: "spring", stiffness: 400, damping: 30 }}
                />
              )}
              <Icon name={v.icon} size={13} strokeWidth={1.75} className="relative z-10 shrink-0" />
              <span className="relative z-10">{v.label}</span>
            </button>
          ))}
        </div>

      </div>

      {loading && (
        <div className="py-16">
          <Loader label="Carregando tarefas…" />
        </div>
      )}

      <AnimatePresence>
        {deleteTarget && (
          <ConfirmDeleteModal
            title={deleteTarget.title}
            onConfirm={() => removeTask(deleteTarget.id)}
            onCancel={() => setDeleteTarget(null)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {editTarget && (
          <EditTaskModal
            task={editTarget}
            onSave={(fields) => saveTaskEdit(editTarget.id, fields)}
            onCancel={() => setEditTarget(null)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence mode="wait">
        {!loading && view === "hoje" && (
          <motion.div key="hoje" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.2 }}>
            <HojeView tasks={visible.filter((t) => t.list === TODAY_LIST)} onToggle={toggle} onAdd={addTask} onDelete={requestDelete} onEdit={editTask} onOpenEdit={setEditTarget} showBranch={allBranches} />
          </motion.div>
        )}
        {!loading && view === "semana" && (
          <motion.div key="semana" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.2 }}>
            <SemanaView tasks={visible} onToggle={toggle} onAdd={addTask} onDelete={requestDelete} onEdit={editTask} onOpenEdit={setEditTarget} showBranch={allBranches} />
          </motion.div>
        )}
        {!loading && view === "mes" && (
          <motion.div key="mes" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.2 }}>
            <MesView tasks={visible} onToggle={toggle} onAdd={addTask} onDelete={requestDelete} onEdit={editTask} onOpenEdit={setEditTarget} showBranch={allBranches} />
          </motion.div>
        )}
      </AnimatePresence>
    </PageTransition>
  );
}

/* ── Inline add row ───────────────────────────────────────────── */
function AddRow({ onAdd }: { onAdd: (title: string) => void }) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");

  const submit = () => {
    const t = draft.trim();
    if (t) onAdd(t);
    setDraft("");
    setAdding(false);
  };

  if (!adding) {
    return (
      <motion.button
        whileHover={{ x: 2 }}
        onClick={() => setAdding(true)}
        className="mt-1 flex cursor-pointer items-center gap-3 rounded-lg py-1.5 pl-1 text-[11px] text-muted-2 transition-colors hover:text-muted"
      >
        <Icon name="Plus" size={12} strokeWidth={2} />
        Adicionar
      </motion.button>
    );
  }

  return (
    <div className="mt-1 flex items-center gap-2 py-1 pl-9">
      <Icon name="Plus" size={12} strokeWidth={2} className="shrink-0 text-muted-2" />
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); submit(); }
          if (e.key === "Escape") { setDraft(""); setAdding(false); }
        }}
        onBlur={submit}
        placeholder="Nova tarefa…"
        className="flex-1 bg-transparent text-[13px] text-white/80 outline-none placeholder:text-muted-2"
      />
    </div>
  );
}

/* ── Hoje ─────────────────────────────────────────────────────── */
function HojeView({ tasks, onToggle, onAdd, onDelete, onEdit, onOpenEdit, showBranch }: { tasks: Task[]; onToggle: (id: string) => void; onAdd: (list: TaskList, title: string, due: string) => void; onDelete: (id: string, title: string) => void; onEdit: (id: string, title: string) => void; onOpenEdit: (task: Task) => void; showBranch: boolean }) {
  const done = tasks.filter((t) => t.done).length;
  return (
    <div>
      <p className="mb-4 text-[11px] text-muted-2 uppercase tracking-widest">
        {done}/{tasks.length} concluídas
      </p>
      {tasks.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-2">Nenhuma tarefa para hoje.</p>
      ) : (
        <motion.div
          initial="hidden"
          animate="show"
          variants={{ show: { transition: { staggerChildren: 0.05 } } }}
          className="flex flex-col gap-1.5"
        >
          {tasks.map((task) => (
            <motion.div key={task.id} variants={itemAnim} layout>
              <TaskRow task={task} onToggle={onToggle} onDelete={onDelete} onEdit={onEdit} onOpenEdit={onOpenEdit} showBranch={showBranch} />
            </motion.div>
          ))}
        </motion.div>
      )}
      <AddRow onAdd={(title) => onAdd(TODAY_LIST, title, fmtDate(new Date()))} />
    </div>
  );
}

/* ── Semana ───────────────────────────────────────────────────── */
function SemanaView({ tasks, onToggle, onAdd, onDelete, onEdit, onOpenEdit, showBranch }: { tasks: Task[]; onToggle: (id: string) => void; onAdd: (list: TaskList, title: string, due: string) => void; onDelete: (id: string, title: string) => void; onEdit: (id: string, title: string) => void; onOpenEdit: (task: Task) => void; showBranch: boolean }) {
  return (
    <div className="flex flex-col">
      {TASK_LISTS.map((list, colIdx) => {
        const isToday = list.id === TODAY_LIST;
        const dayTasks = tasks.filter((t) => t.list === list.id);
        return (
          <DaySection
            key={list.id}
            list={list.id}
            label={list.short}
            isToday={isToday}
            tasks={dayTasks}
            onToggle={onToggle}
            onAdd={onAdd}
            onDelete={onDelete}
            onEdit={onEdit}
            onOpenEdit={onOpenEdit}
            colIdx={colIdx}
            showBranch={showBranch}
          />
        );
      })}
    </div>
  );
}

/* ── Mês ──────────────────────────────────────────────────────── */
const DAY_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const MONTH_NAMES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

// Mock: distribute tasks into days based on list (week days → day of month offset)
const LIST_TO_DAY_OFFSET: Record<TaskList, number> = {
  seg: 0, ter: 1, qua: 2, qui: 3, sex: 4, sab: 5, dom: 6,
};

const MONTH_SHORT = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

const DOW_TO_LIST: Record<number, TaskList> = { 0: "dom", 1: "seg", 2: "ter", 3: "qua", 4: "qui", 5: "sex", 6: "sab" };

/** Formata uma data como dd/mm/yyyy (mesmo formato do DatePicker). */
const fmtDate = (d: Date) =>
  `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;

/** Data do dia da semana (seg..dom) na semana corrente — semana começa na segunda. */
function dateForList(list: TaskList): Date {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const monday = now.getDate() - ((now.getDay() + 6) % 7);
  return new Date(now.getFullYear(), now.getMonth(), monday + LIST_TO_DAY_OFFSET[list]);
}

function MesView({ tasks, onToggle, onAdd, onDelete, onEdit, onOpenEdit, showBranch }: { tasks: Task[]; onToggle: (id: string) => void; onAdd: (list: TaskList, title: string, due: string) => void; onDelete: (id: string, title: string) => void; onEdit: (id: string, title: string) => void; onOpenEdit: (task: Task) => void; showBranch: boolean }) {
  const [selected, setSelected] = useState<number | null>(null);
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [dropYear, setDropYear] = useState(now.getFullYear());

  const todayDate = now.getDate();
  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth();

  const firstDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const prev = () => { if (month === 0) { setMonth(11); setYear(y => y - 1); } else setMonth(m => m - 1); setSelected(null); };
  const next = () => { if (month === 11) { setMonth(0); setYear(y => y + 1); } else setMonth(m => m + 1); setSelected(null); };
  const goToday = () => { setYear(now.getFullYear()); setMonth(now.getMonth()); setSelected(null); };

  const selectMonth = (m: number) => { setMonth(m); setYear(dropYear); setSelected(null); setDropdownOpen(false); };

  // Map tasks to day-of-month (mock: use list offset relative to current week start)
  const tasksByDay: Record<number, Task[]> = {};
  if (isCurrentMonth) {
    const weekStart = todayDate - ((now.getDay() + 6) % 7);
    tasks.forEach((t) => {
      const offset = LIST_TO_DAY_OFFSET[t.list];
      const day = weekStart + offset;
      if (day >= 1 && day <= daysInMonth) {
        if (!tasksByDay[day]) tasksByDay[day] = [];
        tasksByDay[day].push(t);
      }
    });
  }

  const selectedTasks = selected ? (tasksByDay[selected] ?? []) : [];

  return (
    <div>
      {/* Month / year navigator */}
      <div className="mb-4 flex items-center justify-center gap-2">
        {/* invisible spacer mirrors "Hoje" to keep nav centered */}
        <AnimatePresence initial={false}>
          {!isCurrentMonth && (
            <motion.div
              initial={{ opacity: 0, width: 0 }}
              animate={{ opacity: 0, width: "auto" }}
              exit={{ opacity: 0, width: 0 }}
              className="pointer-events-none overflow-hidden rounded-full border border-transparent px-2.5 py-1 text-[11px]"
            >Hoje</motion.div>
          )}
        </AnimatePresence>

        <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.95 }} onClick={prev}
          className="flex h-7 w-7 items-center justify-center rounded-lg text-muted transition-colors hover:bg-white/[0.05] hover:text-white">
          <Icon name="ChevronRight" size={14} strokeWidth={2} className="rotate-180" />
        </motion.button>

        {/* Clickable month/year → dropdown */}
        <div className="relative">
          <button
            onClick={() => { setDropdownOpen(o => !o); setDropYear(year); }}
            className="flex items-center gap-1 rounded-lg px-2 py-1 text-[13px] font-medium text-white/80 transition-colors hover:bg-white/[0.05] hover:text-white"
          >
            {MONTH_NAMES[month]} {year}
          </button>

          <AnimatePresence>
            {dropdownOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setDropdownOpen(false)} />
                <motion.div
                  initial={{ opacity: 0, y: -6, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -6, scale: 0.97 }}
                  transition={{ type: "spring", stiffness: 400, damping: 30 }}
                  className="absolute left-1/2 top-full z-20 mt-2 w-56 -translate-x-1/2 rounded-2xl border border-[var(--border-strong)] p-3 shadow-2xl shadow-black/60"
                  style={{ background: "#141417" }}
                >
                  {/* Year selector */}
                  <div className="mb-3 flex items-center justify-between">
                    <button onClick={() => setDropYear(y => y - 1)}
                      className="flex h-6 w-6 items-center justify-center rounded-lg text-muted transition-colors hover:bg-white/[0.06] hover:text-white">
                      <Icon name="ChevronRight" size={13} strokeWidth={2} className="rotate-180" />
                    </button>
                    <span className="text-[13px] font-semibold text-white">{dropYear}</span>
                    <button onClick={() => setDropYear(y => y + 1)}
                      className="flex h-6 w-6 items-center justify-center rounded-lg text-muted transition-colors hover:bg-white/[0.06] hover:text-white">
                      <Icon name="ChevronRight" size={13} strokeWidth={2} />
                    </button>
                  </div>

                  {/* Month grid */}
                  <div className="grid grid-cols-3 gap-1">
                    {MONTH_SHORT.map((m, i) => {
                      const isActive = i === month && dropYear === year;
                      const isNow = i === now.getMonth() && dropYear === now.getFullYear();
                      return (
                        <button key={m} onClick={() => selectMonth(i)}
                          className={cn(
                            "rounded-lg py-1.5 text-[12px] font-medium transition-colors",
                            isActive ? "bg-white/15 text-white" : "text-muted hover:bg-white/[0.06] hover:text-white",
                            isNow && !isActive && "text-white/70 underline decoration-dotted underline-offset-2"
                          )}>
                          {m}
                        </button>
                      );
                    })}
                  </div>
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>

        <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.95 }} onClick={next}
          className="flex h-7 w-7 items-center justify-center rounded-lg text-muted transition-colors hover:bg-white/[0.05] hover:text-white">
          <Icon name="ChevronRight" size={14} strokeWidth={2} />
        </motion.button>

        {/* Go to current month — absolute so it doesn't shift the centered nav */}
        <AnimatePresence>
          {!isCurrentMonth && (
            <motion.button
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={goToday}
              className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1 text-[11px] text-muted transition-colors hover:text-white"
            >
              Hoje
            </motion.button>
          )}
        </AnimatePresence>
      </div>

      {/* Weekend column bg strips + grid */}
      <div className="relative">
        {/* Dom strip (col 0) */}
        <div
          className="pointer-events-none absolute inset-y-0 rounded-lg bg-white/[0.04]"
          style={{ left: 0, width: "calc((100% - 1.5rem) / 7)" }}
        />
        {/* Sáb strip (col 6) */}
        <div
          className="pointer-events-none absolute inset-y-0 rounded-lg bg-white/[0.04]"
          style={{ right: 0, width: "calc((100% - 1.5rem) / 7)" }}
        />

      {/* Day-of-week headers */}
      <div className="relative mb-1 grid grid-cols-7 gap-1">
        {DAY_LABELS.map((d) => (
          <div key={d} className="py-1 text-center text-[10px] font-medium uppercase tracking-wider text-muted-2">
            {d}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="relative grid grid-cols-7 gap-1">
        {/* Empty cells before first day */}
        {Array.from({ length: firstDow }).map((_, i) => (
          <div key={`e${i}`} className="py-2" />
        ))}
        {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((day) => {
          const dayTasks = tasksByDay[day] ?? [];
          const isToday = isCurrentMonth && day === todayDate;
          const isSelected = day === selected;
          const hasTasks = dayTasks.length > 0;
          const col = (firstDow + day - 1) % 7;
          const isWeekend = col === 0 || col === 6;
          return (
            <button
              key={day}
              onClick={() => setSelected(isSelected ? null : day)}
              className={cn(
                "relative flex flex-col items-center gap-0.5 rounded-lg py-2 text-[12px] transition-colors duration-150",
                isSelected ? "bg-white/10" : "hover:bg-white/[0.06]",
                isToday ? "text-white font-semibold" : hasTasks ? "text-white/70" : "text-muted-2"
              )}
            >
              <span className={cn(
                "flex h-6 w-6 items-center justify-center rounded-full text-[12px]",
                isToday && "bg-white text-black font-semibold"
              )}>{day}</span>
              {hasTasks && (
                <span className={cn(
                  "h-1 w-1 rounded-full",
                  isToday ? "bg-white/60" : "bg-white/30"
                )} />
              )}
            </button>
          );
        })}
      </div>
      </div>{/* end relative wrapper */}

      {/* Selected day tasks */}
      <AnimatePresence>
        {selected && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ type: "spring", stiffness: 340, damping: 32 }}
            style={{ overflow: "hidden" }}
          >
            <div className="mt-5 border-t border-[var(--border)] pt-4">
              <p className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-muted-2">
                Dia {selected}
              </p>
              <div className="flex flex-col gap-1.5">
                {selectedTasks.map((task) => (
                  <TaskRow key={task.id} task={task} onToggle={onToggle} onDelete={onDelete} onEdit={onEdit} onOpenEdit={onOpenEdit} showBranch={showBranch} />
                ))}
                {selectedTasks.length === 0 && (
                  <p className="pb-2 text-center text-sm text-muted-2">Nenhuma tarefa.</p>
                )}
                <AddRow onAdd={(title) => {
                  const d = new Date(year, month, selected!);
                  onAdd(DOW_TO_LIST[d.getDay()], title, fmtDate(d));
                }} />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ── Shared components ────────────────────────────────────────── */
function DaySection({
  list, label, isToday, tasks, onToggle, onAdd, onDelete, onEdit, onOpenEdit, colIdx, showBranch,
}: {
  list: TaskList; label: string; isToday: boolean;
  tasks: Task[]; onToggle: (id: string) => void; onAdd: (list: TaskList, title: string, due: string) => void;
  onDelete: (id: string, title: string) => void; onEdit: (id: string, title: string) => void;
  onOpenEdit: (task: Task) => void; colIdx: number; showBranch: boolean;
}) {
  const [expanded, setExpanded] = useState(true);
  const done = tasks.filter((t) => t.done).length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: colIdx * 0.04, ease: [0.25, 0.46, 0.45, 0.94] }}
      className="border-t border-[var(--border)]"
    >
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full cursor-pointer items-center gap-3 py-3"
      >
        <span className={cn(
          "w-8 shrink-0 text-left text-[10px] font-semibold uppercase tracking-widest",
          isToday ? "text-white" : "text-muted-2"
        )}>
          {label}
        </span>
        <motion.span
          animate={{ rotate: expanded ? 0 : -90 }}
          transition={{ duration: 0.18 }}
          className="shrink-0 text-muted-2"
        >
          <Icon name="ChevronDown" size={13} strokeWidth={1.75} />
        </motion.span>
        {isToday && (
          <span className="rounded-full bg-white/10 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider text-white/60">
            hoje
          </span>
        )}
        <span className="flex-1" />
        {tasks.length > 0 ? (
          <span className="text-[11px] tabular-nums text-muted-2">{done}/{tasks.length}</span>
        ) : (
          <span className="text-[11px] text-muted-2 opacity-40">—</span>
        )}
      </button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            key="tasks"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: "spring", stiffness: 340, damping: 32 }}
            style={{ overflow: "hidden" }}
          >
            <div className="pb-3">
              {tasks.length > 0 && (
                <motion.div
                  initial="hidden"
                  animate="show"
                  variants={{ show: { transition: { staggerChildren: 0.04 } } }}
                  className="flex flex-col gap-1.5"
                >
                  {tasks.map((task) => (
                    <motion.div key={task.id} variants={itemAnim} layout>
                      <TaskRow task={task} onToggle={onToggle} onDelete={onDelete} onEdit={onEdit} onOpenEdit={onOpenEdit} showBranch={showBranch} />
                    </motion.div>
                  ))}
                </motion.div>
              )}
              <AddRow onAdd={(title) => onAdd(list, title, fmtDate(dateForList(list)))} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/* ── Edit task modal ──────────────────────────────────────────── */
const GLASS_MODAL = {
  background: "rgba(255,255,255,0.06)",
  backdropFilter: "blur(32px)",
  WebkitBackdropFilter: "blur(32px)",
  border: "1px solid rgba(255,255,255,0.12)",
  boxShadow: "0 24px 60px -12px rgba(0,0,0,0.8)",
} as React.CSSProperties;

const FIELD_STYLE = {
  background: "rgba(255,255,255,0.05)",
  border: "1px solid rgba(255,255,255,0.10)",
} as React.CSSProperties;

function EditTaskModal({ task, onSave, onCancel }: {
  task: Task;
  onSave: (fields: { title: string; due?: string; description?: string; workspace?: WorkspaceId }) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(task.title);
  const [due, setDue] = useState(task.due ?? "");
  const [description, setDescription] = useState(task.description ?? "");
  const [workspace, setWorkspace] = useState<WorkspaceId>(task.workspace);
  const [calOpen, setCalOpen] = useState(false);
  const [branchOpen, setBranchOpen] = useState(false);
  const calRef = useRef<HTMLDivElement>(null);
  const branchRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!calOpen) return;
    const handler = (e: MouseEvent) => {
      if (calRef.current && !calRef.current.contains(e.target as Node)) setCalOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [calOpen]);

  useEffect(() => {
    if (!branchOpen) return;
    const handler = (e: MouseEvent) => {
      if (branchRef.current && !branchRef.current.contains(e.target as Node)) setBranchOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [branchOpen]);

  const handleSave = () => {
    const trimmed = title.trim();
    if (!trimmed) return;
    onSave({ title: trimmed, due: due || undefined, description: description || undefined, workspace });
  };

  return (
    <motion.div
      key="edit-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      className="fixed inset-0 z-[100] flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)" }}
      onClick={onCancel}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.94, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.94, y: 8 }}
        transition={{ type: "spring", stiffness: 380, damping: 28 }}
        onClick={(e) => e.stopPropagation()}
        className="mx-4 w-full max-w-[420px] rounded-2xl p-5"
        style={GLASS_MODAL}
      >
        <p className="mb-5 text-[15px] font-semibold text-white">Editar tarefa</p>

        <div className="flex flex-col gap-3">
          {/* Nome */}
          <div>
            <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-widest text-white/40">Nome</label>
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleSave(); } if (e.key === "Escape") onCancel(); }}
              placeholder="Nome da tarefa"
              className="w-full rounded-xl px-3.5 py-2.5 text-[13px] text-white/90 outline-none placeholder:text-white/25 transition-colors"
              style={FIELD_STYLE}
            />
          </div>

          {/* Branch */}
          <div className="relative" ref={branchRef}>
            <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-widest text-white/40">Branch</label>
            {(() => { const ws = getWorkspace(workspace); return (
              <button
                type="button"
                onClick={() => setBranchOpen((o) => !o)}
                className="flex w-full cursor-pointer items-center justify-between rounded-xl px-3.5 py-2.5 text-[13px] outline-none transition-colors"
                style={FIELD_STYLE}
              >
                <span className="flex items-center gap-2.5">
                  <WorkspaceDot accent={ws.accent} accent2={ws.accent2} icon={ws.icon} />
                  <span className="text-white/90">{ws.name}</span>
                </span>
                <motion.span animate={{ rotate: branchOpen ? 180 : 0 }} transition={{ duration: 0.18 }}>
                  <Icon name="ChevronDown" size={14} className="text-white/40" />
                </motion.span>
              </button>
            ); })()}
            <AnimatePresence>
              {branchOpen && (
                <motion.div
                  initial={{ opacity: 0, y: -6, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -6, scale: 0.97 }}
                  transition={{ duration: 0.16 }}
                  className="absolute left-0 right-0 top-full z-20 mt-2 rounded-xl p-1.5"
                  style={{ background: "rgba(20,20,22,0.98)", border: "1px solid rgba(255,255,255,0.12)", boxShadow: "0 24px 60px -12px rgba(0,0,0,0.85)" }}
                >
                  {WORKSPACES.map((w) => {
                    const isActive = workspace === w.id;
                    return (
                      <motion.button
                        key={w.id}
                        type="button"
                        whileHover={{ x: 3 }}
                        onClick={() => { setWorkspace(w.id as WorkspaceId); setBranchOpen(false); }}
                        className={cn(
                          "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-[13px] transition-colors",
                          isActive ? "text-white" : "text-white/50 hover:text-white/80"
                        )}
                        style={{ background: isActive ? "rgba(255,255,255,0.07)" : "transparent" }}
                      >
                        <WorkspaceDot accent={w.accent} accent2={w.accent2} icon={w.icon} />
                        <span className="flex-1">{w.name}</span>
                        {isActive && <Icon name="Check" size={13} className="text-white/60" />}
                      </motion.button>
                    );
                  })}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Data */}
          <div className="relative" ref={calRef}>
            <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-widest text-white/40">Data</label>
            <button
              type="button"
              onClick={() => setCalOpen((o) => !o)}
              className="flex w-full cursor-pointer items-center justify-between rounded-xl px-3.5 py-2.5 text-[13px] outline-none transition-colors"
              style={FIELD_STYLE}
            >
              <span className={due ? "text-white/90" : "text-white/25"}>{due || "Selecionar data"}</span>
              <Icon name="Calendar" size={15} strokeWidth={1.75} className="text-white/40" />
            </button>
            <AnimatePresence>
              {calOpen && (
                <motion.div
                  initial={{ opacity: 0, y: -6, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -6, scale: 0.97 }}
                  transition={{ duration: 0.16 }}
                  className="absolute left-0 right-0 top-full z-20 mt-2 rounded-xl p-3"
                  style={{ background: "rgba(20,20,22,0.98)", border: "1px solid rgba(255,255,255,0.12)", boxShadow: "0 24px 60px -12px rgba(0,0,0,0.85)" }}
                >
                  <DatePicker value={due} onChange={setDue} onClose={() => setCalOpen(false)} />
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Descrição */}
          <div>
            <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-widest text-white/40">Descrição</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Detalhes, contexto, notas…"
              rows={3}
              className="w-full resize-none rounded-xl px-3.5 py-2.5 text-[13px] text-white/90 outline-none placeholder:text-white/25 transition-colors"
              style={FIELD_STYLE}
            />
          </div>
        </div>

        <div className="mt-5 flex gap-2">
          <button
            onClick={onCancel}
            className="flex-1 cursor-pointer rounded-xl border border-white/10 py-2.5 text-[13px] font-medium text-white/60 transition-colors hover:border-white/20 hover:text-white/80"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            className="flex-1 cursor-pointer rounded-xl py-2.5 text-[13px] font-medium text-white transition-colors"
            style={{ background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.18)" }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.18)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.12)")}
          >
            Salvar
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ── Confirm delete modal ─────────────────────────────────────── */
function ConfirmDeleteModal({ title, onConfirm, onCancel }: {
  title: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <motion.div
      key="confirm-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      className="fixed inset-0 z-[100] flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)" }}
      onClick={onCancel}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.94, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.94, y: 8 }}
        transition={{ type: "spring", stiffness: 380, damping: 28 }}
        onClick={(e) => e.stopPropagation()}
        className="mx-4 w-full max-w-[340px] rounded-2xl p-6"
        style={{
          background: "rgba(255,255,255,0.06)",
          backdropFilter: "blur(32px)",
          WebkitBackdropFilter: "blur(32px)",
          border: "1px solid rgba(255,255,255,0.12)",
          boxShadow: "0 24px 60px -12px rgba(0,0,0,0.8)",
        }}
      >
        <p className="mb-1 text-[15px] font-semibold text-white">Excluir tarefa?</p>
        <p className="mb-6 text-[13px] leading-relaxed text-white/50">
          &ldquo;{title}&rdquo; será removida permanentemente.
        </p>
        <div className="flex gap-2">
          <button
            onClick={onCancel}
            className="flex-1 cursor-pointer rounded-xl border border-white/10 py-2.5 text-[13px] font-medium text-white/60 transition-colors hover:border-white/20 hover:text-white/80"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 cursor-pointer rounded-xl py-2.5 text-[13px] font-medium text-white transition-colors"
            style={{ background: "rgba(239,68,68,0.25)", border: "1px solid rgba(239,68,68,0.35)" }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(239,68,68,0.38)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(239,68,68,0.25)")}
          >
            Excluir
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function TaskRow({ task, onToggle, onDelete, onEdit, onOpenEdit, showBranch }: {
  task: Task;
  onToggle: (id: string) => void;
  onDelete?: (id: string, title: string) => void;
  onEdit?: (id: string, title: string) => void;
  onOpenEdit?: (task: Task) => void;
  showBranch?: boolean;
}) {
  const ws = getWorkspace(task.workspace);

  return (
    <motion.div
      whileHover={{ x: 3 }}
      transition={{ duration: 0.12 }}
      onClick={() => onOpenEdit?.(task)}
      className="group flex cursor-pointer items-center gap-3 rounded-lg py-2 pl-1 pr-3 transition-colors hover:bg-white/[0.03]"
    >
      <button
        onClick={(e) => { e.stopPropagation(); onToggle(task.id); }}
        className="shrink-0 cursor-pointer"
        aria-label="toggle"
      >
        <AnimatePresence mode="wait" initial={false}>
          {task.done ? (
            <motion.span
              key="done"
              initial={{ scale: 0, rotate: -90 }}
              animate={{ scale: 1, rotate: 0 }}
              exit={{ scale: 0 }}
              transition={{ type: "spring", stiffness: 500, damping: 20 }}
              className="flex h-[18px] w-[18px] items-center justify-center rounded-full"
              style={{ background: ws.accent }}
            >
              <Icon name="Check" size={11} strokeWidth={2.5} className="text-white" />
            </motion.span>
          ) : (
            <motion.span
              key="undone"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
              whileHover={{ borderColor: ws.accent, scale: 1.1 }}
              transition={{ duration: 0.12 }}
              className="block h-[18px] w-[18px] rounded-full border border-[var(--border-strong)]"
            />
          )}
        </AnimatePresence>
      </button>

      <span
        className={cn(
          "flex-1 text-[13px] leading-relaxed",
          task.done ? "cursor-default text-muted-2 line-through" : "text-white/80"
        )}
      >
        {task.title}
      </span>

      {showBranch && (
        <span
          className="flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-medium"
          style={{ background: `${ws.accent}1f`, color: ws.accent }}
        >
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: ws.accent }} />
          {ws.name}
        </span>
      )}

      <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        {onDelete && (
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(task.id, task.title); }}
            className="cursor-pointer rounded p-1 text-white/40 transition-colors hover:text-red-400"
            aria-label="Excluir"
          >
            <Icon name="Trash2" size={12} strokeWidth={1.75} />
          </button>
        )}
      </div>
    </motion.div>
  );
}
