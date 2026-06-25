"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useRouter, usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { useWorkspace, getWorkspace } from "@/lib/workspace-context";
import { useToast } from "@/components/ui/toast";
import { WorkspaceDot } from "@/components/shell/header";
import { Icon } from "@/components/ui/icon";
import { DatePicker } from "@/components/ui/date-picker";
import { TODAY_LIST, type TaskList } from "@/lib/mock/tasks";
import { cn } from "@/lib/utils";

/** Linha de tarefa vinda de /api/tasks usada na busca do overlay. */
interface QuickTask {
  id: string;
  title: string;
  branch: string;
  done: boolean;
}

/** Remove acentos e baixa a caixa pra busca tolerante. */
function norm(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** dd/mm/aaaa de hoje. */
function todayStr(): string {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

const DOW_TO_LIST: Record<number, TaskList> = { 0: "dom", 1: "seg", 2: "ter", 3: "qua", 4: "qui", 5: "sex", 6: "sab" };

/** Deriva o dia da semana (seg..dom) de uma data dd/mm/aaaa; fallback pra hoje. */
function listForDue(due: string): TaskList {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(due.trim());
  if (!m) return TODAY_LIST;
  const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  return DOW_TO_LIST[d.getDay()] ?? TODAY_LIST;
}

/** Rótulo amigável pra uma data dd/mm/aaaa: "Hoje", "Amanhã" ou "Seg, 30/06". */
function dueLabel(due: string): string {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(due.trim());
  if (!m) return "sem data";
  const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1])); d.setHours(0, 0, 0, 0);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const diff = Math.round((d.getTime() - today.getTime()) / 86400000);
  if (diff === 0) return "Hoje";
  if (diff === 1) return "Amanhã";
  if (diff === -1) return "Ontem";
  const WD = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
  return `${WD[d.getDay()]}, ${m[1]}/${m[2]}`;
}

/**
 * Atalhos globais de teclado do maestro:
 *  - Alt + 1…9    → troca para a branch N (ordem do dropdown)
 *  - Alt + 0      → todas as branches
 *  - ⌘/Ctrl + I   → criação rápida de tarefa (overlay)
 *  - ⌘/Ctrl + B   → novo chat com o maestro
 */
export function KeyboardShortcuts() {
  const router = useRouter();
  const pathname = usePathname();
  const { branches, active, setActive, setAllBranches } = useWorkspace();
  const { toast } = useToast();
  const [quickAdd, setQuickAdd] = useState(false);

  // Refs estáveis pro listener global (sem re-registrar a cada render).
  const branchesRef = useRef(branches);
  branchesRef.current = branches;

  const startChat = useCallback(() => {
    if (pathname === "/") {
      window.dispatchEvent(new CustomEvent("maestro:new-chat"));
    } else {
      sessionStorage.setItem("maestro:start-chat", "1");
      router.push("/");
    }
  }, [pathname, router]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Branches: Alt + dígito (0 = todas). Usa e.code (DigitN) porque Alt+número
      // gera caractere especial em alguns teclados — o código físico é estável.
      if (e.altKey && !e.ctrlKey && !e.metaKey) {
        const m = /^Digit([0-9])$/.exec(e.code);
        if (!m) return;
        e.preventDefault();
        const n = Number(m[1]);
        const list = branchesRef.current;
        if (n === 0) {
          setAllBranches(true);
          toast("Todas as branches", "info");
          return;
        }
        const b = list[n - 1];
        if (b) {
          setAllBranches(false);
          setActive(b.id);
          toast(`Branch: ${b.name}`, "info");
        }
        return;
      }

      // Ações: ⌘/Ctrl + I (nova tarefa) e ⌘/Ctrl + B (chat).
      const mod = e.metaKey || e.ctrlKey;
      if (!mod || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === "i") {
        e.preventDefault();
        setQuickAdd(true);
      } else if (k === "b") {
        e.preventDefault();
        startChat();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setActive, setAllBranches, toast, startChat]);

  const createTask = useCallback(
    async (title: string, due: string = todayStr()) => {
      const trimmed = title.trim();
      if (!trimmed) return;
      setQuickAdd(false);
      try {
        const res = await fetch("/api/tasks", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ title: trimmed, branch: active, list: listForDue(due), due }),
        });
        const data = await res.json();
        if (data.task) {
          toast("Tarefa criada", "create");
          window.dispatchEvent(new CustomEvent("maestro:tasks-changed"));
        }
      } catch {
        toast("Não consegui criar a tarefa", "error");
      }
    },
    [active, toast],
  );

  // Marca/desmarca uma tarefa existente (a partir da busca do overlay).
  const toggleDone = useCallback(
    async (id: string, done: boolean) => {
      toast(done ? "Tarefa concluída" : "Tarefa reaberta", done ? "success" : "info");
      window.dispatchEvent(new CustomEvent("maestro:tasks-changed"));
      try {
        await fetch("/api/tasks", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ id, done }),
        });
      } catch {}
    },
    [toast],
  );

  return (
    <AnimatePresence>
      {quickAdd && (
        <QuickAddTask
          onClose={() => setQuickAdd(false)}
          onSubmit={createTask}
          onToggleDone={toggleDone}
        />
      )}
    </AnimatePresence>
  );
}

