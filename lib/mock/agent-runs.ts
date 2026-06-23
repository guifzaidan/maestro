import type { WorkspaceId } from "../theme";

export type StepStatus = "done" | "working" | "pending";

export interface AgentStep {
  id: string;
  label: string;
  status: StepStatus;
}

export interface AgentRun {
  id: string;
  prompt: string;
  workspace: WorkspaceId;
  steps: AgentStep[];
}

/** Template steps used by the mocked "Generate" flow. */
export const SAMPLE_STEPS: Omit<AgentStep, "status">[] = [
  { id: "s1", label: "Selecionar token Claude do branch ativo" },
  { id: "s2", label: "Carregar dados das integrações conectadas" },
  { id: "s3", label: "Analisar tarefas abertas e prioridades" },
  { id: "s4", label: "Gerar plano de ação e rascunhos" },
  { id: "s5", label: "Registrar log da execução" },
];

export const RECENT_RUNS: AgentRun[] = [
  {
    id: "r1",
    prompt: "Resumir status das tarefas da semana e propor prioridades",
    workspace: "dux",
    steps: SAMPLE_STEPS.map((s) => ({ ...s, status: "done" as StepStatus })),
  },
  {
    id: "r2",
    prompt: "Gerar changelog a partir dos PRs mergeados",
    workspace: "sheep",
    steps: SAMPLE_STEPS.map((s, i) => ({
      ...s,
      status: (i < 3 ? "done" : "pending") as StepStatus,
    })),
  },
];

export const SUGGESTED_PROMPTS = [
  "Resumir minhas tarefas de hoje em todos os branches",
  "Preparar pauta da reunião de produto",
  "Identificar tarefas atrasadas e propor replanejamento",
  "Gerar rascunho de e-mail de follow-up para o cliente",
];
