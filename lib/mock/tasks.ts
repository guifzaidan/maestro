import type { WorkspaceId } from "../theme";

export type TaskList = "seg" | "ter" | "qua" | "qui" | "sex" | "sab" | "dom";

export interface Task {
  id: string;
  title: string;
  branch: WorkspaceId;
  list: TaskList;
  done: boolean;
  due?: string;
  description?: string;
  recurring?: boolean;
  /** Grupos/categorias (projeto, cliente, área). Ex: "Decentral", "Casa". */
  groups?: string[];
  /** Flags de estado. Ex: "urgente", "bloqueada". */
  flags?: string[];
}

export type TaskFlag = "urgente" | "bloqueada";

/** Flags disponíveis nas tasks (conjunto fixo). Fonte de verdade do rótulo/cor. */
export const TASK_FLAGS: { id: TaskFlag; label: string; icon: string; color: string }[] = [
  { id: "urgente",   label: "Urgente",   icon: "Zap", color: "#f87171" },
  { id: "bloqueada", label: "Bloqueada", icon: "Ban", color: "#fbbf24" },
];

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
