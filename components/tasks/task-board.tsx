"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { DatePicker } from "@/components/ui/date-picker";
import { fetchRecurring, saveRecurring, removeRecurring, generateRecurring, type RecurringDTO, type Frequency } from "@/lib/recurring-client";
import { fetchGroupMeta, saveGroupOrder, saveEmptyGroups, renameGroupRemote, type EmptyGroup } from "@/lib/task-groups-client";
import { AnimatePresence, motion, type Variants } from "framer-motion";
import { useWorkspace, getWorkspace } from "@/lib/workspace-context";
import { WorkspaceDot } from "@/components/shell/header";
import { PageTransition } from "@/components/shell/page-transition";
import { Topbar } from "@/components/shell/topbar";
import { Icon } from "@/components/ui/icon";
import { Loader } from "@/components/ui/loader";
import { useToast } from "@/components/ui/toast";
import { TASK_LISTS, TASK_FLAGS, TODAY_LIST, type Task, type TaskList } from "@/lib/mock/tasks";
import { cn } from "@/lib/utils";

type View = "hoje" | "semana" | "mes" | "backlog" | "grupos";

let _audioCtx: AudioContext | null = null;
function getAudioCtx(): AudioContext {
  if (!_audioCtx || _audioCtx.state === "closed") {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    _audioCtx = new AC();
  }
  return _audioCtx;
}

function playBell(direction: "up" | "down" = "up") {
  try {
    const ctx = getAudioCtx();
    const fire = () => {
      const t = ctx.currentTime;
      // harp pluck: arpejo C4–E4–G4 (uma oitava abaixo = mais grave/suave).
      // "up" (marcar) toca ascendente; "down" (desmarcar) toca descendente.
      const freqs = [261.63, 329.63, 392.0];
      const ordered = direction === "up" ? freqs : [...freqs].reverse();
      const strings: [number, number][] = ordered.map((f, i) => [f, i * 0.07]);
      strings.forEach(([fund, delay]) => {
        // harmônicos: [ratio, volume, decay] — parciais altos bem reduzidos
        // para um timbre arredondado, menos brilhante/agudo.
        const partials: [number, number, number][] = [
          [1,   0.16, 1.3],
          [2,   0.05, 0.55],
          [3,   0.02, 0.30],
          [4,   0.008, 0.18],
        ];
        partials.forEach(([ratio, vol, dec]) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.type = "sine";
          // leve pitch drop inicial — característico de corda pinçada
          osc.frequency.setValueAtTime(fund * ratio * 1.003, t + delay);
          osc.frequency.exponentialRampToValueAtTime(fund * ratio, t + delay + 0.04);
          gain.gain.setValueAtTime(vol, t + delay);
          gain.gain.exponentialRampToValueAtTime(0.0001, t + delay + dec);
          osc.start(t + delay);
          osc.stop(t + delay + dec);
        });
      });
    };
    if (ctx.state === "suspended") {
      ctx.resume().then(fire);
    } else {
      fire();
    }
  } catch {}
}

const VALID_LISTS: TaskList[] = ["seg", "ter", "qua", "qui", "sex", "sab", "dom"];

interface DbTaskRow {
  id: string;
  title: string;
  branch: string;
  list: string | null;
  done: boolean;
  due: string | null;
  instruction: string | null;
  groups: string | null;
  flags: string | null;
  sourceRecurring: string | null;
}

/** Mapeia uma linha do banco para o formato que a board usa. Sem dia → hoje. */
function toBoardTask(row: DbTaskRow): Task {
  const list = (row.list && VALID_LISTS.includes(row.list as TaskList) ? row.list : TODAY_LIST) as TaskList;
  let groups: string[] = [];
  if (row.groups) { try { groups = JSON.parse(row.groups) as string[]; } catch { groups = []; } }
  let flags: string[] = [];
  if (row.flags) { try { flags = JSON.parse(row.flags) as string[]; } catch { flags = []; } }
  return {
    id: row.id,
    title: row.title,
    branch: row.branch,
    list,
    done: row.done,
    due: row.due ?? undefined,
    description: row.instruction ?? undefined,
    recurring: !!row.sourceRecurring,
    groups,
    flags,
  };
}

