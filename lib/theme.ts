/**
 * Workspace identities. Each context (empresa) has its own accent color +
 * gradient + icon. The active workspace re-tints the whole UI via CSS vars
 * (see WorkspaceProvider).
 */

export type WorkspaceId = "dux" | "sheep" | "pessoal";

export interface Workspace {
  id: WorkspaceId;
  name: string;
  short: string;
  /** lucide-react icon name */
  icon: string;
  accent: string;
  accent2: string;
  accentSoft: string;
  /** Description shown in switcher / settings */
  tagline: string;
}

export const WORKSPACES: Workspace[] = [
  {
    id: "dux",
    name: "DUX",
    short: "DX",
    icon: "Circle",
    accent: "#f59e0b",
    accent2: "#f97316",
    accentSoft: "rgba(245, 158, 11, 0.18)",
    tagline: "Token Claude · DUX",
  },
  {
    id: "sheep",
    name: "Sheep Tech",
    short: "ST",
    icon: "X",
    accent: "#10b981",
    accent2: "#22d3ee",
    accentSoft: "rgba(16, 185, 129, 0.18)",
    tagline: "Token Claude · Sheep",
  },
  {
    id: "pessoal",
    name: "Pessoal",
    short: "P",
    icon: "Triangle",
    accent: "#3b82f6",
    accent2: "#06b6d4",
    accentSoft: "rgba(59, 130, 246, 0.18)",
    tagline: "Token do orquestrador",
  },
];

export const WORKSPACE_MAP: Record<WorkspaceId, Workspace> = WORKSPACES.reduce(
  (acc, w) => ({ ...acc, [w.id]: w }),
  {} as Record<WorkspaceId, Workspace>,
);

export function getWorkspace(id: WorkspaceId): Workspace {
  return WORKSPACE_MAP[id];
}
