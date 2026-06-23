"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import type { CSSProperties, ReactNode } from "react";

export function GlassCard({
  children,
  className,
  glow = false,
  hover = false,
  style,
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  glow?: boolean;
  hover?: boolean;
  style?: CSSProperties;
  delay?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay, ease: [0.25, 0.46, 0.45, 0.94] }}
      whileHover={hover ? {
        y: -3,
        boxShadow: "0 24px 60px -20px rgba(0,0,0,0.8), 0 0 0 1px rgba(255,255,255,0.1)",
        transition: { duration: 0.2 },
      } : undefined}
      style={style}
      className={cn(
        "glass rounded-[var(--radius-card)]",
        glow && "glow",
        hover && "cursor-default",
        className,
      )}
    >
      {children}
    </motion.div>
  );
}

export function Pill({
  children,
  className,
  active = false,
  style,
}: {
  children: ReactNode;
  className?: string;
  active?: boolean;
  style?: CSSProperties;
}) {
  return (
    <span
      style={style}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium",
        active
          ? "text-white"
          : "text-muted border border-[var(--border)] bg-[var(--surface)]",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Dot({ color, size = 8, pulse = false }: { color: string; size?: number; pulse?: boolean }) {
  return (
    <span className={cn("relative inline-flex shrink-0 items-center justify-center", pulse && "pulse-dot")}>
      <span
        className="block rounded-full"
        style={{
          width: size,
          height: size,
          background: color,
          color,
          boxShadow: `0 0 8px -1px ${color}`,
        }}
      />
    </span>
  );
}

export function ProgressBar({
  value,
  max,
  color,
}: {
  value: number;
  max: number;
  color?: string;
}) {
  const pct = max === 0 ? 0 : Math.round((value / max) * 100);
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-2)]">
      <motion.div
        className="h-full rounded-full"
        initial={{ width: 0 }}
        animate={{ width: `${pct}%` }}
        transition={{ duration: 0.6, ease: [0.25, 0.46, 0.45, 0.94] }}
        style={{
          background: color
            ? `linear-gradient(90deg, ${color}, var(--accent-2))`
            : "linear-gradient(90deg, var(--accent), var(--accent-2))",
        }}
      />
    </div>
  );
}