const VIEWS: { id: View; label: string; icon: string }[] = [
  { id: "hoje",    label: "Hoje",    icon: "Clock" },
  { id: "semana",  label: "Semana",  icon: "CalendarRange" },
  { id: "mes",     label: "Mês",     icon: "Grid3x3" },
  { id: "grupos",  label: "Grupos",  icon: "Layers" },
  { id: "backlog", label: "Backlog", icon: "Inbox" },
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
  const [view, setView] = useState<View>("hoje");
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string } | null>(null);
  const [editTarget, setEditTarget] = useState<Task | null>(null);
  const [recurringOpen, setRecurringOpen] = useState(false);
  const [emptyGroups, setEmptyGroups] = useState<EmptyGroup[]>([]);
  const [groupOrder, setGroupOrder] = useState<string[]>([]);

  useEffect(() => {
    fetchGroupMeta().then((meta) => { setEmptyGroups(meta.empty); setGroupOrder(meta.order); });
  }, []);

  // Materializa as recorrentes vencidas hoje e recarrega as tasks.
  const loadTasks = useCallback(async () => {
    await generateRecurring();
    const data = await fetch("/api/tasks").then((r) => r.json()).catch(() => ({}));
    setTasks((data.tasks ?? []).map(toBoardTask));
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadTasks().finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [loadTasks]);

  // Recarrega quando uma tarefa é criada de fora (ex: atalho global ⌘/Ctrl+I).
  useEffect(() => {
    const onChanged = () => { void loadTasks(); };
    window.addEventListener("maestro:tasks-changed", onChanged);
    return () => window.removeEventListener("maestro:tasks-changed", onChanged);
  }, [loadTasks]);

  // Atualização otimista in-place (ex: trocar a branch pelo chip da task).
  useEffect(() => {
    const onUpdated = (e: Event) => {
      const { id, patch } = (e as CustomEvent<{ id: string; patch: Partial<Task> }>).detail ?? {};
      if (!id || !patch) return;
      setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
    };
    window.addEventListener("maestro:task-updated", onUpdated as EventListener);
    return () => window.removeEventListener("maestro:task-updated", onUpdated as EventListener);
  }, []);

  const toggle = (id: string) => {
    // Calcula 'next' de forma determinística a partir do estado atual —
    // não dentro do updater do setState (que pode rodar de forma assíncrona).
    const current = tasks.find((t) => t.id === id);
    if (!current) return;
    const next = !current.done;
    playBell(next ? "up" : "down");
    if (next) toast("Tarefa concluída", "success");
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, done: next } : t)));
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

  // Duplica uma task: cria uma cópia (mesmos campos) e reabre o editor nela.
  const duplicateTask = async (src: Task) => {
    setEditTarget(null);
    const copyTitle = `Cópia - ${src.title}`;
    const tempId = `temp-${crypto.randomUUID()}`;
    const optimistic: Task = { ...src, id: tempId, title: copyTitle };
    // Insere logo abaixo da original (em vez de no fim da lista).
    setTasks((prev) => {
      const idx = prev.findIndex((t) => t.id === src.id);
      if (idx === -1) return [...prev, optimistic];
      const next = [...prev];
      next.splice(idx + 1, 0, optimistic);
      return next;
    });
    toast("Tarefa duplicada", "create");
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: copyTitle,
          branch: src.branch,
          list: src.list,
          due: src.due ?? null,
          instruction: src.description ?? null,
          groups: src.groups ?? [],
          flags: src.flags ?? [],
        }),
      });
      const data = await res.json();
      if (data.task) {
        const nt = toBoardTask(data.task);
        setTasks((prev) => prev.map((t) => (t.id === tempId ? nt : t)));
        setEditTarget(nt); // reabre no duplicado pra ajustar
      } else {
        setTasks((prev) => prev.filter((t) => t.id !== tempId));
      }
    } catch {
      setTasks((prev) => prev.filter((t) => t.id !== tempId));
    }
  };

  // Duplicar disparado pelo botão da linha (evento, evita threading por todas as views).
  const duplicateRef = useRef(duplicateTask);
  duplicateRef.current = duplicateTask;
  useEffect(() => {
    const onDup = (e: Event) => {
      const task = (e as CustomEvent<{ task: Task }>).detail?.task;
      if (task) duplicateRef.current(task);
    };
    window.addEventListener("maestro:task-duplicate", onDup as EventListener);
    return () => window.removeEventListener("maestro:task-duplicate", onDup as EventListener);
  }, []);

  const editTask = (id: string, title: string) => {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, title } : t)));
    fetch("/api/tasks", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, title }),
    }).catch(() => {});
    toast("Tarefa atualizada", "edit");
  };

  const saveTaskEdit = (id: string, fields: { title: string; due?: string; description?: string; branch?: string; groups?: string[]; flags?: string[] }) => {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...fields } : t)));
    setEditTarget(null);
    fetch("/api/tasks", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, title: fields.title, due: fields.due ?? null, instruction: fields.description ?? null, branch: fields.branch ?? null, groups: fields.groups ?? [], flags: fields.flags ?? [] }),
    }).catch(() => {});
    toast("Tarefa atualizada", "edit");
  };

  const addTask = async (list: TaskList, title: string, due: string, groups?: string[]) => {
    const trimmed = title.trim();
    if (!trimmed) return;

    // Otimista: mostra a task na hora com id temporário, reconcilia depois.
    const tempId = `temp-${crypto.randomUUID()}`;
    const optimistic: Task = { id: tempId, title: trimmed, branch: active, list, done: false, due, groups: groups ?? [] };
    setTasks((prev) => [...prev, optimistic]);
    toast("Tarefa criada", "create");

    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: trimmed, branch: active, list, due, groups: groups ?? [] }),
      });
      const data = await res.json();
      if (data.task) {
        // Troca o placeholder pela task real (id do servidor).
        setTasks((prev) => prev.map((t) => (t.id === tempId ? toBoardTask(data.task) : t)));
      } else {
        setTasks((prev) => prev.filter((t) => t.id !== tempId));
      }
    } catch {
      // Reverte se a criação falhar.
      setTasks((prev) => prev.filter((t) => t.id !== tempId));
    }
  };

  // Move uma task pro dia de outra coluna (drag and drop na aba Grupos) — só muda o `due`.
  const moveTaskToDay = (id: string, due: string) => {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, due } : t)));
    fetch("/api/tasks", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, due }),
    }).catch(() => {});
  };

  // Cria um grupo vazio direto na aba Grupos (sem task ainda associada).
  const createEmptyGroup = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (allGroups.some((g) => g.toLowerCase() === trimmed.toLowerCase())) return;
    const branchTag = allBranches ? null : active;
    setEmptyGroups((prev) => {
      const next: EmptyGroup[] = [...prev, { name: trimmed, branch: branchTag }];
      saveEmptyGroups(next);
      return next;
    });
    setGroupOrder((prev) => {
      const next = [...prev, trimmed];
      saveGroupOrder(next);
      return next;
    });
  };

  // Renomeia um grupo em todo lugar (tasks, grupos vazios, ordem).
  const renameGroup = (oldName: string, newName: string) => {
    const trimmed = newName.trim();
    if (!trimmed || trimmed === oldName) return;
    setTasks((prev) => prev.map((t) => (t.groups?.includes(oldName) ? { ...t, groups: t.groups.map((g) => (g === oldName ? trimmed : g)) } : t)));
    setEmptyGroups((prev) => prev.map((e) => (e.name === oldName ? { ...e, name: trimmed } : e)));
    setGroupOrder((prev) => prev.map((g) => (g === oldName ? trimmed : g)));
    renameGroupRemote(oldName, trimmed); // persiste tasks + ordem + vazios no servidor
    toast("Grupo renomeado", "edit");
  };

  const reorderGroups = (order: string[]) => {
    setGroupOrder(order);
    saveGroupOrder(order);
  };

  const visible = allBranches ? tasks : tasks.filter((t) => t.branch === active);

  // Grupos existentes (do escopo visível) — pro autocomplete e pra aba Grupos.
  // Inclui grupos "vazios" criados direto na aba Grupos (respeitando o escopo de branch)
  // e aplica a ordem personalizada (drag reorder); grupos sem posição salva vão pro fim, alfabético.
  const allGroups = useMemo(() => {
    const set = new Set<string>();
    visible.forEach((t) => t.groups?.forEach((g) => set.add(g)));
    emptyGroups.forEach((e) => {
      if (allBranches || e.branch === null || e.branch === active) set.add(e.name);
    });
    const orderIndex = new Map(groupOrder.map((g, i) => [g, i]));
    return [...set].sort((a, b) => {
      const ia = orderIndex.has(a) ? orderIndex.get(a)! : Infinity;
      const ib = orderIndex.has(b) ? orderIndex.get(b)! : Infinity;
      if (ia !== ib) return ia - ib;
      return a.localeCompare(b, "pt-BR");
    });
  }, [visible, emptyGroups, groupOrder, allBranches, active]);

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

        <motion.button
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          onClick={() => setRecurringOpen(true)}
          title="Tarefas recorrentes"
          className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-1.5 text-[12px] font-medium text-muted transition-colors hover:border-[var(--border-strong)] hover:text-white"
        >
          <Icon name="RefreshCcw" size={13} strokeWidth={1.75} />
          <span className="hidden sm:inline">Recorrentes</span>
        </motion.button>
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
            onConfirm={() => { removeTask(deleteTarget.id); setEditTarget(null); }}
            onCancel={() => setDeleteTarget(null)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {editTarget && (
          <EditTaskModal
            key={editTarget.id}
            task={editTarget}
            allGroups={allGroups}
            onSave={(fields) => saveTaskEdit(editTarget.id, fields)}
            onCancel={() => setEditTarget(null)}
            onDelete={() => requestDelete(editTarget.id, editTarget.title)}
            onDuplicate={() => duplicateTask(editTarget)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {recurringOpen && (
          <RecurringModal onClose={() => { setRecurringOpen(false); loadTasks(); }} />
        )}
      </AnimatePresence>

      <AnimatePresence mode="wait">
        {!loading && view === "hoje" && (
          <motion.div key="hoje" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.2 }}>
            <HojeView tasks={visible.filter(belongsToToday)} onToggle={toggle} onAdd={addTask} onDelete={requestDelete} onEdit={editTask} onOpenEdit={setEditTarget} showBranch={allBranches} />
          </motion.div>
        )}
        {!loading && view === "semana" && (
          <motion.div key="semana" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.2 }}>
            <SemanaView tasks={visible} onToggle={toggle} onAdd={addTask} onDelete={requestDelete} onEdit={editTask} onOpenEdit={setEditTarget} onMove={moveTaskToDay} showBranch={allBranches} />
          </motion.div>
        )}
        {!loading && view === "backlog" && (
          <motion.div key="backlog" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.2 }}>
            <BacklogView tasks={visible.filter((t) => !t.due)} onToggle={toggle} onDelete={requestDelete} onEdit={editTask} onOpenEdit={setEditTarget} showBranch={allBranches} />
          </motion.div>
        )}
        {!loading && view === "mes" && (
          <motion.div key="mes" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.2 }}>
            <MesView tasks={visible} onToggle={toggle} onAdd={addTask} onDelete={requestDelete} onEdit={editTask} onOpenEdit={setEditTarget} showBranch={allBranches} />
          </motion.div>
        )}
        {!loading && view === "grupos" && (
          <motion.div key="grupos" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.2 }}>
            <GruposView
              tasks={visible}
              groups={allGroups}
              onToggle={toggle}
              onOpenEdit={setEditTarget}
              onMoveTask={moveTaskToDay}
              onRenameGroup={renameGroup}
              onReorderGroups={reorderGroups}
              onCreateGroup={createEmptyGroup}
              onAddTask={(list, due, groupName, title) => addTask(list, title, due, [groupName])}
            />
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
function SemanaView({ tasks, onToggle, onAdd, onDelete, onEdit, onOpenEdit, onMove, showBranch }: { tasks: Task[]; onToggle: (id: string) => void; onAdd: (list: TaskList, title: string, due: string) => void; onDelete: (id: string, title: string) => void; onEdit: (id: string, title: string) => void; onOpenEdit: (task: Task) => void; onMove: (id: string, due: string) => void; showBranch: boolean }) {
  return (
    <div className="flex flex-col">
      {TASK_LISTS.map((list, colIdx) => {
        const isToday = list.id === TODAY_LIST;
        const colDue = fmtDate(dateForList(list.id as TaskList));
        const dayTasks = tasks.filter((t) => t.due === colDue);
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
            onMove={onMove}
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

/** Converte "dd/mm/aaaa" → epoch (ms) à meia-noite local; NaN se inválida. */
function parseDueMs(s: string | undefined): number {
  if (!s) return NaN;
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s.trim());
  if (!m) return NaN;
  return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1])).getTime();
}

/** Meia-noite de hoje (epoch ms). */
function todayMs(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/**
 * Aparece na aba "Hoje": vence hoje, OU está atrasada (data no passado) e ainda
 * não foi concluída — pra não sumir de vista. Concluídas do passado não voltam.
 */
function belongsToToday(t: { due?: string; done: boolean }): boolean {
  const due = parseDueMs(t.due);
  if (Number.isNaN(due)) return false;
  const today = todayMs();
  return due === today || (due < today && !t.done);
}

/** Data do dia da semana (seg..dom) na semana corrente — semana começa na segunda. */
function dateForList(list: TaskList): Date {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const monday = now.getDate() - ((now.getDay() + 6) % 7);
  return new Date(now.getFullYear(), now.getMonth(), monday + LIST_TO_DAY_OFFSET[list]);
}

function parseDue(due: string | undefined | null): { year: number; month: number; day: number } | null {
  if (!due) return null;
  const m = due.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  return { day: Number(m[1]), month: Number(m[2]) - 1, year: Number(m[3]) };
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

  // Posiciona cada tarefa pelo seu `due` real (dd/mm/yyyy) no mês/ano exibido.
  const tasksByDay: Record<number, Task[]> = {};
  tasks.forEach((t) => {
    const d = parseDue(t.due);
    if (!d || d.year !== year || d.month !== month) return;
    if (d.day < 1 || d.day > daysInMonth) return;
    (tasksByDay[d.day] ??= []).push(t);
  });

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

/* ── Backlog view ─────────────────────────────────────────────── */
function BacklogView({ tasks, onToggle, onDelete, onEdit, onOpenEdit, showBranch }: {
  tasks: Task[];
  onToggle: (id: string) => void;
  onDelete: (id: string, title: string) => void;
  onEdit: (id: string, title: string) => void;
  onOpenEdit: (task: Task) => void;
  showBranch: boolean;
}) {
  const done = tasks.filter((t) => t.done).length;
  return (
    <div>
      <p className="mb-4 text-[11px] uppercase tracking-widest text-muted-2">
        {tasks.length === 0 ? "Nenhuma tarefa sem data." : `${done}/${tasks.length} concluídas`}
      </p>
      {tasks.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-2">Tudo com data definida.</p>
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
    </div>
  );
}

/* ── Shared components ────────────────────────────────────────── */
function DaySection({
  list, label, isToday, tasks, onToggle, onAdd, onDelete, onEdit, onOpenEdit, onMove, colIdx, showBranch,
}: {
  list: TaskList; label: string; isToday: boolean;
  tasks: Task[]; onToggle: (id: string) => void; onAdd: (list: TaskList, title: string, due: string) => void;
  onDelete: (id: string, title: string) => void; onEdit: (id: string, title: string) => void;
  onOpenEdit: (task: Task) => void; onMove?: (id: string, due: string) => void; colIdx: number; showBranch: boolean;
}) {
  const [expanded, setExpanded] = useState(true);
  const [isOver, setIsOver] = useState(false);
  const done = tasks.filter((t) => t.done).length;
  const colDue = fmtDate(dateForList(list));

  const dropHandlers = onMove ? {
    onDragOver: (e: React.DragEvent) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; if (!isOver) setIsOver(true); },
    onDragLeave: (e: React.DragEvent) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsOver(false); },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      setIsOver(false);
      const id = e.dataTransfer.getData("text/task-id");
      if (id) onMove(id, colDue);
    },
  } : {};

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: colIdx * 0.04, ease: [0.25, 0.46, 0.45, 0.94] }}
      {...dropHandlers}
      data-day-due={onMove ? colDue : undefined}
      className={cn(
        "border-t border-[var(--border)] transition-colors",
        isOver && "rounded-lg bg-white/[0.05] ring-1 ring-inset ring-white/20"
      )}
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
                      <TaskRow task={task} onToggle={onToggle} onDelete={onDelete} onEdit={onEdit} onOpenEdit={onOpenEdit} showBranch={showBranch} draggable={!!onMove} onMove={onMove} />
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

