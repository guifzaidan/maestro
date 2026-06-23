"use client";

import { useWorkspace } from "@/lib/workspace-context";
import { Dot } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";

export function ScopeFilter() {
  const { scope, setScope, branches } = useWorkspace();

  const options = [
    { id: "all" as const, label: "Todos", color: "#e4e4e7" },
    ...branches.map((w) => ({ id: w.id, label: w.name, color: w.accent })),
  ];

  return (
    <div className="glass flex max-w-full items-center gap-1 overflow-x-auto rounded-full p-1" style={{ scrollbarWidth: "none" }}>
      {options.map((o) => {
        const active = scope === o.id;
        return (
          <button
            key={o.id}
            onClick={() => setScope(o.id)}
            className={cn(
              "flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors",
              active ? "bg-[var(--surface-2)] text-white" : "text-muted hover:text-white",
            )}
          >
            <Dot color={o.color} size={7} />
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
