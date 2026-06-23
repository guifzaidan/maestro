/**
 * Mapeamento de uma tabela externa para os campos que o hub entende:
 * título (o que vira o texto da task), data (referência para posicionar
 * nos cards de Hoje/Semana/Mês) e status (usado na sincronização).
 *
 * Módulo puro (sem libs server-side) para poder rodar no cliente.
 */

export interface TableMapping {
  title?: string;
  date?: string;
  status?: string;
}

export interface MappingColumn {
  name: string;
  type: string;
  pk: boolean;
}

// Ordem importa: dicas mais específicas primeiro.
const TITLE_HINTS = [
  "title", "titulo", "name", "nome", "label", "subject", "assunto",
  "task", "tarefa", "summary", "resumo", "description", "descricao",
];
const DATE_HINTS = [
  "due", "due_date", "duedate", "deadline", "prazo", "vencimento",
  "scheduled", "agendado", "date", "data", "when", "quando",
  "created_at", "createdat", "updated_at", "updatedat",
];
const STATUS_HINTS = [
  "status", "state", "estado", "stage", "etapa", "situacao",
  "done", "completed", "complete", "concluido", "finished", "fase",
];

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function isDateType(type: string): boolean {
  const t = type.toLowerCase();
  return t.includes("date") || t.includes("time") || t.includes("timestamp");
}

function isTextLike(type: string): boolean {
  const t = type.toLowerCase();
  return t === "" || t.includes("text") || t.includes("char") || t.includes("clob");
}

/** Acha a melhor coluna por nome: match exato normalizado, depois "contém". */
function bestMatch(columns: MappingColumn[], hints: string[]): string | undefined {
  const normHints = hints.map(norm);
  for (const h of normHints) {
    const exact = columns.find((c) => norm(c.name) === h);
    if (exact) return exact.name;
  }
  for (const h of normHints) {
    const contains = columns.find((c) => norm(c.name).includes(h));
    if (contains) return contains.name;
  }
  return undefined;
}

/** Deriva um mapeamento provável a partir das colunas de uma tabela. */
export function autoDetectMapping(columns: MappingColumn[]): TableMapping {
  const title =
    bestMatch(columns, TITLE_HINTS) ??
    columns.find((c) => !c.pk && isTextLike(c.type))?.name ??
    columns.find((c) => !c.pk)?.name;

  const date =
    bestMatch(columns, DATE_HINTS) ??
    columns.find((c) => isDateType(c.type))?.name;

  const status = bestMatch(columns, STATUS_HINTS);

  return {
    title: title || undefined,
    date: date || undefined,
    status: status || undefined,
  };
}
