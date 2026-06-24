/**
 * Workspace identities. Each context (empresa) has its own accent color +
 * gradient + icon. The active workspace re-tints the whole UI via CSS vars
 * (see WorkspaceProvider).
 *
 * WorkspaceId is `string` — branches are dynamic and stored in DB.
 * WORKSPACES is the static seed / SSR fallback until the DB responds.
 */

export type WorkspaceId = string;

/**
 * IDs (UUID) das branches padrão — fonte única de verdade usada pelo seed do
 * banco, pelo fallback estático e pelo mapeamento de env do agente. Branches
 * criadas pelo usuário recebem UUIDs próprios; estes são só os 3 iniciais.
 */
export const BRANCH_IDS = {
  dux:     "ec11b4fb-3bc5-4609-9e39-6616cc882207",
  sheep:   "c78d3d6f-a191-4f4e-8c2f-31f8b19aa1bf",
  pessoal: "2c770a07-52ac-47ea-90a2-edaefb0e8c83",
} as const;

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
  tagline: string | null;
  /** Se a branch já tem um token Claude salvo (DB). Indefinido no fallback estático. */
  hasToken?: boolean;
}

export const WORKSPACES: Workspace[] = [
  {
    id: BRANCH_IDS.dux,
    name: "DUX",
    short: "DX",
    icon: "Circle",
    accent: "#f59e0b",
    accent2: "#f97316",
    accentSoft: "rgba(245, 158, 11, 0.18)",
    tagline: "Token Claude · DUX",
  },
  {
    id: BRANCH_IDS.sheep,
    name: "Sheep Tech",
    short: "ST",
    icon: "X",
    accent: "#10b981",
    accent2: "#22d3ee",
    accentSoft: "rgba(16, 185, 129, 0.18)",
    tagline: "Token Claude · Sheep",
  },
  {
    id: BRANCH_IDS.pessoal,
    name: "Pessoal",
    short: "P",
    icon: "Triangle",
    accent: "#3b82f6",
    accent2: "#06b6d4",
    accentSoft: "rgba(59, 130, 246, 0.18)",
    tagline: "Token do orquestrador",
  },
];

export const WORKSPACE_MAP: Record<string, Workspace> = WORKSPACES.reduce(
  (acc, w) => ({ ...acc, [w.id]: w }),
  {} as Record<string, Workspace>,
);

// Cache mutable: atualizado pelo WorkspaceProvider quando branches carregam do DB.
let _cache: Workspace[] = WORKSPACES;

/** Atualiza o cache de branches — chamado pelo WorkspaceProvider após fetch. */
export function setBranchCache(list: Workspace[]) {
  _cache = list;
}

/** Busca workspace pelo id. Usa o cache (DB-loaded) com fallback estático. */
export function getWorkspace(id: string): Workspace {
  return _cache.find((w) => w.id === id) ?? _cache[0] ?? WORKSPACES[0];
}
