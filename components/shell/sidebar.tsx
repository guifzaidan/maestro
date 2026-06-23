"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ContextSwitcher } from "./context-switcher";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/", label: "Dashboard", icon: "LayoutDashboard" },
  { href: "/tasks", label: "Tarefas", icon: "ListTodo" },
  { href: "/agent", label: "Agente", icon: "Bot" },
  { href: "/integrations", label: "Integrações", icon: "Plug" },
  { href: "/settings", label: "Configurações", icon: "Settings" },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex w-[264px] shrink-0 flex-col gap-6 p-4">
      {/* Brand */}
      <div className="flex items-center gap-2.5 px-2 pt-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white text-black">
          <Icon name="Zap" size={17} strokeWidth={2.4} />
        </span>
        <span className="text-[15px] font-semibold tracking-tight">
          orquestra<span className="text-muted">.hub</span>
        </span>
      </div>

      <ContextSwitcher />

      {/* Nav */}
      <nav className="flex flex-1 flex-col gap-1">
        {NAV.map((item) => {
          const active =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors",
                active
                  ? "bg-[var(--surface-2)] font-medium text-white"
                  : "text-muted hover:bg-[var(--surface)] hover:text-white",
              )}
            >
              <Icon
                name={item.icon}
                size={18}
                style={active ? { color: "var(--accent)" } : undefined}
              />
              {item.label}
              {active && (
                <span
                  className="ml-auto h-1.5 w-1.5 rounded-full"
                  style={{ background: "var(--accent)", boxShadow: "0 0 8px var(--accent)" }}
                />
              )}
            </Link>
          );
        })}
      </nav>

      {/* User */}
      <div className="glass flex items-center gap-3 rounded-2xl p-2.5">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-zinc-600 to-zinc-800 text-xs font-semibold">
          GZ
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">Guilherme</p>
          <p className="truncate text-[11px] text-muted-2">Orquestrador</p>
        </div>
        <Icon name="Settings" size={16} className="text-muted-2" />
      </div>
    </aside>
  );
}
