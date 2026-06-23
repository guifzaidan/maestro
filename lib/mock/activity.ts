import type { WorkspaceId } from "../theme";

export interface Activity {
  id: string;
  text: string;
  workspace: WorkspaceId;
  time: string;
  icon: string;
}

export const ACTIVITY: Activity[] = [
  { id: "a1", text: "Agente gerou relatório de NPS", workspace: "dux", time: "há 12 min", icon: "Sparkles" },
  { id: "a2", text: "Tarefa concluída: deploy de billing", workspace: "sheep", time: "há 40 min", icon: "CheckCircle2" },
  { id: "a3", text: "Planilha de custos sincronizada", workspace: "dux", time: "há 1 h", icon: "Table" },
  { id: "a4", text: "Nova tarefa pessoal adicionada", workspace: "pessoal", time: "há 2 h", icon: "Plus" },
  { id: "a5", text: "PR #482 revisado pelo agente", workspace: "sheep", time: "há 3 h", icon: "GitPullRequest" },
];

/** 7-point sparkline series per metric (mocked). */
export const SPARK_TASKS = [4, 6, 5, 8, 7, 9, 12];
export const SPARK_AGENT = [2, 3, 3, 5, 4, 6, 8];
