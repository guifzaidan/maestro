import type { WorkspaceId } from "../theme";

export type TaskList = "seg" | "ter" | "qua" | "qui" | "sex" | "sab" | "dom";

export interface Task {
  id: string;
  title: string;
  workspace: WorkspaceId;
  list: TaskList;
  done: boolean;
  due?: string;
  description?: string;
}

export const TASK_LISTS: { id: TaskList; label: string; short: string; weekend: boolean }[] = [
  { id: "seg", label: "Segunda",  short: "Seg", weekend: false },
  { id: "ter", label: "Terça",    short: "Ter", weekend: false },
  { id: "qua", label: "Quarta",   short: "Qua", weekend: false },
  { id: "qui", label: "Quinta",   short: "Qui", weekend: false },
  { id: "sex", label: "Sexta",    short: "Sex", weekend: false },
  { id: "sab", label: "Sábado",   short: "Sáb", weekend: true  },
  { id: "dom", label: "Domingo",  short: "Dom", weekend: true  },
];

// JS getDay(): 0=Dom,1=Seg,2=Ter,3=Qua,4=Qui,5=Sex,6=Sáb
const JS_TO_ID: Record<number, TaskList> = {
  0: "dom", 1: "seg", 2: "ter", 3: "qua", 4: "qui", 5: "sex", 6: "sab",
};
export const TODAY_LIST: TaskList = JS_TO_ID[new Date().getDay()];

export const TASKS: Task[] = [
  // DUX
  { id: "t1",  title: "Revisar proposta comercial — cliente Atlas",  workspace: "dux",     list: "seg", done: false },
  { id: "t2",  title: "Alinhar roadmap Q3 com squad de produto",     workspace: "dux",     list: "ter", done: false },
  { id: "t3",  title: "Gerar relatório de NPS do trimestre",         workspace: "dux",     list: "ter", done: true  },
  { id: "t4",  title: "Aprovação de budget de mídia",                workspace: "dux",     list: "qua", done: false },
  { id: "t5",  title: "Aprovar arte da campanha institucional",       workspace: "dux",     list: "qui", done: false },
  { id: "t6",  title: "Fechar contrato de fornecedor cloud",         workspace: "dux",     list: "sex", done: false },
  { id: "t7",  title: "Retrospectiva da semana",                     workspace: "dux",     list: "sex", done: false },

  // Sheep Tech
  { id: "t8",  title: "Deploy do microserviço de billing",           workspace: "sheep",   list: "seg", done: false },
  { id: "t9",  title: "Code review do PR #482 (auth)",               workspace: "sheep",   list: "ter", done: false },
  { id: "t10", title: "Corrigir flaky test no pipeline de CI",       workspace: "sheep",   list: "ter", done: true  },
  { id: "t11", title: "Planejar sprint de migração para Turso",      workspace: "sheep",   list: "qua", done: false },
  { id: "t12", title: "Documentar API pública v2",                   workspace: "sheep",   list: "qui", done: false },
  { id: "t13", title: "Sync com time de infra",                      workspace: "sheep",   list: "sex", done: false },
  { id: "t14", title: "Manutenção do ambiente de staging",           workspace: "sheep",   list: "sab", done: false },

  // Pessoal
  { id: "t15", title: "Renovar plano da academia",                   workspace: "pessoal", list: "seg", done: false },
  { id: "t16", title: "Ler capítulo do livro de arquitetura",        workspace: "pessoal", list: "qua", done: false },
  { id: "t17", title: "Pagar fatura do cartão",                      workspace: "pessoal", list: "sex", done: true  },
  { id: "t18", title: "Organizar viagem de julho",                   workspace: "pessoal", list: "sab", done: false },
  { id: "t19", title: "Descanso / leituras livres",                  workspace: "pessoal", list: "dom", done: false },
];
