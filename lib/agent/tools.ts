import type Anthropic from "@anthropic-ai/sdk";
import { createTask, listTasks } from "@/lib/db/tasks";
import { listBranches } from "@/lib/db/branches";
import { listTursoTargets, type TursoTarget } from "@/lib/db/connections";
import { introspectTurso } from "@/lib/turso-introspect";
import { queryTurso } from "@/lib/turso-query";
import { buildArtifact, type ArtifactFormat } from "./artifacts";
import { BRANCH_IDS } from "@/lib/theme";

/** Contexto de execução de uma ferramenta — sabe a branch ativa. */
export interface ToolContext {
  branch: string;
}

/**
 * Monta as definições de ferramenta enviadas à Claude. É dinâmico: o enum de
 * branches vem do banco, então branches novas (ex: ChipTech) são reconhecidas.
 */
export async function buildTools(): Promise<Anthropic.Tool[]> {
  const branches = await listBranches();
  const branchIds = branches.map((b) => b.id);
  const branchEnum = branchIds.length > 0 ? branchIds : [BRANCH_IDS.pessoal];

  return [
    {
      name: "criar_tarefa",
      description:
        "Cria uma tarefa no hub e persiste no banco. Use quando o usuário quer registrar algo para fazer depois (não execução imediata). Se a branch não for dita, use a branch ativa.",
      input_schema: {
        type: "object",
        properties: {
          title: { type: "string", description: "Título curto e claro da tarefa" },
          branch: { type: "string", enum: branchEnum, description: "Branch da tarefa. Omita para usar a branch ativa." },
          due: { type: "string", description: "Prazo no formato dd/mm/aaaa. Opcional." },
          list: { type: "string", enum: ["seg", "ter", "qua", "qui", "sex", "sab", "dom"], description: "Dia da semana. Opcional." },
          tools: { type: "array", items: { type: "string" }, description: "Ferramentas/conectores relevantes. Opcional." },
          instruction: { type: "string", description: "Detalhe do que precisa ser feito. Opcional." },
        },
        required: ["title"],
      },
    },
    {
      name: "consultar_tarefas",
      description: "Lê as tarefas registradas no hub. Use para consultar o que existe antes de criar duplicatas ou para responder perguntas.",
      input_schema: {
        type: "object",
        properties: {
          branch: { type: "string", enum: branchEnum, description: "Filtrar por branch. Omita para a branch ativa." },
          todas: { type: "boolean", description: "true = todas as branches (ignora o filtro). Opcional." },
        },
      },
    },
    {
      name: "listar_bases_de_dados",
      description:
        "Lista as bases de dados (Turso) conectadas à branch ativa, com suas tabelas, colunas e contagem de linhas. Use ISSO PRIMEIRO antes de consultar dados, para descobrir o schema.",
      input_schema: {
        type: "object",
        properties: {
          incluir_schema: { type: "boolean", description: "Incluir colunas de cada tabela (padrão true)." },
        },
      },
    },
    {
      name: "consultar_base_de_dados",
      description:
        "Executa uma consulta SQL SELECT (read-only) numa base de dados conectada à branch e retorna as linhas. Use o schema de listar_bases_de_dados para montar o SQL. Máx. 500 linhas.",
      input_schema: {
        type: "object",
        properties: {
          conexao_id: { type: "string", description: "Id da conexão (de listar_bases_de_dados). Omita se houver só uma base." },
          sql: { type: "string", description: "Uma única consulta SELECT/WITH. Sem INSERT/UPDATE/DELETE/DDL." },
        },
        required: ["sql"],
      },
    },
    {
      name: "gerar_artefato",
      description:
        "Gera um arquivo baixável a partir de conteúdo que você produz. Use para documentos, tabelas, relatórios e exports. " +
        "Formatos: 'xlsx' (Excel nativo — passe o conteúdo como CSV), 'docx' (Word nativo — passe o conteúdo como Markdown com #, listas e tabelas), " +
        "'csv' (planilha simples), 'md' (markdown), 'html' (documento imprimível em PDF), 'json', 'txt'. " +
        "Para planilha de dados, prefira 'xlsx'. Para documento formatado, prefira 'docx'.",
      input_schema: {
        type: "object",
        properties: {
          nome: { type: "string", description: "Nome do arquivo (sem extensão), ex: 'relatorio-chiptech'." },
          formato: { type: "string", enum: ["xlsx", "docx", "csv", "md", "html", "json", "txt"], description: "Formato do arquivo." },
          conteudo: {
            type: "string",
            description: "Conteúdo completo. Para 'xlsx' → CSV (cabeçalho na 1ª linha). Para 'docx' → Markdown. Para os demais → o próprio formato (markdown, HTML, CSV, JSON, texto).",
          },
        },
        required: ["nome", "formato", "conteudo"],
      },
    },
  ];
}

