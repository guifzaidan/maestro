import type Anthropic from "@anthropic-ai/sdk";
import { createTask, listTasks } from "@/lib/db/tasks";
import { listBranches } from "@/lib/db/branches";
import { listTursoTargets, getConnectionSecret, type TursoTarget } from "@/lib/db/connections";
import { introspectTurso } from "@/lib/turso-introspect";
import { queryTurso } from "@/lib/turso-query";
import { listLinearTeams, listLinearProjects, listLinearIssues, createLinearIssue, listLinearWorkflowStates, getLinearIssueByIdentifier, updateLinearIssue, deleteLinearIssue, listLinearUsers, createLinearWorkflowState, updateLinearWorkflowState, LINEAR_STATE_TYPES, type LinearStateType, createLinearComment, listLinearIssueAttachments, createLinearAttachment, updateLinearAttachment, deleteLinearAttachment, type LinearUser, listLinearLabels, createLinearLabel, updateLinearLabel, addLinearIssueLabel, removeLinearIssueLabel } from "@/lib/linear";
import { buildArtifact, type ArtifactFormat } from "./artifacts";

/** Contexto de execução de uma ferramenta — a branch ativa pode ser vazia (home). */
export interface ToolContext {
  branch: string;
}

const BRANCH_DESC = "Branch alvo — pode ser o nome (ex: 'DUX', 'Sheep Tech') ou o id. Obrigatório se não houver branch ativa.";

