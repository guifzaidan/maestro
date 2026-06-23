"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion, useMotionValue, useTransform, useScroll } from "framer-motion";
import { useState, useEffect } from "react";
import { useWorkspace } from "@/lib/workspace-context";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/",         label: "Início",         icon: "House" },
  { href: "/tasks",    label: "Tarefas",        icon: "ListTodo" },
  { href: "/settings", label: "Configurações",   icon: "Settings" },
];

export function Header() {
  const pathname = usePathname();
  const { active, setActive, hideContextSwitcher, allBranches, setAllBranches, branches, activeWorkspace: ws } = useWorkspace();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className="pointer-events-none sticky top-0 z-30 w-full px-4 pt-3">
      <motion.div
        className="pointer-events-auto relative mx-auto flex max-w-7xl items-center rounded-[28px] px-3 py-2 sm:px-4 sm:py-2.5"
        animate={scrolled ? "scrolled" : "top"}
        variants={{
          top: {
            background: "rgba(7,7,8,0)",
            backdropFilter: "blur(0px)",
            borderColor: "rgba(255,255,255,0)",
            boxShadow: "none",
          },
          scrolled: {
            background: "rgba(255,255,255,0.05)",
            backdropFilter: "blur(22px)",
            borderColor: "rgba(255,255,255,0.12)",
            boxShadow: "0 10px 30px -14px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.05)",
          },
        }}
        transition={{ duration: 0.25, ease: "easeOut" }}
        style={{
          WebkitBackdropFilter: scrolled ? "blur(22px)" : "blur(0px)",
          border: "1px solid",
        }}
      >
        {/* Brand — sempre volta para a página principal no estado inicial */}
        <Link
          href="/"
          className="flex shrink-0 items-center"
          onClick={() => window.dispatchEvent(new CustomEvent("maestro:home"))}
        >
          <motion.span
            whileHover={{ scale: 1.05 }}
            transition={{ type: "spring", stiffness: 400, damping: 15 }}
            className="text-[26px] leading-none text-white sm:text-[30px]"
            style={{ fontFamily: "var(--font-handwritten)" }}
          >
            maestro
          </motion.span>
        </Link>

        {/* Nav — centered absolutely so it doesn't depend on sibling widths */}
        <nav className="absolute left-1/2 flex -translate-x-1/2 items-center gap-0.5">
          {NAV.map((item) => {
            const isActive = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            return (
              <motion.div
                key={item.href}
                className="relative"
                initial="rest"
                whileHover="hover"
                animate="rest"
              >
                {/* Hover background — responds to parent variant */}
                {!isActive && (
                  <motion.span
                    variants={{ rest: { opacity: 0 }, hover: { opacity: 1 } }}
                    transition={{ duration: 0.15 }}
                    className="absolute inset-0 rounded-lg"
                    style={{ background: "var(--surface)" }}
                  />
                )}
                {/* Active background pill (shared layoutId for slide animation) */}
                {isActive && (
                  <motion.span
                    layoutId="nav-pill"
                    className="absolute inset-0 rounded-lg"
                    style={{ background: "var(--surface-2)" }}
                    transition={{ type: "spring", stiffness: 380, damping: 32 }}
                  />
                )}
                <Link
                  href={item.href}
                  className={cn(
                    "relative z-10 flex items-center overflow-hidden px-2.5 py-1.5 transition-colors duration-200",
                    isActive ? "text-white" : "text-muted hover:text-white",
                  )}
                >
                  <Icon name={item.icon} size={17} strokeWidth={1.75} className="shrink-0" />
                  <motion.span
                    variants={{
                      rest:  { width: 0, opacity: 0, paddingLeft: 0 },
                      hover: { width: "auto", opacity: 1, paddingLeft: 7 },
                    }}
                    transition={{ duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
                    className="overflow-hidden whitespace-nowrap text-[13px] font-medium"
                  >
                    {item.label}
                  </motion.span>
                </Link>
              </motion.div>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-2.5">
          {/* Context switcher — hidden on home and when page requests it */}
          {pathname !== "/" && !hideContextSwitcher && (
          <div className="relative">
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => setOpen((o) => !o)}
              className="glow flex items-center gap-2 rounded-full border border-[var(--border-strong)] bg-[var(--surface-2)] py-0.5 pl-1 pr-2.5 transition-colors duration-200 hover:bg-[var(--surface-hover)]"
            >
              <span className="relative">
                <WorkspaceDot accent={ws.accent} accent2={ws.accent2} icon={ws.icon} />
                <AnimatePresence>
                  {allBranches && (
                    <motion.span
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0, opacity: 0 }}
                      transition={{ type: "spring", stiffness: 500, damping: 18 }}
                      title="Todas as branches ativas"
                      className="absolute -bottom-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full ring-2 ring-[var(--surface-2)]"
                      style={{ background: "linear-gradient(135deg, #f59e0b, #22d3ee 35%, #3b82f6 70%, #a855f7)" }}
                    >
                      <Icon name="GitPullRequest" size={8} strokeWidth={2.5} className="text-white" />
                    </motion.span>
                  )}
                </AnimatePresence>
              </span>
              <motion.span
                key={allBranches ? "all" : ws.name}
                initial={{ opacity: 0, x: -4 }}
                animate={{ opacity: 1, x: 0 }}
                className="hidden max-w-[84px] truncate text-sm font-medium sm:inline sm:max-w-none"
              >
                {allBranches ? "Todas" : ws.name}
              </motion.span>
              <motion.span animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.2 }}>
                <Icon name="ChevronDown" size={14} className="text-muted" />
              </motion.span>
            </motion.button>

            <AnimatePresence>
              {open && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
                  <motion.div
                    initial={{ opacity: 0, y: -8, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -8, scale: 0.95 }}
                    transition={{ type: "spring", stiffness: 400, damping: 30 }}
                    style={{ background: "#141417" }}
                    className="absolute right-0 top-full z-20 mt-2 min-w-[224px] rounded-2xl border border-[var(--border-strong)] p-1.5 shadow-2xl shadow-black/60"
                  >
                    <p className="px-2 py-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-2">
                      Branch ativo
                    </p>

                    <div className="space-y-0.5">
                      {branches.map((w, i) => {
                        const isActive = w.id === active;
                        return (
                          <motion.button
                            key={w.id}
                            initial={{ opacity: 0, x: -8 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: i * 0.05 }}
                            whileHover={{ x: 3 }}
                            onClick={() => { setActive(w.id); setOpen(false); }}

                            className={cn(
                              "flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors duration-150",
                              isActive ? "bg-[var(--surface-2)]" : "hover:bg-[var(--surface)]",
                            )}
                          >
                            <WorkspaceDot accent={w.accent} accent2={w.accent2} icon={w.icon} />
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium">{w.name}</p>
                              <p className="text-[11px] text-muted-2">{w.tagline}</p>
                            </div>
                            <AnimatePresence>
                              {isActive && (
                                <motion.span
                                  initial={{ scale: 0, rotate: -90 }}
                                  animate={{ scale: 1, rotate: 0 }}
                                  exit={{ scale: 0 }}
                                  transition={{ type: "spring", stiffness: 500 }}
                                >
                                  <Icon name="Check" size={14} style={{ color: w.accent }} />
                                </motion.span>
                              )}
                            </AnimatePresence>
                          </motion.button>
                        );
                      })}
                    </div>

                    {/* All branches toggle */}
                    <div className="mt-1.5 border-t border-[var(--border)] pt-1.5">
                      <motion.button
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.15 }}
                        whileHover={{ x: 3 }}
                        onClick={() => { setAllBranches(!allBranches); setOpen(false); }}
                        data-sound="change"
                        className={cn(
                          "flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors duration-150",
                          allBranches ? "bg-[var(--surface-2)]" : "hover:bg-[var(--surface)]"
                        )}
                      >
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-[var(--border-strong)] text-muted">
                          <Icon name="GitPullRequest" size={12} strokeWidth={2} />
                        </span>
                        <span className="flex-1 text-sm text-muted">Todas as branches</span>
                        <AnimatePresence>
                          {allBranches && (
                            <motion.span
                              initial={{ scale: 0, rotate: -90 }}
                              animate={{ scale: 1, rotate: 0 }}
                              exit={{ scale: 0 }}
                              transition={{ type: "spring", stiffness: 500 }}
                            >
                              <Icon name="Check" size={14} className="text-white/60" />
                            </motion.span>
                          )}
                        </AnimatePresence>
                      </motion.button>
                    </div>

                    {/* Divider + New button */}
                    <div className="mt-1.5 border-t border-[var(--border)] pt-1.5">
                      <motion.button
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.18 }}
                        whileHover={{ x: 3, backgroundColor: "var(--surface)" }}
                        className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors duration-150"
                      >
                        <span
                          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-[var(--border-strong)] text-muted"
                        >
                          <Icon name="Plus" size={13} strokeWidth={2.2} />
                        </span>
                        <span className="text-sm text-muted">Nova branch</span>
                      </motion.button>
                    </div>
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>
          )}
        </div>
      </motion.div>
    </header>
  );
}

export function WorkspaceDot({ accent, accent2, icon }: { accent: string; accent2: string; icon: string }) {
  return (
    <motion.span
      whileHover={{ scale: 1.15 }}
      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-white"
      style={{
        background: `linear-gradient(135deg, ${accent}, ${accent2})`,
        boxShadow: `0 0 10px -3px ${accent}`,
      }}
    >
      <Icon name={icon} size={13} strokeWidth={2} />
    </motion.span>
  );
}