/* ── Recurring tasks modal ────────────────────────────────────── */
const WEEKDAY_OPTS = [
  { id: "seg", label: "Seg" }, { id: "ter", label: "Ter" }, { id: "qua", label: "Qua" },
  { id: "qui", label: "Qui" }, { id: "sex", label: "Sex" }, { id: "sab", label: "Sáb" }, { id: "dom", label: "Dom" },
];
const WD_LABEL: Record<string, string> = Object.fromEntries(WEEKDAY_OPTS.map((w) => [w.id, w.label]));
const FREQS: { id: Frequency; label: string }[] = [
  { id: "daily", label: "Diária" }, { id: "weekly", label: "Semanal" }, { id: "monthly", label: "Mensal" },
];

function freqSummary(r: RecurringDTO): string {
  if (r.frequency === "daily") return "Todo dia";
  if (r.frequency === "weekly") return r.weekdays.length ? `${r.weekdays.map((d) => WD_LABEL[d] ?? d).join(", ")}` : "Semanal (escolha os dias)";
  return `Todo dia ${r.dayOfMonth ?? "?"}`;
}

type RecurForm = { id?: string; branch: string; title: string; instruction: string; frequency: Frequency; weekdays: string[]; dayOfMonth: number };

function RecurringModal({ onClose }: { onClose: () => void }) {
  const { active, branches } = useWorkspace();
  const { toast } = useToast();
  const [items, setItems] = useState<RecurringDTO[]>([]);
  const [form, setForm] = useState<RecurForm | null>(null);
  const [saving, setSaving] = useState(false);

  const reload = () => fetchRecurring().then(setItems).catch(() => {});
  useEffect(() => { reload(); }, []);

  const newForm = (): RecurForm => ({ branch: active, title: "", instruction: "", frequency: "daily", weekdays: ["seg"], dayOfMonth: 1 });
  const editForm = (r: RecurringDTO): RecurForm => ({ id: r.id, branch: r.branch, title: r.title, instruction: r.instruction ?? "", frequency: r.frequency, weekdays: r.weekdays.length ? r.weekdays : ["seg"], dayOfMonth: r.dayOfMonth ?? 1 });

  const save = async () => {
    if (!form || !form.title.trim()) return;
    setSaving(true);
    try {
      await saveRecurring({
        id: form.id, branch: form.branch, title: form.title.trim(),
        instruction: form.instruction.trim() || null, frequency: form.frequency,
        weekdays: form.weekdays, dayOfMonth: form.dayOfMonth,
      });
      setForm(null);
      await reload();
      toast(form.id ? "Recorrente atualizada" : "Recorrente criada", form.id ? "edit" : "create");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Falha ao salvar", "delete");
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (r: RecurringDTO) => {
    setItems((prev) => prev.map((x) => (x.id === r.id ? { ...x, active: !x.active } : x)));
    try { await saveRecurring({ ...r, instruction: r.instruction, active: !r.active }); } catch { reload(); }
  };

  const del = async (id: string) => {
    setItems((prev) => prev.filter((x) => x.id !== id));
    try { await removeRecurring(id); toast("Recorrente removida", "delete"); } catch { reload(); }
  };

  return (
    <motion.div
      key="recurring-overlay"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}
      className="fixed inset-0 z-[100] flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)" }}
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.94, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.94, y: 8 }}
        transition={{ type: "spring", stiffness: 380, damping: 28 }}
        onClick={(e) => e.stopPropagation()}
        className="mx-4 flex max-h-[85vh] w-full max-w-[460px] flex-col rounded-2xl p-5"
        style={GLASS_MODAL}
      >
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="flex items-center gap-1.5 text-[15px] font-semibold text-white">
              <Icon name="RefreshCcw" size={15} /> Tarefas recorrentes
            </p>
            <p className="text-[11px] text-muted-2">Geram tasks automaticamente na data.</p>
          </div>
          <button onClick={onClose} className="cursor-pointer text-muted-2 transition-colors hover:text-white"><Icon name="X" size={15} /></button>
        </div>

        <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: "none" }}>
          {/* Lista */}
          {items.length === 0 && !form && (
            <p className="py-6 text-center text-[13px] text-muted-2">Nenhuma recorrente ainda.</p>
          )}
          <div className="space-y-2">
            {items.map((r) => {
              const ws = getWorkspace(r.branch);
              return (
                <div key={r.id} className="flex items-center gap-3 rounded-xl px-3 py-2.5" style={FIELD_STYLE}>
                  <WorkspaceDot accent={ws.accent} accent2={ws.accent2} icon={ws.icon} />
                  <div className="min-w-0 flex-1">
                    <p className={cn("truncate text-sm", !r.active && "text-muted-2 line-through")}>{r.title}</p>
                    <p className="text-[11px] text-muted-2">{ws.name} · {freqSummary(r)}</p>
                  </div>
                  <button onClick={() => toggleActive(r)} title={r.active ? "Ativa" : "Pausada"}
                    className={cn("relative h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors", r.active ? "bg-emerald-400/80" : "bg-white/15")}>
                    <span className={cn("absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all", r.active ? "left-[18px]" : "left-0.5")} />
                  </button>
                  <button onClick={() => setForm(editForm(r))} className="shrink-0 text-muted-2 transition-colors hover:text-white"><Icon name="Pencil" size={13} /></button>
                  <button onClick={() => del(r.id)} className="shrink-0 text-muted-2 transition-colors hover:text-red-400"><Icon name="Trash2" size={13} /></button>
                </div>
              );
            })}
          </div>

          {/* Form */}
          {form ? (
            <div className="mt-3 space-y-3 rounded-xl border border-[var(--border-strong)] p-3">
              <input autoFocus value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="Título da tarefa recorrente"
                className="w-full rounded-lg px-3 py-2 text-[13px] text-white/90 outline-none placeholder:text-white/25" style={FIELD_STYLE} />

              {/* Branch pills */}
              <div className="flex flex-wrap gap-1.5">
                {branches.map((w) => {
                  const on = form.branch === w.id;
                  return (
                    <button key={w.id} onClick={() => setForm({ ...form, branch: w.id })}
                      className="flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] transition-colors"
                      style={{ borderColor: on ? w.accent : "var(--border)", background: on ? `${w.accent}1f` : "transparent", color: on ? "#fff" : "var(--muted)" }}>
                      <span className="h-1.5 w-1.5 rounded-full" style={{ background: w.accent }} /> {w.name}
                    </button>
                  );
                })}
              </div>

              {/* Frequência */}
              <div className="flex gap-1.5">
                {FREQS.map((f) => {
                  const on = form.frequency === f.id;
                  return (
                    <button key={f.id} onClick={() => setForm({ ...form, frequency: f.id })}
                      className={cn("flex-1 rounded-lg py-1.5 text-[12px] font-medium transition-colors", on ? "text-white" : "text-muted hover:text-white/80")}
                      style={on ? { background: "var(--surface-2)", border: "1px solid var(--border-strong)" } : { border: "1px solid var(--border)" }}>
                      {f.label}
                    </button>
                  );
                })}
              </div>

              {/* Condicional: dias da semana / dia do mês */}
              {form.frequency === "weekly" && (
                <div className="flex flex-wrap gap-1.5">
                  {WEEKDAY_OPTS.map((d) => {
                    const on = form.weekdays.includes(d.id);
                    return (
                      <button key={d.id}
                        onClick={() => setForm((f) => f ? { ...f, weekdays: f.weekdays.includes(d.id) ? f.weekdays.filter((x) => x !== d.id) : [...f.weekdays, d.id] } : f)}
                        className={cn("h-8 w-9 rounded-lg text-[12px] font-medium transition-colors", on ? "text-white" : "text-muted-2 hover:text-white/70")}
                        style={on ? { background: "var(--accent-soft)", border: "1px solid var(--accent)" } : { border: "1px solid var(--border)" }}>
                        {d.label}
                      </button>
                    );
                  })}
                </div>
              )}
              {form.frequency === "monthly" && (
                <div className="flex items-center gap-2 text-[13px] text-muted">
                  <span>Todo dia</span>
                  <input type="number" min={1} max={31} value={form.dayOfMonth}
                    onChange={(e) => setForm({ ...form, dayOfMonth: Math.min(31, Math.max(1, Number(e.target.value) || 1)) })}
                    className="w-16 rounded-lg px-2 py-1.5 text-center text-white/90 outline-none" style={FIELD_STYLE} />
                  <span>do mês</span>
                </div>
              )}

              <textarea value={form.instruction} onChange={(e) => setForm({ ...form, instruction: e.target.value })}
                placeholder="Detalhes / instrução (opcional)" rows={2}
                className="w-full resize-none rounded-lg px-3 py-2 text-[13px] text-white/90 outline-none placeholder:text-white/25" style={FIELD_STYLE} />

              <div className="flex gap-2">
                <button onClick={() => setForm(null)} className="flex-1 rounded-lg border border-white/10 py-2 text-[13px] text-white/60 transition-colors hover:text-white/80">Cancelar</button>
                <button onClick={save} disabled={saving || !form.title.trim()}
                  className="flex-1 rounded-lg py-2 text-[13px] font-medium text-white transition-colors disabled:opacity-40"
                  style={{ background: "rgba(255,255,255,0.14)", border: "1px solid rgba(255,255,255,0.2)" }}>
                  {saving ? "Salvando…" : "Salvar"}
                </button>
              </div>
            </div>
          ) : (
            <button onClick={() => setForm(newForm())}
              className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-[var(--border-strong)] py-2.5 text-[13px] text-muted transition-colors hover:text-white">
              <Icon name="Plus" size={14} /> Nova recorrente
            </button>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

/** Renderiza texto convertendo URLs (http/https/www) em links clicáveis. */
function LinkifiedText({ text }: { text: string }) {
  const re = /(https?:\/\/[^\s]+|www\.[^\s]+)/gi;
  const parts: React.ReactNode[] = [];
  let last = 0;
  let key = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    let url = m[0];
    let trail = "";
    const tm = /[.,;:!?)\]]+$/.exec(url); // não engole pontuação final
    if (tm) { trail = tm[0]; url = url.slice(0, -trail.length); }
    const href = url.startsWith("http") ? url : `https://${url}`;
    parts.push(
      <a
        key={key++}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        className="text-sky-400 underline decoration-sky-400/40 underline-offset-2 transition-colors hover:text-sky-300"
      >
        {url}
      </a>,
    );
    if (trail) parts.push(trail);
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts}</>;
}

