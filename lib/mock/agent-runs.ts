export type StepStatus = "done" | "working" | "pending";

export interface AgentStep {
  id: string;
  label: string;
  status: StepStatus;
}

/** Template steps used by the mocked "Generate" flow. */
export const SAMPLE_STEPS: Omit<AgentStep, "status">[] = [
  { id: "s1", label: "Selecionar token Claude do branch ativo" },
  { id: "s2", label: "Carregar dados das integrações conectadas" },
  { id: "s3", label: "Analisar tarefas abertas e prioridades" },
  { id: "s4", label: "Gerar plano de ação e rascunhos" },
  { id: "s5", label: "Registrar log da execução" },
];

export const SUGGESTED_PROMPTS = [
  "Resumir minhas tarefas de hoje em todos os branches",
  "Preparar pauta da reunião de produto",
  "Identificar tarefas atrasadas e propor replanejamento",
  "Gerar rascunho de e-mail de follow-up para o cliente",
];
