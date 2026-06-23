import type Anthropic from "@anthropic-ai/sdk";
import { createTask, listTasks } from "@/lib/db/tasks";

/** Definições de ferramenta enviadas à Claude. */
export const TOOLS: Anthropic.Tool[] = [
  {
    name: "criar_tarefa",
    description:
      "Cria uma tarefa no hub e persiste no banco. Use quando o usuário quer registrar algo para fazer depois (não execução imediata).",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Título curto e claro da tarefa" },
        workspace: { type: "string", enum: ["dux", "sheep", "pessoal"], description: "Branch da tarefa" },
        due: { type: "string", description: "Prazo no formato dd/mm/aaaa, ou range 'dd/mm/aaaa – dd/mm/aaaa'. Opcional." },
        list: { type: "string", enum: ["seg", "ter", "qua", "qui", "sex", "sab", "dom"], description: "Dia da semana. Opcional." },
        tools: { type: "array", items: { type: "string" }, description: "Ferramentas/conectores relevantes. Opcional." },
        instruction: { type: "string", description: "Detalhe do que precisa ser feito. Opcional." },
      },
      required: ["title", "workspace"],
    },
  },
  {
    name: "consultar_tarefas",
    description: "Lê as tarefas já registradas no banco. Use para consultar o que existe antes de criar duplicatas ou para responder perguntas.",
    input_schema: {
      type: "object",
      properties: {
        workspace: { type: "string", enum: ["dux", "sheep", "pessoal"], description: "Filtrar por branch. Opcional." },
      },
    },
  },
  {
    name: "criar_documento",
    description: "Cria um documento (Google Docs). ATENÇÃO: conector ainda não conectado — por enquanto simula a criação e retorna um link fictício.",
    input_schema: {
      type: "object",
      properties: {
        titulo: { type: "string" },
        conteudo: { type: "string", description: "Conteúdo em markdown" },
      },
      required: ["titulo"],
    },
  },
  {
    name: "criar_planilha",
    description: "Cria uma planilha (Google Sheets). ATENÇÃO: conector ainda não conectado — por enquanto simula e retorna um link fictício.",
    input_schema: {
      type: "object",
      properties: {
        titulo: { type: "string" },
        colunas: { type: "array", items: { type: "string" } },
      },
      required: ["titulo"],
    },
  },
];

type ToolInput = Record<string, unknown>;

/** Executa uma ferramenta e devolve um resultado serializável. */
export async function executeTool(name: string, input: ToolInput): Promise<unknown> {
  switch (name) {
    case "criar_tarefa": {
      const task = await createTask({
        title: String(input.title ?? ""),
        workspace: String(input.workspace ?? "pessoal"),
        due: (input.due as string) ?? null,
        list: (input.list as string) ?? null,
        tools: (input.tools as string[]) ?? null,
        instruction: (input.instruction as string) ?? null,
      });
      return { ok: true, task };
    }

    case "consultar_tarefas": {
      const all = await listTasks();
      const filtered = input.workspace
        ? all.filter((t) => t.workspace === input.workspace)
        : all;
      return { ok: true, count: filtered.length, tasks: filtered };
    }

    case "criar_documento": {
      // Placeholder até o conector Google estar plugado.
      const id = crypto.randomUUID().slice(0, 8);
      return {
        ok: true,
        simulated: true,
        titulo: input.titulo,
        url: `https://docs.google.com/document/d/mock-${id}`,
        nota: "Conector Google ainda não conectado — documento simulado.",
      };
    }

    case "criar_planilha": {
      const id = crypto.randomUUID().slice(0, 8);
      return {
        ok: true,
        simulated: true,
        titulo: input.titulo,
        colunas: input.colunas ?? [],
        url: `https://docs.google.com/spreadsheets/d/mock-${id}`,
        nota: "Conector Google ainda não conectado — planilha simulada.",
      };
    }

    default:
      return { ok: false, error: `Ferramenta desconhecida: ${name}` };
  }
}