function EditTaskModal({ task, allGroups, onSave, onCancel, onDelete, onDuplicate }: {
  task: Task;
  allGroups: string[];
  onSave: (fields: { title: string; due?: string; description?: string; branch?: string; groups?: string[]; flags?: string[] }) => void;
  onCancel: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
}) {
  const [title, setTitle] = useState(task.title);
  const [due, setDue] = useState(task.due ?? "");
  const [description, setDescription] = useState(task.description ?? "");
  const [groups, setGroups] = useState<string[]>(task.groups ?? []);
  const [flags, setFlags] = useState<string[]>(task.flags ?? []);
  const [descEditing, setDescEditing] = useState(false);
  const { branches } = useWorkspace();
  const [branch, setBranch] = useState<string>(task.branch);
  const [calOpen, setCalOpen] = useState(false);
  const [branchOpen, setBranchOpen] = useState(false);
  const calRef = useRef<HTMLDivElement>(null);
  const branchRef = useRef<HTMLDivElement>(null);
  // Só fecha se o clique COMEÇOU no backdrop (evita fechar ao selecionar texto
  // e soltar o mouse fora do popup).
  const downOnBackdrop = useRef(false);

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
    onSave({ title: trimmed, due: due || undefined, description: description || undefined, branch, groups, flags });
  };
  const toggleFlag = (id: string) => setFlags((f) => (f.includes(id) ? f.filter((x) => x !== id) : [...f, id]));

  return (
    <motion.div
      key="edit-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      className="fixed inset-0 z-[100] flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)" }}
      onMouseDown={(e) => { downOnBackdrop.current = e.target === e.currentTarget; }}
      onClick={(e) => { if (e.target === e.currentTarget && downOnBackdrop.current) onCancel(); }}
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
        <div className="mb-5 flex items-center justify-between">
          <p className="text-[15px] font-semibold text-white">Editar tarefa</p>
          <div className="flex items-center gap-2">
            <motion.button
              whileHover={{ scale: 1.08, background: "rgba(255,255,255,0.10)" }}
              whileTap={{ scale: 0.93 }}
              onClick={onDuplicate}
              className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-xl transition-colors"
              style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)" }}
              aria-label="Duplicar tarefa"
              title="Duplicar tarefa"
            >
              <Icon name="Copy" size={14} strokeWidth={1.75} className="text-white/70" />
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.08, background: "rgba(239,68,68,0.18)" }}
              whileTap={{ scale: 0.93 }}
              onClick={onDelete}
              className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-xl transition-colors"
              style={{ background: "rgba(239,68,68,0.10)", border: "1px solid rgba(239,68,68,0.25)" }}
              aria-label="Excluir tarefa"
              title="Excluir tarefa"
            >
              <Icon name="Trash2" size={14} strokeWidth={1.75} style={{ color: "#f87171" }} />
            </motion.button>
          </div>
        </div>

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
            {(() => { const ws = getWorkspace(branch); return (
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
                  {branches.map((w) => {
                    const isActive = branch === w.id;
                    return (
                      <motion.button
                        key={w.id}
                        type="button"
                        whileHover={{ x: 3 }}
                        onClick={() => { setBranch(w.id); setBranchOpen(false); }}
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

          {/* Flags */}
          <div>
            <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-widest text-white/40">Flags</label>
            <div className="flex flex-wrap gap-1.5">
              {TASK_FLAGS.map((f) => {
                const on = flags.includes(f.id);
                return (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => toggleFlag(f.id)}
                    className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-medium transition-colors"
                    style={{
                      border: `1px solid ${on ? f.color : "var(--border)"}`,
                      background: on ? `${f.color}22` : "transparent",
                      color: on ? f.color : "var(--muted)",
                    }}
                  >
                    <Icon name={f.icon} size={12} strokeWidth={2} />
                    {f.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Grupos */}
          <div>
            <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-widest text-white/40">Grupos</label>
            <GroupChipInput groups={groups} onChange={setGroups} suggestions={allGroups} />
          </div>

          {/* Descrição — links clicáveis; clique no texto pra editar */}
          <div>
            <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-widest text-white/40">Descrição</label>
            {descEditing || !description.trim() ? (
              <textarea
                autoFocus={descEditing}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                onBlur={() => setDescEditing(false)}
                placeholder="Detalhes, observações, notas… (links viram clicáveis)"
                rows={3}
                className="w-full resize-none rounded-xl px-3.5 py-2.5 text-[13px] text-white/90 outline-none placeholder:text-white/25 transition-colors"
                style={FIELD_STYLE}
              />
            ) : (
              <div
                onClick={() => setDescEditing(true)}
                title="Clique para editar"
                className="min-h-[46px] cursor-text whitespace-pre-wrap break-words rounded-xl px-3.5 py-2.5 text-[13px] leading-relaxed text-white/90 transition-colors"
                style={FIELD_STYLE}
              >
                <LinkifiedText text={description} />
              </div>
            )}
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
      className="fixed inset-0 z-[110] flex items-center justify-center"
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

/* ── Chip de branch clicável (na visão "todas") — troca a branch da task ──
   O menu vai num portal com posição `fixed`: as linhas de task usam transform
   (framer), o que cria stacking contexts — sem o portal, o dropdown fica atrás
   das linhas seguintes. */
function BranchChip({ task }: { task: Task }) {
  const { branches } = useWorkspace();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const ws = getWorkspace(task.branch);

  // Fecha ao clicar fora ou rolar (menu fixo não acompanha o scroll).
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onScroll = () => setOpen(false);
    document.addEventListener("mousedown", onDown);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open]);

  const toggle = () => {
    if (!open) {
      const r = btnRef.current?.getBoundingClientRect();
      if (r) {
        // Se não couber embaixo (ex: task perto do rodapé no mobile), abre pra cima.
        const estH = branches.length * 36 + 14; // altura estimada do menu
        const openUp = r.bottom + 6 + estH > window.innerHeight - 8;
        setCoords({ top: openUp ? Math.max(8, r.top - estH - 6) : r.bottom + 6, left: r.right });
      }
    }
    setOpen((o) => !o);
  };

  const pick = (branchId: string) => {
    setOpen(false);
    if (branchId === task.branch) return;
    // Otimista: o board aplica a troca na hora; depois persiste no banco.
    window.dispatchEvent(new CustomEvent("maestro:task-updated", { detail: { id: task.id, patch: { branch: branchId } } }));
    fetch("/api/tasks", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: task.id, branch: branchId }),
    }).catch(() => {});
    toast("Branch alterada", "edit");
  };

  return (
    <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
      <button
        ref={btnRef}
        onClick={toggle}
        className="flex cursor-pointer items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-medium transition-[filter] hover:brightness-125"
        style={{ background: `${ws.accent}1f`, color: ws.accent }}
      >
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: ws.accent }} />
        {ws.name}
        <Icon name="ChevronDown" size={10} strokeWidth={2.25} className="-mr-0.5 opacity-70" />
      </button>

      {open && coords && createPortal(
        <div
          ref={menuRef}
          className="fixed z-[200]"
          style={{ top: coords.top, left: coords.left, transform: "translateX(-100%)" }}
          onClick={(e) => e.stopPropagation()}
        >
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.14 }}
            className="min-w-[170px] rounded-xl p-1.5"
            style={{ background: "rgba(20,20,22,0.98)", border: "1px solid rgba(255,255,255,0.12)", boxShadow: "0 18px 50px -16px rgba(0,0,0,0.85)" }}
          >
            {branches.map((b) => {
              const on = b.id === task.branch;
              return (
                <button
                  key={b.id}
                  onClick={() => pick(b.id)}
                  className={cn(
                    "flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-[12px] transition-colors",
                    on ? "text-white" : "text-white/55 hover:text-white/85",
                  )}
                  style={{ background: on ? "rgba(255,255,255,0.07)" : "transparent" }}
                >
                  <WorkspaceDot accent={b.accent} accent2={b.accent2} icon={b.icon} />
                  <span className="min-w-0 flex-1 truncate">{b.name}</span>
                  {on && <Icon name="Check" size={12} style={{ color: b.accent }} />}
                </button>
              );
            })}
          </motion.div>
        </div>,
        document.body,
      )}
    </div>
  );
}

function TaskRow({ task, onToggle, onDelete, onEdit, onOpenEdit, showBranch, draggable, onMove }: {
  task: Task;
  onToggle: (id: string) => void;
  onDelete?: (id: string, title: string) => void;
  onEdit?: (id: string, title: string) => void;
  onOpenEdit?: (task: Task) => void;
  showBranch?: boolean;
  draggable?: boolean;
  onMove?: (id: string, due: string) => void;
}) {
  const ws = getWorkspace(task.branch);
  const [dragging, setDragging] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const suppressClick = useRef(false);
  const touch = useRef({
    startX: 0, startY: 0, timer: null as ReturnType<typeof setTimeout> | null,
    active: false, ghost: null as HTMLDivElement | null, target: null as Element | null,
  });

  // Drag por toque (mobile): segurar ~300ms ativa; arrastar sobre outro dia e soltar move.
  // (A API HTML5 draggable/onDrop só funciona com mouse — no touch nada dispara.)
  useEffect(() => {
    if (!draggable || !onMove) return;
    const el = rootRef.current;
    if (!el) return;
    const move = onMove;
    const st = touch.current;

    const setHighlight = (next: Element | null) => {
      if (st.target === next) return;
      if (st.target) { (st.target as HTMLElement).style.background = ""; (st.target as HTMLElement).style.boxShadow = ""; }
      if (next) { const n = next as HTMLElement; n.style.background = "rgba(255,255,255,0.05)"; n.style.boxShadow = "inset 0 0 0 1px rgba(255,255,255,0.2)"; }
      st.target = next;
    };
    const removeGhost = () => { if (st.ghost) { st.ghost.remove(); st.ghost = null; } };
    const end = (drop: boolean) => {
      if (st.timer) { clearTimeout(st.timer); st.timer = null; }
      if (!st.active) return;
      if (drop && st.target) {
        const due = (st.target as HTMLElement).getAttribute("data-day-due");
        if (due) move(task.id, due);
      }
      setHighlight(null); removeGhost();
      st.active = false; setDragging(false);
      suppressClick.current = true;
      setTimeout(() => { suppressClick.current = false; }, 400);
    };

    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      const t = e.touches[0];
      st.startX = t.clientX; st.startY = t.clientY; st.active = false;
      if (st.timer) clearTimeout(st.timer);
      st.timer = setTimeout(() => {
        st.active = true; setDragging(true);
        const g = document.createElement("div");
        g.textContent = task.title;
        g.style.cssText = "position:fixed;z-index:300;pointer-events:none;max-width:72vw;padding:7px 11px;border-radius:10px;background:rgba(20,20,22,0.96);border:1px solid rgba(255,255,255,0.16);color:#fff;font-size:13px;line-height:1;box-shadow:0 14px 34px rgba(0,0,0,0.6);transform:translate(-50%,-150%);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;";
        g.style.left = st.startX + "px"; g.style.top = st.startY + "px";
        document.body.appendChild(g); st.ghost = g;
        if (navigator.vibrate) { try { navigator.vibrate(12); } catch {} }
      }, 300);
    };
    const onMoveT = (e: TouchEvent) => {
      const t = e.touches[0]; if (!t) return;
      if (!st.active) {
        if (st.timer && (Math.abs(t.clientX - st.startX) > 10 || Math.abs(t.clientY - st.startY) > 10)) { clearTimeout(st.timer); st.timer = null; }
        return;
      }
      e.preventDefault(); // impede o scroll da página durante o arraste
      if (st.ghost) { st.ghost.style.left = t.clientX + "px"; st.ghost.style.top = t.clientY + "px"; }
      const under = document.elementFromPoint(t.clientX, t.clientY);
      setHighlight(under ? under.closest("[data-day-due]") : null);
    };
    const onEnd = () => end(true);
    const onCancel = () => end(false);

    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMoveT, { passive: false });
    el.addEventListener("touchend", onEnd, { passive: true });
    el.addEventListener("touchcancel", onCancel, { passive: true });
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMoveT);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onCancel);
      if (st.timer) clearTimeout(st.timer);
      removeGhost(); setHighlight(null);
    };
  }, [draggable, onMove, task.id, task.title]);

  return (
    // Wrapper que carrega o drag: HTML5 (mouse) + touch (mobile), separado do motion.div.
    <div
      ref={rootRef}
      draggable={draggable}
      onDragStart={draggable ? (e) => {
        e.dataTransfer.setData("text/task-id", task.id);
        e.dataTransfer.effectAllowed = "move";
        setDragging(true);
      } : undefined}
      onDragEnd={draggable ? () => setDragging(false) : undefined}
      className={cn(dragging && "opacity-40")}
    >
    <motion.div
      whileHover={{ x: 3 }}
      transition={{ duration: 0.12 }}
      onClick={() => { if (suppressClick.current) return; onOpenEdit?.(task); }}
      className="group flex cursor-pointer items-center gap-3 rounded-lg py-2 pl-1 pr-3 transition-colors hover:bg-white/[0.03]"
    >
      <button
        onClick={(e) => { e.stopPropagation(); onToggle(task.id); }}
        className="shrink-0 cursor-pointer"
        aria-label="toggle"
      >
        <div className="relative h-[18px] w-[18px]">
          <span className="block h-full w-full rounded-full border border-[var(--border-strong)]" />
          <AnimatePresence initial={false}>
            {task.done && (
              <motion.span
                key="done"
                initial={{ scale: 0, rotate: -90 }}
                animate={{ scale: 1, rotate: 0 }}
                exit={{ scale: 0, rotate: -90 }}
                transition={{ type: "spring", stiffness: 500, damping: 20 }}
                className="absolute inset-0 flex items-center justify-center rounded-full"
                style={{ background: ws.accent }}
              >
                <Icon name="Check" size={11} strokeWidth={2.5} className="text-white" />
              </motion.span>
            )}
          </AnimatePresence>
        </div>
      </button>

      <span className="flex min-w-0 flex-1 items-center gap-1.5">
        <span
          className={cn(
            "min-w-0 text-[13px] leading-relaxed",
            task.done ? "cursor-default text-muted-2 line-through" : "text-white/80"
          )}
        >
          {task.title}
        </span>
        {task.flags && task.flags.length > 0 && (
          <span className="flex shrink-0 items-center gap-1">
            {TASK_FLAGS.filter((f) => task.flags!.includes(f.id)).map((f) => (
              <span
                key={f.id}
                title={f.label}
                className="flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide"
                style={{ background: `${f.color}22`, color: f.color }}
              >
                <Icon name={f.icon} size={9} strokeWidth={2.5} />
                {f.label}
              </span>
            ))}
          </span>
        )}
        {task.recurring && (
          <Icon name="RefreshCcw" size={11} strokeWidth={2} className="shrink-0 text-muted-2" />
        )}
        {task.description && task.description.trim() && (
          <Icon name="FileText" size={11} strokeWidth={1.75} className="shrink-0 text-muted-2/70" />
        )}
        {task.groups && task.groups.length > 0 && (
          <span className="flex shrink-0 items-center gap-1">
            {task.groups.slice(0, 2).map((g) => (
              <span key={g} className="rounded-full bg-white/[0.06] px-1.5 py-0.5 text-[9px] font-medium text-white/45">{g}</span>
            ))}
            {task.groups.length > 2 && <span className="text-[9px] text-white/35">+{task.groups.length - 2}</span>}
          </span>
        )}
      </span>

      {showBranch && <BranchChip task={task} />}

      <div className="hidden sm:flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        <button
          onClick={(e) => { e.stopPropagation(); window.dispatchEvent(new CustomEvent("maestro:task-duplicate", { detail: { task } })); }}
          className="cursor-pointer rounded p-1 text-white/40 transition-colors hover:text-white/80"
          aria-label="Duplicar"
          title="Duplicar tarefa"
        >
          <Icon name="Copy" size={12} strokeWidth={1.75} />
        </button>
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
    </div>
  );
}

