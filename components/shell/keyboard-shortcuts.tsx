"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter, usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { useWorkspace } from "@/lib/workspace-context";
import { useToast } from "@/components/ui/toast";
import { WorkspaceDot } from "@/components/shell/header";
import { Icon } from "@/components/ui/icon";
import { TODAY_LIST } from "@/lib/mock/tasks";

/** dd/mm/aaaa de hoje. */
function todayStr(): string {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
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
  const { branches, active, activeWorkspace, setActive, setAllBranches } = useWorkspace();
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
    async (title: string) => {
      const trimmed = title.trim();
      if (!trimmed) return;
      setQuickAdd(false);
      try {
        const res = await fetch("/api/tasks", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ title: trimmed, branch: active, list: TODAY_LIST, due: todayStr() }),
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

  return (
    <AnimatePresence>
      {quickAdd && (
        <QuickAddTask
          branchName={activeWorkspace.name}
          accent={activeWorkspace.accent}
          accent2={activeWorkspace.accent2}
          icon={activeWorkspace.icon}
          onClose={() => setQuickAdd(false)}
          onSubmit={createTask}
        />
      )}
    </AnimatePresence>
  );
}

/* ── Overlay de criação rápida ─────────────────────────────────── */
function QuickAddTask({
  branchName, accent, accent2, icon, onClose, onSubmit,
}: {
  branchName: string;
  accent: string;
  accent2: string;
  icon: string;
  onClose: () => void;
  onSubmit: (title: string) => void;
}) {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

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
          <span className="text-[12px] font-medium text-muted">Nova tarefa</span>
          <span className="ml-auto flex items-center gap-1.5 rounded-full py-0.5 pl-0.5 pr-2"
            style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}>
            <WorkspaceDot accent={accent} accent2={accent2} icon={icon} />
            <span className="text-[11px] text-white/70">{branchName}</span>
          </span>
        </div>
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); onSubmit(value); }
            if (e.key === "Escape") { e.preventDefault(); onClose(); }
          }}
          placeholder="O que precisa ser feito?"
          className="w-full rounded-xl bg-white/[0.04] px-3.5 py-2.5 text-sm text-white outline-none placeholder:text-muted-2"
          style={{ border: "1px solid rgba(255,255,255,0.08)" }}
        />
        <div className="mt-2 flex items-center justify-between px-1 text-[11px] text-muted-2">
          <span>Cai em <strong className="text-white/60">Hoje</strong></span>
          <span><kbd className="rounded bg-white/10 px-1.5 py-0.5 font-mono">Enter</kbd> criar · <kbd className="rounded bg-white/10 px-1.5 py-0.5 font-mono">Esc</kbd> fechar</span>
        </div>
      </motion.div>
    </motion.div>
  );
}
