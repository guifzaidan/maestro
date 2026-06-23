"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useWorkspace } from "@/lib/workspace-context";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";

export function ContextSwitcher() {
  const { active, setActive, branches, activeWorkspace } = useWorkspace();
  const [open, setOpen] = useState(false);
  const current = activeWorkspace;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="glow glass-hover flex w-full items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-left"
      >
        <WorkspaceBadge icon={current.icon} accent={current.accent} accent2={current.accent2} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">{current.name}</span>
          <span className="block truncate text-[11px] text-muted-2">{current.tagline}</span>
        </span>
        <Icon
          name="ChevronDown"
          size={16}
          className={cn("text-muted transition-transform", open && "rotate-180")}
        />
      </button>

      <AnimatePresence>
        {open && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
            <motion.div
              initial={{ opacity: 0, y: -6, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.98 }}
              transition={{ duration: 0.15 }}
              style={{ background: "#141417" }}
              className="absolute left-0 right-0 top-full z-20 mt-2 space-y-1 rounded-2xl border border-[var(--border-strong)] p-1.5 shadow-2xl shadow-black/60"
            >
              <p className="px-2 py-1 text-[10px] font-medium uppercase tracking-wider text-muted-2">
                Branch ativo
              </p>
              {branches.map((w) => {
                const isActive = w.id === active;
                return (
                  <button
                    key={w.id}
                    onClick={() => {
                      setActive(w.id);
                      setOpen(false);
                    }}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors",
                      isActive ? "bg-[var(--surface-2)]" : "hover:bg-[var(--surface)]",
                    )}
                  >
                    <WorkspaceBadge icon={w.icon} accent={w.accent} accent2={w.accent2} size={28} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{w.name}</span>
                      <span className="block truncate text-[11px] text-muted-2">{w.tagline}</span>
                    </span>
                    {isActive && <Icon name="Check" size={15} style={{ color: w.accent }} />}
                  </button>
                );
              })}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

export function WorkspaceBadge({
  icon,
  accent,
  accent2,
  size = 34,
}: {
  icon: string;
  accent: string;
  accent2: string;
  size?: number;
}) {
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-xl text-white"
      style={{
        width: size,
        height: size,
        background: `linear-gradient(135deg, ${accent}, ${accent2})`,
        boxShadow: `0 6px 16px -6px ${accent}`,
      }}
    >
      <Icon name={icon} size={size * 0.5} strokeWidth={2} />
    </span>
  );
}