/* ── Input de grupos (chips + autocomplete) ─────────────────────── */
function GroupChipInput({ groups, onChange, suggestions }: {
  groups: string[];
  onChange: (g: string[]) => void;
  suggestions: string[];
}) {
  const [input, setInput] = useState("");
  const add = (raw: string) => {
    const v = raw.trim();
    setInput("");
    if (!v || groups.some((x) => x.toLowerCase() === v.toLowerCase())) return;
    onChange([...groups, v]);
  };
  const remove = (g: string) => onChange(groups.filter((x) => x !== g));
  const q = input.trim().toLowerCase();
  const filtered = suggestions
    .filter((s) => !groups.some((g) => g.toLowerCase() === s.toLowerCase()) && s.toLowerCase().includes(q))
    .slice(0, 6);
  const exactExists = suggestions.some((s) => s.toLowerCase() === q) || groups.some((g) => g.toLowerCase() === q);

  return (
    <div className="rounded-xl px-2.5 py-2" style={FIELD_STYLE}>
      <div className="flex flex-wrap items-center gap-1.5">
        {groups.map((g) => (
          <span key={g} className="flex items-center gap-1 rounded-full bg-white/[0.10] px-2 py-0.5 text-[11px] text-white/80">
            {g}
            <button type="button" onClick={() => remove(g)} className="cursor-pointer text-white/40 transition-colors hover:text-white">
              <Icon name="X" size={10} strokeWidth={2.5} />
            </button>
          </span>
        ))}
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); add(input); }
            if (e.key === "Backspace" && !input && groups.length) remove(groups[groups.length - 1]);
          }}
          placeholder={groups.length ? "adicionar…" : "ex: Decentral, Brand Sheep, Casa…"}
          className="min-w-[90px] flex-1 bg-transparent text-[13px] text-white/90 outline-none placeholder:text-white/25"
        />
      </div>
      {q && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {filtered.map((s) => (
            <button key={s} type="button" onClick={() => add(s)} className="cursor-pointer rounded-full border border-white/10 px-2 py-0.5 text-[11px] text-white/50 transition-colors hover:border-white/25 hover:text-white/80">
              {s}
            </button>
          ))}
          {!exactExists && (
            <button type="button" onClick={() => add(input)} className="cursor-pointer rounded-full border border-dashed border-white/15 px-2 py-0.5 text-[11px] text-white/50 transition-colors hover:text-white/80">
              + criar “{input.trim()}”
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Grupos ──────────────────────────────────────────────────────
   Lista os grupos do escopo (respeita o filtro de branch). Clicar num grupo
   expande a semana (Seg–Dom, navegável) com as tarefas daquele grupo por dia. */
function mondayOfWeek(offsetWeeks: number): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + offsetWeeks * 7);
  return d;
}

/** Segunda-feira da semana que contém `d`. */
function mondayOfDate(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
}

function GruposView({ tasks, groups, onToggle, onOpenEdit, onMoveTask, onRenameGroup, onReorderGroups, onCreateGroup, onAddTask }: {
  tasks: Task[];
  groups: string[];
  onToggle: (id: string) => void;
  onOpenEdit: (task: Task) => void;
  onMoveTask: (id: string, due: string) => void;
  onRenameGroup: (oldName: string, newName: string) => void;
  onReorderGroups: (order: string[]) => void;
  onCreateGroup: (name: string) => void;
  onAddTask: (list: TaskList, due: string, group: string, title: string) => void;
}) {
  const [weekOffset, setWeekOffset] = useState(0);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [jumpOpen, setJumpOpen] = useState(false);
  const [dragTaskId, setDragTaskId] = useState<string | null>(null);
  const [dragOverDay, setDragOverDay] = useState<string | null>(null);
  const [dragGroup, setDragGroup] = useState<string | null>(null);
  const [dragOverGroup, setDragOverGroup] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [newGroupDraft, setNewGroupDraft] = useState<string | null>(null);
  const jumpRef = useRef<HTMLDivElement>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFired = useRef(false);

  useEffect(() => {
    if (!jumpOpen) return;
    const handler = (e: MouseEvent) => {
      if (jumpRef.current && !jumpRef.current.contains(e.target as Node)) setJumpOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [jumpOpen]);

  const monday = mondayOfWeek(weekOffset);
  const weekDays = TASK_LISTS.map((w, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return { short: w.short, dateStr: fmtDate(d), dayNum: d.getDate(), month: d.getMonth() + 1, isToday: d.getTime() === todayMs(), list: w.id };
  });
  const weekStr = weekDays.map((d) => d.dateStr);
  const isCurrentWeek = weekOffset === 0;
  const rangeLabel = `${String(weekDays[0].dayNum).padStart(2, "0")}/${String(weekDays[0].month).padStart(2, "0")} – ${String(weekDays[6].dayNum).padStart(2, "0")}/${String(weekDays[6].month).padStart(2, "0")}`;

  const toggleGroup = (g: string) => setExpanded((prev) => {
    const next = new Set(prev);
    if (next.has(g)) next.delete(g); else next.add(g);
    return next;
  });

  const jumpToDate = (dateStr: string) => {
    const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(dateStr);
    if (!m) return;
    const picked = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
    const diffDays = Math.round((mondayOfDate(picked).getTime() - mondayOfDate(new Date()).getTime()) / 86400000);
    setWeekOffset(Math.round(diffDays / 7));
    setJumpOpen(false);
  };

  const startRename = (g: string) => { setRenaming(g); setRenameDraft(g); };
  const commitRename = () => {
    if (renaming) onRenameGroup(renaming, renameDraft);
    setRenaming(null);
  };

  // Toque e segure = alternativa ao duplo clique pra renomear no mobile.
  const cancelLongPress = () => {
    if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; }
  };
  const handleTouchStart = (g: string) => {
    longPressFired.current = false;
    cancelLongPress();
    longPressTimer.current = setTimeout(() => { longPressFired.current = true; startRename(g); }, 500);
  };
  const handleNameClick = (e: React.MouseEvent) => {
    if (longPressFired.current) { e.preventDefault(); e.stopPropagation(); longPressFired.current = false; }
  };

  // Drag reorder dos grupos (cards inteiros).
  const handleGroupDrop = (target: string) => {
    if (!dragGroup || dragGroup === target) { setDragGroup(null); setDragOverGroup(null); return; }
    const next = groups.filter((g) => g !== dragGroup);
    const idx = next.indexOf(target);
    next.splice(idx, 0, dragGroup);
    onReorderGroups(next);
    setDragGroup(null);
    setDragOverGroup(null);
  };

  const submitNewGroup = () => {
    if (newGroupDraft && newGroupDraft.trim()) onCreateGroup(newGroupDraft);
    setNewGroupDraft(null);
  };

  return (
    <div>
      {/* Navegador de semana */}
      <div className="relative mb-5 flex items-center justify-center gap-2" ref={jumpRef}>
        <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.95 }} onClick={() => setWeekOffset((w) => w - 1)}
          className="flex h-7 w-7 items-center justify-center rounded-lg text-muted transition-colors hover:bg-white/[0.05] hover:text-white">
          <Icon name="ChevronRight" size={14} strokeWidth={2} className="rotate-180" />
        </motion.button>
        <button
          onClick={() => setJumpOpen((o) => !o)}
          className="min-w-[110px] rounded-lg px-2 py-1 text-center text-[13px] font-medium text-white/80 transition-colors hover:bg-white/[0.05] hover:text-white"
        >
          {rangeLabel}
        </button>
        <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.95 }} onClick={() => setWeekOffset((w) => w + 1)}
          className="flex h-7 w-7 items-center justify-center rounded-lg text-muted transition-colors hover:bg-white/[0.05] hover:text-white">
          <Icon name="ChevronRight" size={14} strokeWidth={2} />
        </motion.button>
        <AnimatePresence>
          {!isCurrentWeek && (
            <motion.button initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }}
              onClick={() => setWeekOffset(0)}
              className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1 text-[11px] text-muted transition-colors hover:text-white">
              Esta semana
            </motion.button>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {jumpOpen && (
            <motion.div
              initial={{ opacity: 0, y: -6, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.97 }}
              transition={{ duration: 0.16 }}
              className="absolute left-1/2 top-full z-20 mt-2 -translate-x-1/2 rounded-xl p-3"
              style={{ background: "rgba(20,20,22,0.98)", border: "1px solid rgba(255,255,255,0.12)", boxShadow: "0 24px 60px -12px rgba(0,0,0,0.85)" }}
            >
              <DatePicker value={weekStr[0]} onChange={jumpToDate} onClose={() => setJumpOpen(false)} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {groups.length === 0 && newGroupDraft === null ? (
        <p className="py-10 text-center text-sm text-muted-2">
          Nenhum grupo ainda. Abra uma tarefa (clique nela) e adicione grupos no campo “Grupos”, ou crie um abaixo.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {groups.map((g) => {
            const groupTasks = tasks.filter((t) => t.groups?.includes(g));
            const weekTasks = groupTasks.filter((t) => t.due && weekStr.includes(t.due));
            const isOpen = expanded.has(g);
            return (
              <div
                key={g}
                draggable={renaming !== g}
                onDragStart={() => setDragGroup(g)}
                onDragOver={(e) => { e.preventDefault(); if (dragGroup && dragGroup !== g) setDragOverGroup(g); }}
                onDragLeave={() => setDragOverGroup((cur) => (cur === g ? null : cur))}
                onDrop={(e) => { e.preventDefault(); handleGroupDrop(g); }}
                onDragEnd={() => { setDragGroup(null); setDragOverGroup(null); }}
                className={cn(
                  "rounded-xl border transition-colors",
                  dragOverGroup === g ? "border-white/40 bg-white/[0.03]" : "border-[var(--border)]",
                  dragGroup === g && "opacity-40"
                )}
              >
                <div className="flex w-full cursor-grab items-center gap-2 px-4 py-3 active:cursor-grabbing">
                  <button onClick={() => toggleGroup(g)} className="flex flex-1 cursor-pointer items-center gap-2.5 text-left">
                    <motion.span animate={{ rotate: isOpen ? 0 : -90 }} transition={{ duration: 0.18 }} className="shrink-0 text-muted-2">
                      <Icon name="ChevronDown" size={14} strokeWidth={2} />
                    </motion.span>
                    {renaming === g ? (
                      <input
                        autoFocus
                        value={renameDraft}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => setRenameDraft(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commitRename(); } if (e.key === "Escape") setRenaming(null); }}
                        onBlur={commitRename}
                        className="rounded-md bg-white/10 px-1.5 py-0.5 text-[14px] font-medium text-white outline-none"
                      />
                    ) : (
                      <span
                        onDoubleClick={(e) => { e.stopPropagation(); startRename(g); }}
                        onTouchStart={() => handleTouchStart(g)}
                        onTouchEnd={cancelLongPress}
                        onTouchMove={cancelLongPress}
                        onTouchCancel={cancelLongPress}
                        onClickCapture={handleNameClick}
                        onContextMenu={(e) => e.preventDefault()}
                        title="Duplo clique (ou toque e segure no celular) para renomear"
                        className="text-[14px] font-medium text-white/90"
                        style={{ WebkitTouchCallout: "none", WebkitUserSelect: "none", userSelect: "none" }}
                      >
                        {g}
                      </span>
                    )}
                    <span className={cn(
                      "rounded-full px-1.5 py-0.5 text-[10px] tabular-nums",
                      weekTasks.length ? "bg-white/10 text-white/60" : "bg-white/[0.04] text-muted-2"
                    )}>
                      {weekTasks.length} esta semana
                    </span>
                    <span className="flex-1" />
                    <span className="text-[11px] text-muted-2">{groupTasks.length} no total</span>
                  </button>
                </div>

                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div key="week"
                      initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                      transition={{ type: "spring", stiffness: 340, damping: 32 }} style={{ overflow: "hidden" }}>
                      <div className="grid grid-cols-1 gap-2 border-t border-[var(--border)] p-3 sm:grid-cols-7">
                        {weekDays.map((day) => {
                          const dayTasks = weekTasks.filter((t) => t.due === day.dateStr);
                          const cellKey = `${g}:${day.dateStr}`;
                          const isDragOver = dragOverDay === cellKey;
                          return (
                            <div
                              key={day.dateStr}
                              onDragOver={(e) => { e.preventDefault(); setDragOverDay(cellKey); }}
                              onDragLeave={() => setDragOverDay((cur) => (cur === cellKey ? null : cur))}
                              onDrop={(e) => {
                                e.preventDefault();
                                setDragOverDay(null);
                                if (dragTaskId) onMoveTask(dragTaskId, day.dateStr);
                                setDragTaskId(null);
                              }}
                              className={cn(
                                "rounded-lg p-2 transition-colors",
                                isDragOver ? "bg-white/[0.10] ring-1 ring-white/25" : day.isToday ? "bg-white/[0.05]" : "bg-white/[0.02]"
                              )}
                            >
                              <div className="mb-1.5 flex items-center justify-between">
                                <span className={cn("text-[10px] font-semibold uppercase tracking-wider", day.isToday ? "text-white" : "text-muted-2")}>{day.short}</span>
                                <span className={cn("text-[10px] tabular-nums", day.isToday ? "text-white/70" : "text-muted-2")}>{day.dayNum}</span>
                              </div>
                              <div className="flex flex-col gap-1">
                                {dayTasks.map((t) => (
                                  <div
                                    key={t.id}
                                    draggable
                                    onDragStart={(e) => { setDragTaskId(t.id); e.dataTransfer.effectAllowed = "move"; }}
                                    onDragEnd={() => setDragTaskId(null)}
                                    onClick={() => onOpenEdit(t)}
                                    className={cn(
                                      "flex cursor-grab items-start gap-1.5 rounded px-1 py-0.5 transition-colors hover:bg-white/[0.05] active:cursor-grabbing",
                                      dragTaskId === t.id && "opacity-30"
                                    )}
                                  >
                                    <span onClick={(e) => { e.stopPropagation(); onToggle(t.id); }}
                                      className="mt-[3px] flex h-3 w-3 shrink-0 items-center justify-center rounded-full border border-[var(--border-strong)]"
                                      style={{ background: t.done ? getWorkspace(t.branch).accent : "transparent" }}>
                                      {t.done && <Icon name="Check" size={8} strokeWidth={3} className="text-white" />}
                                    </span>
                                    <span className={cn("text-[11px] leading-snug", t.done ? "text-muted-2 line-through" : "text-white/75")}>{t.title}</span>
                                  </div>
                                ))}
                                {dayTasks.length === 0 && !isDragOver && (
                                  <p className="text-[11px] text-muted-2/40">—</p>
                                )}
                              </div>
                              <GroupDayAddRow onAdd={(title) => onAddTask(day.list, day.dateStr, g, title)} />
                            </div>
                          );
                        })}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}

          {/* Criar novo grupo */}
          {newGroupDraft !== null ? (
            <div className="flex items-center gap-2 rounded-xl px-4 py-2.5" style={FIELD_STYLE}>
              <Icon name="Layers" size={13} strokeWidth={1.75} className="shrink-0 text-muted-2" />
              <input
                autoFocus
                value={newGroupDraft}
                onChange={(e) => setNewGroupDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submitNewGroup(); } if (e.key === "Escape") setNewGroupDraft(null); }}
                onBlur={submitNewGroup}
                placeholder="Nome do novo grupo…"
                className="flex-1 bg-transparent text-[13px] text-white/90 outline-none placeholder:text-white/25"
              />
            </div>
          ) : (
            <motion.button
              whileHover={{ x: 2 }}
              onClick={() => setNewGroupDraft("")}
              className="mt-1 flex cursor-pointer items-center gap-2 rounded-lg px-1 py-1.5 text-[12px] text-muted-2 transition-colors hover:text-muted"
            >
              <Icon name="Plus" size={13} strokeWidth={2} />
              Novo grupo
            </motion.button>
          )}
        </div>
      )}
    </div>
  );
}

/** Linha compacta pra adicionar task direto num dia dentro de um grupo. */
function GroupDayAddRow({ onAdd }: { onAdd: (title: string) => void }) {
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
      <button
        onClick={() => setAdding(true)}
        className="mt-1 flex w-full cursor-pointer items-center gap-1 rounded px-1 py-0.5 text-[10px] text-muted-2/60 transition-colors hover:text-muted-2"
      >
        <Icon name="Plus" size={10} strokeWidth={2} />
        adicionar
      </button>
    );
  }

  return (
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
      className="mt-1 w-full rounded bg-white/[0.06] px-1 py-0.5 text-[11px] text-white/85 outline-none placeholder:text-white/25"
    />
  );
}