/* ── Overlay de criação rápida + busca ─────────────────────────── */
function QuickAddTask({
  onClose, onSubmit, onToggleDone,
}: {
  onClose: () => void;
  onSubmit: (title: string, due: string) => void;
  onToggleDone: (id: string, done: boolean) => void;
}) {
  const { branches, active: activeBranch, allBranches, activeWorkspace, setActive, setAllBranches } = useWorkspace();
  const [value, setValue] = useState("");
  const [due, setDue] = useState(todayStr());
  const [allTasks, setAllTasks] = useState<QuickTask[]>([]);
  // Concluídas localmente nesta sessão do overlay (otimista, sem refetch).
  const [doneLocal, setDoneLocal] = useState<Record<string, boolean>>({});
  // -1 = linha "criar"; 0..n = resultados da busca.
  const [sel, setSel] = useState(-1);
  const [branchOpen, setBranchOpen] = useState(false);
  const [dateOpen, setDateOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  // Carrega as tarefas uma vez quando o overlay abre.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/tasks")
      .then((r) => r.json())
      .then((d) => { if (!cancelled) setAllTasks((d.tasks ?? []) as QuickTask[]); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const q = value.trim();
  const matches = useMemo(() => {
    if (!q) return [] as QuickTask[];
    const nq = norm(q);
    return allTasks
      .filter((t) => allBranches || t.branch === activeBranch)
      .filter((t) => norm(t.title).includes(nq))
      .slice(0, 6);
  }, [q, allTasks, allBranches, activeBranch]);

  // Reposiciona a seleção quando os resultados mudam (volta pra linha "criar").
  useEffect(() => { setSel(-1); }, [q]);

  const toggle = (t: QuickTask) => {
    const next = !(doneLocal[t.id] ?? t.done);
    setDoneLocal((p) => ({ ...p, [t.id]: next }));
    onToggleDone(t.id, next);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") { e.preventDefault(); onClose(); return; }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSel((s) => Math.min(s + 1, matches.length - 1));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setSel((s) => Math.max(s - 1, -1));
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      if (sel >= 0 && matches[sel]) toggle(matches[sel]);
      else onSubmit(value, due);
    }
  };

  return (
    <motion.div
      className="fixed inset-0 z-[150] flex items-start justify-center px-4 pt-[18vh]"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      onClick={onClose}
      style={{ background: "rgba(0,0,0,0.45)", backdropFilter: "blur(3px)", WebkitBackdropFilter: "blur(3px)" }}
    >
      <motion.div
        initial={{ opacity: 0, y: -16, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -12, scale: 0.97 }}
        transition={{ type: "spring", stiffness: 380, damping: 30 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[460px] rounded-2xl p-3.5"
        style={{ background: "rgba(20,20,23,0.92)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", border: "1px solid rgba(255,255,255,0.12)", boxShadow: "0 24px 60px -20px rgba(0,0,0,0.8)" }}
      >
        <div className="mb-2.5 flex items-center gap-2 px-0.5">
          <Icon name="Plus" size={14} strokeWidth={2} className="text-muted" />
          <span className="text-[12px] font-medium text-muted">Nova tarefa ou buscar</span>

          {/* Seletor de branch — clica pra trocar o destino/escopo */}
          <div className="relative ml-auto">
            <button
              type="button"
              onClick={() => setBranchOpen((o) => !o)}
              className="flex items-center gap-1.5 rounded-full py-0.5 pl-0.5 pr-1.5 transition-colors hover:bg-white/[0.08]"
              style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}
            >
              {allBranches ? (
                <span className="flex h-[18px] w-[18px] items-center justify-center rounded-full border border-[var(--border-strong)] text-muted">
                  <Icon name="GitPullRequest" size={10} strokeWidth={2} />
                </span>
              ) : (
                <WorkspaceDot accent={activeWorkspace.accent} accent2={activeWorkspace.accent2} icon={activeWorkspace.icon} />
              )}
              <span className="text-[11px] text-white/70">{allBranches ? "Todas" : activeWorkspace.name}</span>
              <motion.span animate={{ rotate: branchOpen ? 180 : 0 }} transition={{ duration: 0.18 }}>
                <Icon name="ChevronDown" size={11} className="text-muted-2" />
              </motion.span>
            </button>

            <AnimatePresence>
              {branchOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setBranchOpen(false)} />
                  <motion.div
                    initial={{ opacity: 0, y: -6, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -6, scale: 0.96 }}
                    transition={{ type: "spring", stiffness: 420, damping: 30 }}
                    className="absolute right-0 top-full z-20 mt-2 min-w-[200px] rounded-xl p-1.5"
                    style={{ background: "rgba(20,20,22,0.98)", border: "1px solid rgba(255,255,255,0.12)", boxShadow: "0 24px 60px -12px rgba(0,0,0,0.85)" }}
                  >
                    {branches.map((w) => {
                      const isOn = !allBranches && w.id === activeBranch;
                      return (
                        <button
                          key={w.id}
                          type="button"
                          onClick={() => { setAllBranches(false); setActive(w.id); setBranchOpen(false); }}
                          className={cn(
                            "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] transition-colors",
                            isOn ? "text-white" : "text-white/55 hover:text-white/85",
                          )}
                          style={{ background: isOn ? "rgba(255,255,255,0.07)" : "transparent" }}
                        >
                          <WorkspaceDot accent={w.accent} accent2={w.accent2} icon={w.icon} />
                          <span className="min-w-0 flex-1 truncate">{w.name}</span>
                          {isOn && <Icon name="Check" size={13} style={{ color: w.accent }} />}
                        </button>
                      );
                    })}
                    <div className="mt-1 border-t border-[var(--border)] pt-1">
                      <button
                        type="button"
                        onClick={() => { setAllBranches(true); setBranchOpen(false); }}
                        className={cn(
                          "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] transition-colors",
                          allBranches ? "text-white" : "text-white/55 hover:text-white/85",
                        )}
                        style={{ background: allBranches ? "rgba(255,255,255,0.07)" : "transparent" }}
                      >
                        <span className="flex h-[18px] w-[18px] items-center justify-center rounded-full border border-[var(--border-strong)] text-muted">
                          <Icon name="GitPullRequest" size={10} strokeWidth={2} />
                        </span>
                        <span className="min-w-0 flex-1 truncate">Todas as branches</span>
                        {allBranches && <Icon name="Check" size={13} className="text-white/60" />}
                      </button>
                    </div>
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>
        </div>
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="O que precisa ser feito? (ou digite pra buscar)"
          className="w-full rounded-xl bg-white/[0.04] px-3.5 py-2.5 text-sm text-white outline-none placeholder:text-muted-2"
          style={{ border: "1px solid rgba(255,255,255,0.08)" }}
        />

        {/* Resultados da busca */}
        <AnimatePresence initial={false}>
          {matches.length > 0 && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.16 }}
              style={{ overflow: "hidden" }}
            >
              <div className="mt-2 flex flex-col gap-0.5">
                <p className="px-1 pb-1 pt-1 text-[10px] uppercase tracking-widest text-muted-2">Tarefas existentes</p>
                {matches.map((t, i) => {
                  const ws = getWorkspace(t.branch);
                  const isDone = doneLocal[t.id] ?? t.done;
                  const active = i === sel;
                  return (
                    <button
                      key={t.id}
                      onClick={() => toggle(t)}
                      onMouseEnter={() => setSel(i)}
                      className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors"
                      style={{ background: active ? "rgba(255,255,255,0.07)" : "transparent" }}
                    >
                      <span
                        className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition-colors"
                        style={{
                          borderColor: isDone ? "rgba(52,211,153,0.8)" : "rgba(255,255,255,0.25)",
                          background: isDone ? "rgba(52,211,153,0.8)" : "transparent",
                        }}
                      >
                        {isDone && <Icon name="Check" size={11} strokeWidth={3} className="text-black" />}
                      </span>
                      <span className={cn("min-w-0 flex-1 truncate text-[13px]", isDone ? "text-muted-2 line-through" : "text-white/90")}>
                        {t.title}
                      </span>
                      {allBranches && (
                        <span className="flex shrink-0 items-center gap-1 text-[10px] text-muted-2">
                          <span className="h-1.5 w-1.5 rounded-full" style={{ background: ws.accent }} />
                          {ws.name}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="mt-2 flex items-center justify-between px-1 text-[11px] text-muted-2">
          {/* Seletor de data — clica pra escolher outro dia */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setDateOpen((o) => !o)}
              className="flex items-center gap-1.5 rounded-lg px-1.5 py-1 transition-colors hover:bg-white/[0.06]"
            >
              <Icon name="Clock" size={12} strokeWidth={1.75} className="text-muted-2" />
              <span>Cai em <strong className="text-white/70">{dueLabel(due)}</strong></span>
            </button>

            <AnimatePresence>
              {dateOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setDateOpen(false)} />
                  <motion.div
                    initial={{ opacity: 0, y: -6, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -6, scale: 0.96 }}
                    transition={{ type: "spring", stiffness: 420, damping: 30 }}
                    className="absolute left-0 top-full z-20 mt-2 w-[260px] rounded-xl p-3"
                    style={{ background: "rgba(20,20,22,0.98)", border: "1px solid rgba(255,255,255,0.12)", boxShadow: "0 24px 60px -12px rgba(0,0,0,0.85)" }}
                  >
                    {/* Atalhos rápidos */}
                    <div className="mb-2.5 flex gap-1.5">
                      {[
                        { label: "Hoje", days: 0 },
                        { label: "Amanhã", days: 1 },
                        { label: "+7 dias", days: 7 },
                      ].map((opt) => (
                        <button
                          key={opt.label}
                          type="button"
                          onClick={() => {
                            const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + opt.days);
                            setDue(`${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`);
                            setDateOpen(false);
                          }}
                          className="flex-1 rounded-lg py-1.5 text-[11px] text-white/60 transition-colors hover:bg-white/[0.07] hover:text-white"
                          style={{ border: "1px solid rgba(255,255,255,0.08)" }}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                    <DatePicker value={due} onChange={(v) => v && setDue(v)} onClose={() => setDateOpen(false)} />
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>

          <span>
            <kbd className="rounded bg-white/10 px-1.5 py-0.5 font-mono">Enter</kbd> {sel >= 0 ? "concluir" : "criar"} · <kbd className="rounded bg-white/10 px-1.5 py-0.5 font-mono">Esc</kbd> fechar
          </span>
        </div>
      </motion.div>
    </motion.div>
  );
}