/** Monta as definições de ferramenta enviadas à Claude. */
export async function buildTools(): Promise<Anthropic.Tool[]> {
  return [
    {
      name: "perguntar_opcoes",
      description:
        "Faz uma pergunta ao usuário com opções clicáveis. Use SEMPRE que houver dúvida ou uma decisão (qual branch, qual formato, sim/não, etc.) em vez de escrever a pergunta no texto. Depois de chamar, PARE e aguarde a resposta.",
      input_schema: {
        type: "object",
        properties: {
          pergunta: { type: "string", description: "A pergunta, curta e direta." },
          opcoes: { type: "array", items: { type: "string" }, description: "2 a 5 opções curtas para o usuário clicar." },
        },
        required: ["pergunta", "opcoes"],
      },
    },
    {
      name: "selecionar_branch",
      description:
        "Fixa a branch da conversa assim que o usuário indica qual é (por nome ou id). Chame ISSO PRIMEIRO, antes de consultar dados ou criar tarefas. A partir daí as ferramentas já usam essa branch por padrão.",
      input_schema: {
        type: "object",
        properties: {
          branch: { type: "string", description: "Nome ou id da branch (ex: 'Sheep Tech', 'DUX')." },
        },
        required: ["branch"],
      },
    },
    {
      name: "criar_tarefa",
      description:
        "Cria uma tarefa no hub e persiste no banco. Use quando o usuário quer registrar algo para fazer depois (não execução imediata).",
      input_schema: {
        type: "object",
        properties: {
          title: { type: "string", description: "Título curto e claro da tarefa" },
          branch: { type: "string", description: BRANCH_DESC },
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
          branch: { type: "string", description: BRANCH_DESC + " Omita se usar todas=true." },
          todas: { type: "boolean", description: "true = todas as branches (ignora o filtro). Opcional." },
        },
      },
    },
    {
      name: "listar_bases_de_dados",
      description:
        "Lista as bases de dados (Turso) conectadas a uma branch, com suas tabelas, colunas e contagem de linhas. Use ISSO PRIMEIRO antes de consultar dados, para descobrir o schema.",
      input_schema: {
        type: "object",
        properties: {
          branch: { type: "string", description: BRANCH_DESC },
          incluir_schema: { type: "boolean", description: "Incluir colunas de cada tabela (padrão true)." },
        },
      },
    },
    {
      name: "consultar_base_de_dados",
      description:
        "Executa uma consulta SQL SELECT (read-only) numa base de dados conectada a uma branch e retorna as linhas. Use o schema de listar_bases_de_dados para montar o SQL. Máx. 500 linhas.",
      input_schema: {
        type: "object",
        properties: {
          branch: { type: "string", description: BRANCH_DESC },
          conexao_id: { type: "string", description: "Id da conexão (de listar_bases_de_dados). Omita se houver só uma base." },
          sql: { type: "string", description: "Uma única consulta SELECT/WITH. Sem INSERT/UPDATE/DELETE/DDL." },
        },
        required: ["sql"],
      },
    },
    {
      name: "listar_linear",
      description:
        "Lista times, projetos e issues do Linear conectado à branch (até 100 por chamada, mais recentes primeiro). Filtros opcionais: 'time' (nome/key), 'projeto' (nome) e 'status' (lista de status, ex: ['Done']). " +
        "Sem filtro, traz a visão geral. Passe 'time' pra ver os projetos daquele time. Cada issue já vem com a descrição. " +
        "Para relatórios completos, passe incluir_comentarios=true pra trazer também os comentários (Activity) — ex: as observações do dev. " +
        "ECONOMIA: filtrar por status e só incluir comentários quando necessário reduz bastante o volume (tokens). Se o resultado vier no teto (100), pode haver mais — avise e refine.",
      input_schema: {
        type: "object",
        properties: {
          branch: { type: "string", description: BRANCH_DESC },
          time: { type: "string", description: "Filtra por time (nome ou key). Opcional." },
          projeto: { type: "string", description: "Filtra por projeto (nome). Requer 'time' pra resolver corretamente. Opcional." },
          status: { type: "array", items: { type: "string" }, description: "Filtra por status (nomes exatos do Linear, ex: ['Done','In Progress']). Opcional — use pra puxar só um subconjunto e economizar." },
          incluir_descricao: { type: "boolean", description: "Se true, traz a descrição de cada issue. Padrão false (mais econômico). Ligue quando o relatório precisar do conteúdo das issues." },
          incluir_comentarios: { type: "boolean", description: "Se true, traz os comentários (Activity) de cada issue — ex: diagnósticos do dev. Padrão false. Mais pesado em tokens." },
        },
      },
    },
    {
      name: "criar_card_linear",
      description:
        "Cria um card (issue) no Linear da branch. Informe o título, o time e (se houver) o projeto. " +
        "Se o usuário não disser o time/projeto, NÃO chute: use listar_linear e pergunte com perguntar_opcoes.",
      input_schema: {
        type: "object",
        properties: {
          branch: { type: "string", description: BRANCH_DESC },
          titulo: { type: "string", description: "Título do card." },
          descricao: { type: "string", description: "Descrição em markdown. Opcional." },
          time: { type: "string", description: "Nome ou key do time do Linear. Pergunte se não souber." },
          projeto: { type: "string", description: "Nome do projeto dentro do time. Opcional, mas pergunte se o time tiver projetos." },
        },
        required: ["titulo", "time"],
      },
    },
    {
      name: "atualizar_card_linear",
      description:
        "Atualiza um card (issue) existente no Linear — muda o status, título, descrição ou o responsável (assignee). " +
        "Use o identificador do card (ex: 'ART-29'). Se o usuário não informar o status exato, " +
        "liste os status disponíveis com listar_linear e pergunte com perguntar_opcoes. " +
        "Para atribuir um membro, passe 'responsavel' com o nome/email; se não bater, a ferramenta devolve a lista de membros pra você confirmar.",
      input_schema: {
        type: "object",
        properties: {
          branch: { type: "string", description: BRANCH_DESC },
          identificador: { type: "string", description: "Identificador do card, ex: 'ART-29'." },
          status: { type: "string", description: "Novo status (nome exato do workflow state, ex: 'Done', 'In Progress'). Opcional." },
          titulo: { type: "string", description: "Novo título do card. Opcional." },
          descricao: { type: "string", description: "Nova descrição em markdown. Opcional." },
          responsavel: { type: "string", description: "Nome, displayName ou email do membro a atribuir como responsável. Opcional." },
          data: { type: "string", description: "Prazo (due date) do card. Aceita 'dd/mm/aaaa' ou 'aaaa-mm-dd'. Use 'remover' para limpar o prazo. Opcional." },
          urgencia: { type: "string", description: "Prioridade/urgência: 'urgente', 'alta', 'media', 'baixa' ou 'nenhuma' (remove). Opcional." },
          labels: { type: "array", items: { type: "string" }, description: "Labels a ADICIONAR no card (nomes). Se não existir, a ferramenta devolve as disponíveis. Opcional." },
          remover_labels: { type: "array", items: { type: "string" }, description: "Labels a REMOVER do card (nomes). Opcional." },
        },
        required: ["identificador"],
      },
    },
    {
      name: "excluir_card_linear",
      description:
        "Exclui um card (issue) do Linear pelo identificador (ex: 'ART-29'). O card vai pra lixeira do Linear " +
        "(recuperável por ~30 dias). Ação destrutiva: só use quando o usuário pedir claramente pra excluir/apagar/deletar o card.",
      input_schema: {
        type: "object",
        properties: {
          branch: { type: "string", description: BRANCH_DESC },
          identificador: { type: "string", description: "Identificador do card a excluir, ex: 'ART-29'." },
        },
        required: ["identificador"],
      },
    },
    {
      name: "criar_status_linear",
      description:
        "Adiciona um novo status (workflow state) à estrutura dos cards de um TIME do Linear — ex: criar 'Em Revisão'. " +
        "Informe o time, o nome do status e o tipo. Se o time não for informado/único, liste com listar_linear e pergunte.",
      input_schema: {
        type: "object",
        properties: {
          branch: { type: "string", description: BRANCH_DESC },
          time: { type: "string", description: "Nome ou key do time do Linear. Pergunte se não souber." },
          nome: { type: "string", description: "Nome do novo status, ex: 'Em Revisão'." },
          tipo: { type: "string", enum: [...LINEAR_STATE_TYPES], description: "Categoria do status: triage, backlog, unstarted (a fazer), started (em progresso), completed (concluído), canceled (cancelado)." },
          cor: { type: "string", description: "Cor em hex, ex: '#f59e0b'. Opcional." },
        },
        required: ["time", "nome", "tipo"],
      },
    },
    {
      name: "editar_status_linear",
      description:
        "Edita um status (workflow state) existente de um TIME do Linear — renomear, mudar a cor ou o tipo. " +
        "Identifique o status pelo nome atual dentro do time.",
      input_schema: {
        type: "object",
        properties: {
          branch: { type: "string", description: BRANCH_DESC },
          time: { type: "string", description: "Nome ou key do time do Linear." },
          status_atual: { type: "string", description: "Nome atual do status a editar, ex: 'Backlog'." },
          novo_nome: { type: "string", description: "Novo nome do status. Opcional." },
          cor: { type: "string", description: "Nova cor em hex. Opcional." },
          tipo: { type: "string", enum: [...LINEAR_STATE_TYPES], description: "Novo tipo. Opcional." },
        },
        required: ["time", "status_atual"],
      },
    },
    {
      name: "comentar_card_linear",
      description:
        "Adiciona um comentário a um card do Linear. Pode marcar (@menção, que notifica) um ou mais membros — passe os nomes em 'mencionar'. " +
        "Use o identificador do card (ex: 'ART-29').",
      input_schema: {
        type: "object",
        properties: {
          branch: { type: "string", description: BRANCH_DESC },
          identificador: { type: "string", description: "Identificador do card, ex: 'ART-29'." },
          texto: { type: "string", description: "Texto do comentário (markdown)." },
          mencionar: { type: "array", items: { type: "string" }, description: "Nomes/emails dos membros a marcar (@menção). Opcional." },
        },
        required: ["identificador", "texto"],
      },
    },
    {
      name: "anexar_link_linear",
      description: "Anexa um link (URL + título) a um card do Linear — ex: PR, doc, Figma. Use o identificador do card.",
      input_schema: {
        type: "object",
        properties: {
          branch: { type: "string", description: BRANCH_DESC },
          identificador: { type: "string", description: "Identificador do card, ex: 'ART-29'." },
          titulo: { type: "string", description: "Título do anexo." },
          url: { type: "string", description: "URL do link." },
          subtitulo: { type: "string", description: "Subtítulo/descrição curta. Opcional." },
        },
        required: ["identificador", "titulo", "url"],
      },
    },
    {
      name: "editar_anexo_linear",
      description: "Edita o título/subtítulo de um anexo existente de um card (identifique pelo título ou URL atual). A URL não é editável — pra trocar, exclua e crie de novo.",
      input_schema: {
        type: "object",
        properties: {
          branch: { type: "string", description: BRANCH_DESC },
          identificador: { type: "string", description: "Identificador do card, ex: 'ART-29'." },
          anexo: { type: "string", description: "Título ou URL atual do anexo a editar." },
          novo_titulo: { type: "string", description: "Novo título. Opcional." },
          novo_subtitulo: { type: "string", description: "Novo subtítulo. Opcional." },
        },
        required: ["identificador", "anexo"],
      },
    },
    {
      name: "excluir_anexo_linear",
      description: "Remove um anexo de um card do Linear (identifique pelo título ou URL).",
      input_schema: {
        type: "object",
        properties: {
          branch: { type: "string", description: BRANCH_DESC },
          identificador: { type: "string", description: "Identificador do card, ex: 'ART-29'." },
          anexo: { type: "string", description: "Título ou URL do anexo a remover." },
        },
        required: ["identificador", "anexo"],
      },
    },
    {
      name: "criar_label_linear",
      description:
        "Cria uma label no Linear. Com 'time' a label é do time; sem 'time', é do workspace (vale pra todos). " +
        "Pra atribuir uma label a um card, use 'labels' no atualizar_card_linear.",
      input_schema: {
        type: "object",
        properties: {
          branch: { type: "string", description: BRANCH_DESC },
          nome: { type: "string", description: "Nome da label, ex: 'bug', 'frontend'." },
          cor: { type: "string", description: "Cor em hex, ex: '#ef4444'. Opcional." },
          time: { type: "string", description: "Time do Linear pra escopar a label. Opcional (sem = workspace)." },
        },
        required: ["nome"],
      },
    },
    {
      name: "editar_label_linear",
      description: "Edita uma label existente (renomear e/ou mudar a cor). Identifique pelo nome atual.",
      input_schema: {
        type: "object",
        properties: {
          branch: { type: "string", description: BRANCH_DESC },
          label_atual: { type: "string", description: "Nome atual da label a editar." },
          novo_nome: { type: "string", description: "Novo nome. Opcional." },
          cor: { type: "string", description: "Nova cor em hex. Opcional." },
          time: { type: "string", description: "Time pra desambiguar se houver labels de mesmo nome. Opcional." },
        },
        required: ["label_atual"],
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

/** Resolve uma branch por id, nome ou short (case-insensitive). null se não achar. */
async function resolveBranchId(value: string | undefined | null): Promise<string | null> {
  const v = (value ?? "").trim();
  if (!v) return null;
  const branches = await listBranches();
  if (branches.some((b) => b.id === v)) return v;
  const lc = v.toLowerCase();
  const exact = branches.find((b) => b.name.toLowerCase() === lc || b.short.toLowerCase() === lc);
  if (exact) return exact.id;
  const partial = branches.find((b) => b.name.toLowerCase().includes(lc));
  return partial?.id ?? null;
}

/** Resolve um time do Linear por nome ou key (exato → parcial). null se não achar. */
function matchTeam<T extends { name: string; key: string }>(teams: T[], value: string): T | null {
  const q = value.trim().toLowerCase();
  if (!q) return null;
  return (
    teams.find((t) => t.name.toLowerCase() === q || t.key.toLowerCase() === q) ??
    teams.find((t) => t.name.toLowerCase().includes(q) || t.key.toLowerCase().includes(q)) ??
    null
  );
}

/** Resolve um projeto do Linear por nome (exato → parcial). null se não achar. */
function matchProject<T extends { name: string }>(projects: T[], value: string): T | null {
  const q = value.trim().toLowerCase();
  if (!q) return null;
  return (
    projects.find((p) => p.name.toLowerCase() === q) ??
    projects.find((p) => p.name.toLowerCase().includes(q)) ??
    null
  );
}

/** Resolve um membro do Linear por nome/displayName/email (exato → parcial). */
function matchLinearUser(users: LinearUser[], value: string): LinearUser | null {
  const q = value.trim().toLowerCase();
  if (!q) return null;
  const n = (s: string) => (s ?? "").toLowerCase();
  return (
    users.find((u) => n(u.email) === q || n(u.name) === q || n(u.displayName) === q) ??
    users.find((u) => n(u.name).includes(q) || n(u.displayName).includes(q) || n(u.email).includes(q)) ??
    null
  );
}

/** Converte uma urgência em PT (ou número) para a priority do Linear (0–4). null se inválida. */
function parseLinearPriority(value: string): number | null {
  const s = value.trim().toLowerCase();
  if (["urgente", "urgent", "1"].includes(s)) return 1;
  if (["alta", "high", "2"].includes(s)) return 2;
  if (["media", "média", "normal", "medium", "3"].includes(s)) return 3;
  if (["baixa", "low", "4"].includes(s)) return 4;
  if (["nenhuma", "sem", "remover", "none", "0"].includes(s)) return 0;
  return null;
}

const PRIORITY_LABEL: Record<number, string> = { 0: "Nenhuma", 1: "Urgente", 2: "Alta", 3: "Média", 4: "Baixa" };

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
    case "perguntar_opcoes": {
      // A pergunta + opções são renderizadas no cliente (a partir do input). Só confirma.
      return { ok: true, aguardando_resposta: true };
    }

    case "selecionar_branch": {
      const id = await resolveBranchId(String(input.branch ?? ""));
      if (!id) return { ok: false, error: `Branch '${String(input.branch ?? "")}' não encontrada. Peça ao usuário pra confirmar qual é.` };
      ctx.branch = id; // passa a valer para as próximas ferramentas deste turno
      const branches = await listBranches();
      const b = branches.find((x) => x.id === id);
      return { ok: true, branch_id: id, branch_name: b?.name ?? id };
    }

    case "criar_tarefa": {
      const branch = await resolveBranchId((input.branch as string) ?? ctx.branch);
      if (!branch) return { ok: false, error: "ASK_BRANCH: pergunte ao usuário em qual branch criar essa tarefa." };
      const task = await createTask({
        title: String(input.title ?? ""),
        branch,
        due: (input.due as string) ?? null,
        list: (input.list as string) ?? null,
        tools: (input.tools as string[]) ?? null,
        instruction: (input.instruction as string) ?? null,
      });
      return { ok: true, task };
    }

    case "consultar_tarefas": {
      const all = await listTasks();
      if (input.todas === true) return { ok: true, count: all.length, tasks: all };
      const branch = await resolveBranchId((input.branch as string) ?? ctx.branch);
      if (!branch) return { ok: false, error: "ASK_BRANCH: pergunte de qual branch (ou use todas=true)." };
      const filtered = all.filter((t) => t.branch === branch);
      return { ok: true, count: filtered.length, tasks: filtered };
    }

    case "listar_bases_de_dados": {
      const branch = await resolveBranchId((input.branch as string) ?? ctx.branch);
      if (!branch) return { ok: false, error: "ASK_BRANCH: pergunte ao usuário de qual branch quer ver as bases." };
      const targets = await listTursoTargets(branch);
      if (targets.length === 0) {
        return { ok: true, bases: [], nota: "Nenhuma base de dados Turso conectada a esta branch." };
      }
      const includeSchema = input.incluir_schema !== false;
      const bases = await Promise.all(targets.map((t) => describeTarget(t, includeSchema)));
      return { ok: true, bases };
    }

    case "consultar_base_de_dados": {
      const branch = await resolveBranchId((input.branch as string) ?? ctx.branch);
      if (!branch) return { ok: false, error: "ASK_BRANCH: pergunte ao usuário de qual branch consultar." };
      const targets = await listTursoTargets(branch);
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

    case "listar_linear": {
      const branch = await resolveBranchId((input.branch as string) ?? ctx.branch);
      if (!branch) return { ok: false, error: "ASK_BRANCH: pergunte ao usuário de qual branch é o Linear." };
      const key = await getConnectionSecret(`linear--${branch}`);
      if (!key) return { ok: false, error: "Linear não conectado nesta branch. Configure em Integrações." };
      try {
        const teams = await listLinearTeams(key);
        const matched = input.time ? matchTeam(teams, String(input.time)) : null;

        // Projetos: do time filtrado, ou os do workspace inteiro.
        const projects = await listLinearProjects(key, matched?.id);
        const proj = input.projeto ? matchProject(projects, String(input.projeto)) : null;

        // Estrutura de status e labels do time filtrado (pra ver/editar).
        const teamStates = matched ? await listLinearWorkflowStates(key, matched.id) : null;
        const teamLabels = matched ? await listLinearLabels(key, matched.id) : null;

        const statusNames = Array.isArray(input.status)
          ? input.status.map((s) => String(s)).filter(Boolean)
          : input.status
            ? [String(input.status)]
            : undefined;
        const LIMIT = 100;
        const withComments = input.incluir_comentarios === true;
        const issues = await listLinearIssues(key, {
          limit: LIMIT,
          teamKey: matched?.key,
          projectId: proj?.id,
          statusNames,
          // Comentários implicam descrição (relatório detalhado).
          withDescription: input.incluir_descricao === true || withComments,
          withComments,
        });

        return {
          ok: true,
          time_filtrado: matched?.name ?? null,
          projeto_filtrado: proj?.name ?? null,
          status_filtrado: statusNames ?? null,
          total_issues: issues.length,
          // Bateu no teto → pode haver mais. Avise o usuário e ofereça refinar.
          truncado: issues.length >= LIMIT,
          teams: teams.map((t) => ({ nome: t.name, key: t.key })),
          status_do_time: teamStates ? teamStates.map((s) => ({ nome: s.name, tipo: s.type })) : null,
          labels_do_time: teamLabels ? teamLabels.map((l) => l.name) : null,
          projetos: projects.map((p) => ({ nome: p.name, estado: p.state ?? null })),
          issues: issues.map((i) => ({
            id: i.identifier, titulo: i.title, descricao: i.description ?? null,
            estado: i.state?.name, time: i.team?.name, projeto: i.project?.name ?? null,
            responsavel: i.assignee?.name ?? null, url: i.url,
            comentarios: i.comments?.nodes.map((c) => ({
              autor: c.user?.displayName || c.user?.name || c.user?.email || "?",
              quando: c.createdAt,
              texto: c.body,
            })),
          })),
        };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) };
      }
    }

    case "criar_card_linear": {
      const branch = await resolveBranchId((input.branch as string) ?? ctx.branch);
      if (!branch) return { ok: false, error: "ASK_BRANCH: pergunte ao usuário de qual branch é o Linear." };
      const key = await getConnectionSecret(`linear--${branch}`);
      if (!key) return { ok: false, error: "Linear não conectado nesta branch. Configure em Integrações." };
      const titulo = String(input.titulo ?? "").trim();
      if (!titulo) return { ok: false, error: "Título do card é obrigatório." };
      try {
        const teams = await listLinearTeams(key);
        if (teams.length === 0) return { ok: false, error: "Nenhum time encontrado no Linear." };
        const team = input.time ? matchTeam(teams, String(input.time)) : null;
        if (!team) {
          return {
            ok: false,
            error: "ASK_TEAM: time não informado ou não encontrado. Liste os times (listar_linear) e pergunte qual com perguntar_opcoes.",
            times_disponiveis: teams.map((t) => `${t.name} (${t.key})`),
          };
        }

        // Resolve projeto dentro do time, se informado.
        let projectId: string | undefined;
        let projectName: string | null = null;
        if (input.projeto) {
          const projects = await listLinearProjects(key, team.id);
          const proj = matchProject(projects, String(input.projeto));
          if (!proj) {
            return {
              ok: false,
              error: `ASK_PROJECT: projeto '${String(input.projeto)}' não encontrado no time ${team.name}. Pergunte qual com perguntar_opcoes.`,
              projetos_disponiveis: projects.map((p) => p.name),
            };
          }
          projectId = proj.id;
          projectName = proj.name;
        }

        const issue = await createLinearIssue(key, {
          teamId: team.id,
          title: titulo,
          description: input.descricao ? String(input.descricao) : undefined,
          projectId,
        });
        return { ok: true, card: { id: issue.identifier, titulo: issue.title, url: issue.url }, time: team.name, projeto: projectName };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) };
      }
    }

    case "atualizar_card_linear": {
      const branch = await resolveBranchId((input.branch as string) ?? ctx.branch);
      if (!branch) return { ok: false, error: "ASK_BRANCH: pergunte ao usuário de qual branch é o Linear." };
      const key = await getConnectionSecret(`linear--${branch}`);
      if (!key) return { ok: false, error: "Linear não conectado nesta branch. Configure em Integrações." };
      const identificador = String(input.identificador ?? "").trim();
      if (!identificador) return { ok: false, error: "Identificador do card (ex: 'ART-29') é obrigatório." };
      try {
        const issue = await getLinearIssueByIdentifier(key, identificador);
        if (!issue) return { ok: false, error: `Card '${identificador}' não encontrado no Linear.` };

        const update: { stateId?: string; title?: string; description?: string; assigneeId?: string; dueDate?: string | null; priority?: number } = {};
        let statusName: string | null = null;
        let assigneeName: string | null = null;
        let dueLabel: string | null = null;
        let priorityLabel: string | null = null;

        if (input.urgencia !== undefined && input.urgencia !== null && String(input.urgencia).trim() !== "") {
          const p = parseLinearPriority(String(input.urgencia));
          if (p === null) {
            return { ok: false, error: "Urgência inválida. Use 'urgente', 'alta', 'media', 'baixa' ou 'nenhuma'." };
          }
          update.priority = p;
          priorityLabel = PRIORITY_LABEL[p];
        }

        if (input.data !== undefined && input.data !== null && String(input.data).trim() !== "") {
          const raw = String(input.data).trim().toLowerCase();
          if (["remover", "limpar", "nenhuma", "none", "null", "-"].includes(raw)) {
            update.dueDate = null;
            dueLabel = "sem prazo";
          } else {
            // Aceita dd/mm/aaaa ou aaaa-mm-dd → normaliza para aaaa-mm-dd (TimelessDate do Linear).
            let iso: string | null = null;
            const br = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(raw);
            const isoM = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
            if (br) iso = `${br[3]}-${br[2]}-${br[1]}`;
            else if (isoM) iso = `${isoM[1]}-${isoM[2]}-${isoM[3]}`;
            if (!iso) {
              return { ok: false, error: `Data '${String(input.data)}' inválida. Use 'dd/mm/aaaa', 'aaaa-mm-dd' ou 'remover'.` };
            }
            update.dueDate = iso;
            dueLabel = iso;
          }
        }

        if (input.status) {
          const states = await listLinearWorkflowStates(key, issue.team.id);
          const wanted = String(input.status).trim().toLowerCase();
          const state =
            states.find((s) => s.name.toLowerCase() === wanted) ??
            states.find((s) => s.name.toLowerCase().includes(wanted));
          if (!state) {
            return {
              ok: false,
              error: `ASK_STATUS: status '${String(input.status)}' não encontrado no time ${issue.team.name}. Pergunte qual com perguntar_opcoes.`,
              status_disponiveis: states.map((s) => s.name),
            };
          }
          update.stateId = state.id;
          statusName = state.name;
        }

        if (input.responsavel) {
          const users = await listLinearUsers(key);
          const wanted = String(input.responsavel).trim().toLowerCase();
          const norm = (s: string) => s.toLowerCase();
          const user =
            users.find((u) => norm(u.email) === wanted || norm(u.name) === wanted || norm(u.displayName) === wanted) ??
            users.find((u) => norm(u.name).includes(wanted) || norm(u.displayName).includes(wanted) || norm(u.email).includes(wanted));
          if (!user) {
            return {
              ok: false,
              error: `ASK_RESPONSAVEL: membro '${String(input.responsavel)}' não encontrado no workspace. Pergunte qual com perguntar_opcoes.`,
              membros_disponiveis: users.map((u) => u.displayName || u.name),
            };
          }
          update.assigneeId = user.id;
          assigneeName = user.displayName || user.name;
        }

        if (input.titulo) update.title = String(input.titulo);
        if (input.descricao) update.description = String(input.descricao);

        // Labels: adicionar/remover (via mutations próprias, sem mexer nas demais).
        const labelsToAdd = Array.isArray(input.labels) ? input.labels.map((l) => String(l)).filter(Boolean) : [];
        const labelsToRemove = Array.isArray(input.remover_labels) ? input.remover_labels.map((l) => String(l)).filter(Boolean) : [];
        const labelsAdicionadas: string[] = [];
        const labelsRemovidas: string[] = [];
        if (labelsToAdd.length || labelsToRemove.length) {
          const labels = await listLinearLabels(key, issue.team.id);
          const findLabel = (q: string) => {
            const w = q.toLowerCase();
            return labels.find((l) => l.name.toLowerCase() === w) ?? labels.find((l) => l.name.toLowerCase().includes(w));
          };
          for (const q of labelsToAdd) {
            const l = findLabel(q);
            if (!l) {
              return {
                ok: false,
                error: `ASK_LABEL: label '${q}' não existe no time ${issue.team.name}. Crie com criar_label_linear ou confirme qual com perguntar_opcoes.`,
                labels_disponiveis: labels.map((x) => x.name),
              };
            }
            await addLinearIssueLabel(key, issue.id, l.id);
            labelsAdicionadas.push(l.name);
          }
          for (const q of labelsToRemove) {
            const l = findLabel(q);
            if (l) { await removeLinearIssueLabel(key, issue.id, l.id); labelsRemovidas.push(l.name); }
          }
        }

        const hasLabelOps = labelsAdicionadas.length > 0 || labelsRemovidas.length > 0;
        if (Object.keys(update).length === 0 && !hasLabelOps) {
          return { ok: false, error: "Nada para atualizar — informe status, responsavel, data, urgencia, labels, titulo ou descricao." };
        }

        const result = Object.keys(update).length > 0
          ? await updateLinearIssue(key, issue.id, update)
          : { identifier: issue.identifier, title: issue.title, url: undefined as string | undefined };
        return {
          ok: true,
          card: { id: result.identifier, titulo: result.title, url: result.url },
          novo_status: statusName, responsavel: assigneeName, prazo: dueLabel, urgencia: priorityLabel,
          labels_adicionadas: labelsAdicionadas.length ? labelsAdicionadas : undefined,
          labels_removidas: labelsRemovidas.length ? labelsRemovidas : undefined,
        };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) };
      }
    }

    case "excluir_card_linear": {
      const branch = await resolveBranchId((input.branch as string) ?? ctx.branch);
      if (!branch) return { ok: false, error: "ASK_BRANCH: pergunte ao usuário de qual branch é o Linear." };
      const key = await getConnectionSecret(`linear--${branch}`);
      if (!key) return { ok: false, error: "Linear não conectado nesta branch. Configure em Integrações." };
      const identificador = String(input.identificador ?? "").trim();
      if (!identificador) return { ok: false, error: "Identificador do card (ex: 'ART-29') é obrigatório." };
      try {
        const issue = await getLinearIssueByIdentifier(key, identificador);
        if (!issue) return { ok: false, error: `Card '${identificador}' não encontrado no Linear.` };
        await deleteLinearIssue(key, issue.id);
        return { ok: true, excluido: { id: issue.identifier, titulo: issue.title } };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) };
      }
    }

    case "criar_status_linear": {
      const branch = await resolveBranchId((input.branch as string) ?? ctx.branch);
      if (!branch) return { ok: false, error: "ASK_BRANCH: pergunte ao usuário de qual branch é o Linear." };
      const key = await getConnectionSecret(`linear--${branch}`);
      if (!key) return { ok: false, error: "Linear não conectado nesta branch. Configure em Integrações." };
      const nome = String(input.nome ?? "").trim();
      if (!nome) return { ok: false, error: "Nome do status é obrigatório." };
      const tipo = String(input.tipo ?? "").trim() as LinearStateType;
      if (!LINEAR_STATE_TYPES.includes(tipo)) {
        return { ok: false, error: `Tipo inválido. Use um de: ${LINEAR_STATE_TYPES.join(", ")}.` };
      }
      try {
        const teams = await listLinearTeams(key);
        const team = input.time ? matchTeam(teams, String(input.time)) : (teams.length === 1 ? teams[0] : null);
        if (!team) {
          return {
            ok: false,
            error: "ASK_TEAM: de qual time é o status? Pergunte com perguntar_opcoes.",
            times_disponiveis: teams.map((t) => `${t.name} (${t.key})`),
          };
        }
        const created = await createLinearWorkflowState(key, { teamId: team.id, name: nome, type: tipo, color: input.cor ? String(input.cor) : undefined });
        return { ok: true, status_criado: { nome: created.name, tipo: created.type, cor: created.color }, time: team.name };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) };
      }
    }

    case "editar_status_linear": {
      const branch = await resolveBranchId((input.branch as string) ?? ctx.branch);
      if (!branch) return { ok: false, error: "ASK_BRANCH: pergunte ao usuário de qual branch é o Linear." };
      const key = await getConnectionSecret(`linear--${branch}`);
      if (!key) return { ok: false, error: "Linear não conectado nesta branch. Configure em Integrações." };
      const statusAtual = String(input.status_atual ?? "").trim();
      if (!statusAtual) return { ok: false, error: "Informe o nome do status atual a editar." };
      try {
        const teams = await listLinearTeams(key);
        const team = input.time ? matchTeam(teams, String(input.time)) : (teams.length === 1 ? teams[0] : null);
        if (!team) {
          return {
            ok: false,
            error: "ASK_TEAM: de qual time é o status? Pergunte com perguntar_opcoes.",
            times_disponiveis: teams.map((t) => `${t.name} (${t.key})`),
          };
        }
        const states = await listLinearWorkflowStates(key, team.id);
        const wanted = statusAtual.toLowerCase();
        const state = states.find((s) => s.name.toLowerCase() === wanted) ?? states.find((s) => s.name.toLowerCase().includes(wanted));
        if (!state) {
          return {
            ok: false,
            error: `Status '${statusAtual}' não encontrado no time ${team.name}.`,
            status_disponiveis: states.map((s) => s.name),
          };
        }
        const upd: { name?: string; color?: string; type?: LinearStateType } = {};
        if (input.novo_nome) upd.name = String(input.novo_nome);
        if (input.cor) upd.color = String(input.cor);
        if (input.tipo) {
          const t = String(input.tipo) as LinearStateType;
          if (!LINEAR_STATE_TYPES.includes(t)) return { ok: false, error: `Tipo inválido. Use um de: ${LINEAR_STATE_TYPES.join(", ")}.` };
          upd.type = t;
        }
        if (Object.keys(upd).length === 0) return { ok: false, error: "Nada para editar — informe novo_nome, cor ou tipo." };
        const updated = await updateLinearWorkflowState(key, state.id, upd);
        return { ok: true, status_editado: { de: state.name, para: updated.name, tipo: updated.type, cor: updated.color }, time: team.name };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) };
      }
    }

    case "comentar_card_linear": {
      const branch = await resolveBranchId((input.branch as string) ?? ctx.branch);
      if (!branch) return { ok: false, error: "ASK_BRANCH: pergunte ao usuário de qual branch é o Linear." };
      const key = await getConnectionSecret(`linear--${branch}`);
      if (!key) return { ok: false, error: "Linear não conectado nesta branch. Configure em Integrações." };
      const ident = String(input.identificador ?? "").trim();
      const texto = String(input.texto ?? "").trim();
      if (!ident || !texto) return { ok: false, error: "Identificador e texto do comentário são obrigatórios." };
      try {
        const issue = await getLinearIssueByIdentifier(key, ident);
        if (!issue) return { ok: false, error: `Card '${ident}' não encontrado no Linear.` };

        // Resolve menções → tokens @[displayName](userId) prefixados no corpo.
        let mentionPrefix = "";
        const mencionados: string[] = [];
        const wanted = Array.isArray(input.mencionar) ? input.mencionar.map((m) => String(m)).filter(Boolean) : [];
        if (wanted.length) {
          const users = await listLinearUsers(key);
          for (const w of wanted) {
            const user = matchLinearUser(users, w);
            if (!user) {
              return {
                ok: false,
                error: `ASK_MENCAO: membro '${w}' não encontrado pra marcar. Pergunte qual com perguntar_opcoes.`,
                membros_disponiveis: users.map((u) => u.displayName || u.name),
              };
            }
            mentionPrefix += `@[${user.displayName || user.name}](${user.id}) `;
            mencionados.push(user.displayName || user.name);
          }
        }

        const body = mentionPrefix ? `${mentionPrefix}\n${texto}` : texto;
        await createLinearComment(key, issue.id, body);
        return { ok: true, comentario_em: issue.identifier, mencionados };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) };
      }
    }

    case "anexar_link_linear": {
      const branch = await resolveBranchId((input.branch as string) ?? ctx.branch);
      if (!branch) return { ok: false, error: "ASK_BRANCH: pergunte ao usuário de qual branch é o Linear." };
      const key = await getConnectionSecret(`linear--${branch}`);
      if (!key) return { ok: false, error: "Linear não conectado nesta branch. Configure em Integrações." };
      const ident = String(input.identificador ?? "").trim();
      const titulo = String(input.titulo ?? "").trim();
      const url = String(input.url ?? "").trim();
      if (!ident || !titulo || !url) return { ok: false, error: "Identificador, titulo e url são obrigatórios." };
      try {
        const issue = await getLinearIssueByIdentifier(key, ident);
        if (!issue) return { ok: false, error: `Card '${ident}' não encontrado no Linear.` };
        const att = await createLinearAttachment(key, { issueId: issue.id, title: titulo, url, subtitle: input.subtitulo ? String(input.subtitulo) : undefined });
        return { ok: true, anexo_criado: { titulo: att.title, url: att.url }, card: issue.identifier };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) };
      }
    }

    case "editar_anexo_linear":
    case "excluir_anexo_linear": {
      const branch = await resolveBranchId((input.branch as string) ?? ctx.branch);
      if (!branch) return { ok: false, error: "ASK_BRANCH: pergunte ao usuário de qual branch é o Linear." };
      const key = await getConnectionSecret(`linear--${branch}`);
      if (!key) return { ok: false, error: "Linear não conectado nesta branch. Configure em Integrações." };
      const ident = String(input.identificador ?? "").trim();
      const anexoQ = String(input.anexo ?? "").trim().toLowerCase();
      if (!ident || !anexoQ) return { ok: false, error: "Identificador e o anexo (título/url) são obrigatórios." };
      try {
        const issue = await getLinearIssueByIdentifier(key, ident);
        if (!issue) return { ok: false, error: `Card '${ident}' não encontrado no Linear.` };
        const attachments = await listLinearIssueAttachments(key, issue.id);
        const att =
          attachments.find((a) => a.title.toLowerCase() === anexoQ || a.url.toLowerCase() === anexoQ) ??
          attachments.find((a) => a.title.toLowerCase().includes(anexoQ) || a.url.toLowerCase().includes(anexoQ));
        if (!att) {
          return {
            ok: false,
            error: `Anexo '${String(input.anexo)}' não encontrado no card ${issue.identifier}.`,
            anexos_disponiveis: attachments.map((a) => a.title),
          };
        }
        if (name === "excluir_anexo_linear") {
          await deleteLinearAttachment(key, att.id);
          return { ok: true, anexo_excluido: att.title, card: issue.identifier };
        }
        const upd: { title?: string; subtitle?: string } = {};
        if (input.novo_titulo) upd.title = String(input.novo_titulo);
        if (input.novo_subtitulo) upd.subtitle = String(input.novo_subtitulo);
        if (Object.keys(upd).length === 0) return { ok: false, error: "Nada para editar — informe novo_titulo ou novo_subtitulo." };
        const updated = await updateLinearAttachment(key, att.id, upd);
        return { ok: true, anexo_editado: { de: att.title, para: updated.title }, card: issue.identifier };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) };
      }
    }

    case "criar_label_linear": {
      const branch = await resolveBranchId((input.branch as string) ?? ctx.branch);
      if (!branch) return { ok: false, error: "ASK_BRANCH: pergunte ao usuário de qual branch é o Linear." };
      const key = await getConnectionSecret(`linear--${branch}`);
      if (!key) return { ok: false, error: "Linear não conectado nesta branch. Configure em Integrações." };
      const nome = String(input.nome ?? "").trim();
      if (!nome) return { ok: false, error: "Nome da label é obrigatório." };
      try {
        let teamId: string | undefined;
        let teamName: string | null = null;
        if (input.time) {
          const teams = await listLinearTeams(key);
          const team = matchTeam(teams, String(input.time));
          if (!team) {
            return { ok: false, error: `Time '${String(input.time)}' não encontrado.`, times_disponiveis: teams.map((t) => `${t.name} (${t.key})`) };
          }
          teamId = team.id;
          teamName = team.name;
        }
        const label = await createLinearLabel(key, { name: nome, color: input.cor ? String(input.cor) : undefined, teamId });
        return { ok: true, label_criada: { nome: label.name, cor: label.color }, escopo: teamName ?? "workspace" };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) };
      }
    }

    case "editar_label_linear": {
      const branch = await resolveBranchId((input.branch as string) ?? ctx.branch);
      if (!branch) return { ok: false, error: "ASK_BRANCH: pergunte ao usuário de qual branch é o Linear." };
      const key = await getConnectionSecret(`linear--${branch}`);
      if (!key) return { ok: false, error: "Linear não conectado nesta branch. Configure em Integrações." };
      const labelAtual = String(input.label_atual ?? "").trim();
      if (!labelAtual) return { ok: false, error: "Informe o nome atual da label." };
      try {
        let teamId: string | undefined;
        if (input.time) {
          const teams = await listLinearTeams(key);
          const team = matchTeam(teams, String(input.time));
          teamId = team?.id;
        }
        const labels = await listLinearLabels(key, teamId);
        const w = labelAtual.toLowerCase();
        const label = labels.find((l) => l.name.toLowerCase() === w) ?? labels.find((l) => l.name.toLowerCase().includes(w));
        if (!label) {
          return { ok: false, error: `Label '${labelAtual}' não encontrada.`, labels_disponiveis: labels.map((l) => l.name) };
        }
        const upd: { name?: string; color?: string } = {};
        if (input.novo_nome) upd.name = String(input.novo_nome);
        if (input.cor) upd.color = String(input.cor);
        if (Object.keys(upd).length === 0) return { ok: false, error: "Nada para editar — informe novo_nome ou cor." };
        const updated = await updateLinearLabel(key, label.id, upd);
        return { ok: true, label_editada: { de: label.name, para: updated.name, cor: updated.color } };
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
