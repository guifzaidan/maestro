"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { WORKSPACES, getWorkspace, type WorkspaceId } from "./theme";

interface WorkspaceContextValue {
  active: WorkspaceId;
  setActive: (id: WorkspaceId) => void;
  /** "all" = visão unificada de todos os contextos */
  scope: WorkspaceId | "all";
  setScope: (s: WorkspaceId | "all") => void;
  hideContextSwitcher: boolean;
  setHideContextSwitcher: (v: boolean) => void;
  allBranches: boolean;
  setAllBranches: (v: boolean) => void;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState<WorkspaceId>("dux");
  const [scope, setScope] = useState<WorkspaceId | "all">("all");
  const [hideContextSwitcher, setHideContextSwitcher] = useState(false);
  const [allBranches, setAllBranches] = useState(false);

  useEffect(() => {
    const ws = getWorkspace(active);
    const root = document.documentElement;
    root.style.setProperty("--accent", ws.accent);
    root.style.setProperty("--accent-2", ws.accent2);
    root.style.setProperty("--accent-soft", ws.accentSoft);
  }, [active]);

  const value = useMemo(
    () => ({ active, setActive, scope, setScope, hideContextSwitcher, setHideContextSwitcher, allBranches, setAllBranches }),
    [active, scope, hideContextSwitcher, allBranches],
  );

  return (
    <WorkspaceContext.Provider value={value}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspace must be used within WorkspaceProvider");
  return ctx;
}

export { WORKSPACES, getWorkspace };
