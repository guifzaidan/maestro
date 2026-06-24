"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Icon } from "@/components/ui/icon";

/* ── Tipos ─────────────────────────────────────────────────────── */
export type ToastKind = "create" | "edit" | "delete" | "success" | "error" | "info";

type Toast = { id: number; message: string; kind: ToastKind };

/** Ícone + cor de acento por tipo de ação CRUD. */
const KIND_STYLE: Record<ToastKind, { icon: string; color: string; tint: string }> = {
  create:  { icon: "Plus",        color: "#34d399", tint: "rgba(52,211,153,0.14)" },
  edit:    { icon: "Pencil",      color: "#38bdf8", tint: "rgba(56,189,248,0.14)" },
  delete:  { icon: "Trash2",      color: "#fb7185", tint: "rgba(251,113,133,0.14)" },
  success: { icon: "Check",       color: "#34d399", tint: "rgba(52,211,153,0.14)" },
  error:   { icon: "AlertCircle", color: "#f87171", tint: "rgba(248,113,113,0.14)" },
  info:    { icon: "Sparkles",    color: "#e5e7eb", tint: "rgba(255,255,255,0.10)" },
};

/* ── Context ───────────────────────────────────────────────────── */
const ToastContext = createContext<{ toast: (message: string, kind?: ToastKind) => void } | null>(
  null,
);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast precisa estar dentro de <ToastProvider>");
  return ctx;
}

/* ── Provider ──────────────────────────────────────────────────── */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const idRef = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    (message: string, kind: ToastKind = "success") => {
      const id = ++idRef.current;
      setToasts((prev) => [...prev, { id, message, kind }]);
      setTimeout(() => dismiss(id), 3200);
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

/* ── Viewport ───────────────────────────────────────────────────── */
/* Mobile: topo centralizado — Desktop: canto inferior direito      */
function ToastViewport({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
  return (
    <div className="pointer-events-none fixed z-[200] flex flex-col gap-2.5
      top-5 left-1/2 -translate-x-1/2 items-center w-[320px] max-w-[calc(100vw-2.5rem)]
      sm:top-auto sm:bottom-5 sm:left-auto sm:right-5 sm:translate-x-0 sm:items-end">
      <AnimatePresence initial={false}>
        {toasts.map((t) => (
          <ToastTile key={t.id} toast={t} onDismiss={() => onDismiss(t.id)} />
        ))}
      </AnimatePresence>
    </div>
  );
}

function ToastTile({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const s = KIND_STYLE[toast.kind];
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 16, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, x: 24, scale: 0.95, transition: { duration: 0.18 } }}
      transition={{ type: "spring", stiffness: 420, damping: 32 }}
      onClick={onDismiss}
      className="pointer-events-auto relative flex w-full cursor-pointer items-center gap-3 overflow-hidden rounded-2xl px-3.5 py-3"
      style={{ background: "rgba(255,255,255,0.05)", backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)", border: "1px solid rgba(255,255,255,0.12)", boxShadow: "0 10px 30px -14px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.05)" }}
    >
      {/* Ícone com tint da cor da ação */}
      <span
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl"
        style={{ background: s.tint }}
      >
        <Icon name={s.icon} size={15} strokeWidth={2} color={s.color} />
      </span>

      <p className="min-w-0 flex-1 text-[13px] leading-tight text-foreground/90">{toast.message}</p>

      {/* Barra de progresso de auto-dismiss */}
      <motion.span
        className="absolute bottom-0 left-0 h-[2px] rounded-full"
        style={{ background: s.color, opacity: 0.6 }}
        initial={{ width: "100%" }}
        animate={{ width: "0%" }}
        transition={{ duration: 3.2, ease: "linear" }}
      />
    </motion.div>
  );
}