type ToolInput = Record<string, unknown>;

/** Resume um TursoTarget + tabelas para o agente (sem expor o token). */
async function describeTarget(t: TursoTarget, includeSchema: boolean) {
  try {
    const tables = await introspectTurso(t.url, t.token);
    return {
      conexao_id: t.id,
      nome: t.name ?? t.id,
      tabelas: tables.map((tb) => ({
        nome: tb.name,
        linhas: tb.rowCount,
        ...(includeSchema ? { colunas: tb.columns.map((c) => `${c.name}${c.pk ? " (pk)" : ""}: ${c.type}`) } : {}),
      })),
    };
  } catch (e) {
    return { conexao_id: t.id, nome: t.name ?? t.id, erro: e instanceof Error ? e.message : String(e) };
  }
}

/** Executa uma ferramenta e devolve um resultado serializável. */
export async function executeTool(name: string, input: ToolInput, ctx: ToolContext): Promise<unknown> {
  switch (name) {
    case "criar_tarefa": {
      const task = await createTask({
        title: String(input.title ?? ""),
        branch: String(input.branch ?? ctx.branch),
        due: (input.due as string) ?? null,
        list: (input.list as string) ?? null,
        tools: (input.tools as string[]) ?? null,
        instruction: (input.instruction as string) ?? null,
      });
      return { ok: true, task };
    }

    case "consultar_tarefas": {
      const all = await listTasks();
      const todas = input.todas === true;
      const br = (input.branch as string) ?? ctx.branch;
      const filtered = todas ? all : all.filter((t) => t.branch === br);
      return { ok: true, count: filtered.length, tasks: filtered };
    }

    case "listar_bases_de_dados": {
      const targets = await listTursoTargets(ctx.branch);
      if (targets.length === 0) {
        return { ok: true, bases: [], nota: "Nenhuma base de dados Turso conectada a esta branch." };
      }
      const includeSchema = input.incluir_schema !== false;
      const bases = await Promise.all(targets.map((t) => describeTarget(t, includeSchema)));
      return { ok: true, bases };
    }

    case "consultar_base_de_dados": {
      const targets = await listTursoTargets(ctx.branch);
      if (targets.length === 0) return { ok: false, error: "Nenhuma base Turso conectada a esta branch." };
      const target = input.conexao_id
        ? targets.find((t) => t.id === input.conexao_id)
        : targets[0];
      if (!target) return { ok: false, error: `Conexão '${input.conexao_id}' não encontrada nesta branch.` };
      try {
        const res = await queryTurso(target.url, target.token, String(input.sql ?? ""));
        return { ok: true, conexao_id: target.id, ...res };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) };
      }
    }

    case "gerar_artefato": {
      const formato = String(input.formato ?? "md") as ArtifactFormat;
      const nome = String(input.nome ?? "artefato");
      const conteudo = String(input.conteudo ?? "");
      if (!conteudo.trim()) return { ok: false, error: "Conteúdo vazio." };
      const artifact = await buildArtifact(formato, nome, conteudo);
      return {
        ok: true,
        artifact,
        nota: `Artefato '${artifact.filename}' gerado (${artifact.bytes} bytes).`,
      };
    }

    default:
      return { ok: false, error: `Ferramenta desconhecida: ${name}` };
  }
}
