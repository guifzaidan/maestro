import type Anthropic from "@anthropic-ai/sdk";
import { createTask, listTasks } from "@/lib/db/tasks";
import { listBranches } from "@/lib/db/branches";
import { listTursoTargets, getConnectionSecret, type TursoTarget } from "@/lib/db/connections";
import { introspectTurso } from "@/lib/turso-introspect";
import { queryTurso } from "@/lib/turso-query";
import { listLinearTeams, listLinearProjects, listLinearIssues, createLinearIssue, listLinearWorkflowStates, getLinearIssueByIdentifier, updateLinearIssue, deleteLinearIssue, listLinearUsers } from "@/lib/linear";
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

        const update: { stateId?: string; title?: string; description?: string; assigneeId?: string; dueDate?: string | null } = {};
        let statusName: string | null = null;
        let assigneeName: string | null = null;
        let dueLabel: string | null = null;

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

        if (Object.keys(update).length === 0) {
          return { ok: false, error: "Nada para atualizar — informe status, responsavel, data, titulo ou descricao." };
        }

        const updated = await updateLinearIssue(key, issue.id, update);
        return { ok: true, card: { id: updated.identifier, titulo: updated.title, url: updated.url }, novo_status: statusName, responsavel: assigneeName, prazo: dueLabel };
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
