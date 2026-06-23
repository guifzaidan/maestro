"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { WORKSPACES, getWorkspace, setBranchCache, type Workspace } from "./theme";

interface WorkspaceContextValue {
  active: string;
  setActive: (id: string) => void;
  /** Branches carregadas do DB (fallback estático enquanto carrega). */
  branches: Workspace[];
  /** Workspace ativa resolvida — conveniente para evitar chamadas a getWorkspace(active). */
  activeWorkspace: Workspace;
  /** "all" = visão unificada de todos os contextos */
  scope: string | "all";
  setScope: (s: string | "all") => void;
  hideContextSwitcher: boolean;
  setHideContextSwitcher: (v: boolean) => void;
  allBranches: boolean;
  setAllBranches: (v: boolean) => void;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState<string>("dux");
  const [scope, setScope] = useState<string | "all">("all");
  const [hideContextSwitcher, setHideContextSwitcher] = useState(false);
  const [allBranches, setAllBranches] = useState(false);
  const [branches, setBranches] = useState<Workspace[]>(WORKSPACES);

  // Carrega branches do DB e atualiza o cache global para getWorkspace().
  useEffect(() => {
    fetch("/api/branches")
      .then((r) => r.json())
      .then((data: { branches?: Workspace[] }) => {
        if (Array.isArray(data.branches) && data.branches.length > 0) {
          setBranches(data.branches);
          setBranchCache(data.branches);
        }
      })
      .catch(() => {/* silencia erros de rede; usa fallback estático */});
  }, []);

  const activeWorkspace = useMemo(
    () => branches.find((w) => w.id === active) ?? branches[0] ?? WORKSPACES[0],
    [active, branches],
  );

  // Aplica accent vars no :root sempre que branch ou lista mudar.
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--accent", activeWorkspace.accent);
    root.style.setProperty("--accent-2", activeWorkspace.accent2);
    root.style.setProperty("--accent-soft", activeWorkspace.accentSoft);
  }, [activeWorkspace]);

  const value = useMemo(
    () => ({
      active,
      setActive,
      branches,
      activeWorkspace,
      scope,
      setScope,
      hideContextSwitcher,
      setHideContextSwitcher,
      allBranches,
      setAllBranches,
    }),
    [active, branches, activeWorkspace, scope, hideContextSwitcher, allBranches],
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
