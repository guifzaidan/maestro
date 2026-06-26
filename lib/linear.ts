/**
 * Cliente mínimo da API do Linear (GraphQL). A autenticação usa a Personal API
 * key direto no header Authorization (sem "Bearer"). Server-side apenas — a key
 * é decifrada do banco e nunca vai pro cliente.
 */
const LINEAR_API = "https://api.linear.app/graphql";

async function linearGraphQL<T>(apiKey: string, query: string, variables?: Record<string, unknown>): Promise<T> {
  const res = await fetch(LINEAR_API, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: apiKey },
    body: JSON.stringify({ query, variables }),
  });
  const json = (await res.json().catch(() => ({}))) as { data?: T; errors?: { message: string }[] };
  if (!res.ok || json.errors) {
    const msg = json.errors?.map((e) => e.message).join("; ") || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return json.data as T;
}

export interface LinearTeam { id: string; name: string; key: string }
export interface LinearProject { id: string; name: string; state?: string }
export interface LinearComment { body: string; createdAt: string; user?: { displayName?: string; name?: string; email?: string } | null }
export interface LinearIssue { identifier: string; title: string; description?: string | null; state?: { name: string }; team?: { name: string }; project?: { name: string } | null; assignee?: { name: string } | null; url: string; comments?: { nodes: LinearComment[] } }

export async function listLinearTeams(apiKey: string): Promise<LinearTeam[]> {
  const d = await linearGraphQL<{ teams: { nodes: LinearTeam[] } }>(
    apiKey,
    `query { teams(first: 50) { nodes { id name key } } }`,
  );
  return d.teams.nodes;
}

/**
 * Lista projetos do Linear. Se `teamId` for passado, traz só os projetos
 * acessíveis àquele time; senão, traz os projetos do workspace.
 */
export async function listLinearProjects(apiKey: string, teamId?: string): Promise<LinearProject[]> {
  if (teamId) {
    const d = await linearGraphQL<{ team: { projects: { nodes: LinearProject[] } } | null }>(
      apiKey,
      `query($id: String!) {
        team(id: $id) { projects(first: 50) { nodes { id name state } } }
      }`,
      { id: teamId },
    );
    return d.team?.projects.nodes ?? [];
  }
  const d = await linearGraphQL<{ projects: { nodes: LinearProject[] } }>(
    apiKey,
    `query { projects(first: 50) { nodes { id name state } } }`,
  );
  return d.projects.nodes;
}

/** Filtros opcionais para listar issues. */
export interface IssueFilter { limit?: number; teamKey?: string; projectId?: string; withComments?: boolean; withDescription?: boolean; statusNames?: string[] }

export async function listLinearIssues(apiKey: string, filter: IssueFilter = {}): Promise<LinearIssue[]> {
  const f: Record<string, unknown> = {};
  if (filter.teamKey) f.team = { key: { eq: filter.teamKey } };
  if (filter.projectId) f.project = { id: { eq: filter.projectId } };
  if (filter.statusNames && filter.statusNames.length) f.state = { name: { in: filter.statusNames } };
  // Descrição e comentários (Activity) — só quando pedidos, pra não pesar (tokens).
  const descFrag = filter.withDescription ? "description" : "";
  const commentsFrag = filter.withComments
    ? `comments(first: 30) { nodes { body createdAt user { displayName name email } } }`
    : "";
  const d = await linearGraphQL<{ issues: { nodes: LinearIssue[] } }>(
    apiKey,
    `query($n: Int!, $filter: IssueFilter) {
      issues(first: $n, orderBy: updatedAt, filter: $filter) {
        nodes { identifier title url state { name } team { name } project { name } assignee { name } ${descFrag} ${commentsFrag} }
      }
    }`,
    { n: filter.limit ?? 100, filter: Object.keys(f).length ? f : undefined },
  );
  return d.issues.nodes;
}

export interface LinearWorkflowState { id: string; name: string; type: string }

export async function listLinearWorkflowStates(apiKey: string, teamId: string): Promise<LinearWorkflowState[]> {
  const d = await linearGraphQL<{ workflowStates: { nodes: LinearWorkflowState[] } }>(
    apiKey,
    `query($teamId: ID!) {
      workflowStates(filter: { team: { id: { eq: $teamId } } }, first: 50) {
        nodes { id name type }
      }
    }`,
    { teamId },
  );
  return d.workflowStates.nodes;
}

/** Tipos válidos de workflow state no Linear. */
export const LINEAR_STATE_TYPES = ["triage", "backlog", "unstarted", "started", "completed", "canceled"] as const;
export type LinearStateType = (typeof LINEAR_STATE_TYPES)[number];

/** Cria um novo status (workflow state) num time do Linear. */
export async function createLinearWorkflowState(
  apiKey: string,
  input: { teamId: string; name: string; type: LinearStateType; color?: string },
): Promise<{ id: string; name: string; type: string; color: string }> {
  const d = await linearGraphQL<{ workflowStateCreate: { success: boolean; workflowState: { id: string; name: string; type: string; color: string } } }>(
    apiKey,
    `mutation($input: WorkflowStateCreateInput!) {
      workflowStateCreate(input: $input) { success workflowState { id name type color } }
    }`,
    { input: { teamId: input.teamId, name: input.name, type: input.type, color: input.color ?? "#6e7b8b" } },
  );
  if (!d.workflowStateCreate?.success) throw new Error("Linear recusou a criação do status.");
  return d.workflowStateCreate.workflowState;
}

/** Edita um status existente (nome, cor e/ou tipo). */
export async function updateLinearWorkflowState(
  apiKey: string,
  stateId: string,
  input: { name?: string; color?: string; type?: LinearStateType },
): Promise<{ id: string; name: string; type: string; color: string }> {
  const d = await linearGraphQL<{ workflowStateUpdate: { success: boolean; workflowState: { id: string; name: string; type: string; color: string } } }>(
    apiKey,
    `mutation($id: String!, $input: WorkflowStateUpdateInput!) {
      workflowStateUpdate(id: $id, input: $input) { success workflowState { id name type color } }
    }`,
    { id: stateId, input },
  );
  if (!d.workflowStateUpdate?.success) throw new Error("Linear recusou a edição do status.");
  return d.workflowStateUpdate.workflowState;
}

export interface LinearUser { id: string; name: string; displayName: string; email: string; active: boolean }

/** Lista os membros do workspace do Linear (para atribuir como responsável). */
export async function listLinearUsers(apiKey: string): Promise<LinearUser[]> {
  const d = await linearGraphQL<{ users: { nodes: LinearUser[] } }>(
    apiKey,
    `query { users(first: 100) { nodes { id name displayName email active } } }`,
  );
  return d.users.nodes.filter((u) => u.active);
}

export async function getLinearIssueByIdentifier(
  apiKey: string,
  identifier: string,
): Promise<{ id: string; identifier: string; title: string; team: { id: string; name: string } } | null> {
  // O `identifier` (ex: "ART-29") é um campo computado e NÃO existe no IssueFilter.
  // Quebramos em chave do time ("ART") + número (29) e filtramos por ambos.
  const m = /^([A-Za-z][A-Za-z0-9]*)-(\d+)$/.exec(identifier.trim());
  if (!m) return null;
  const teamKey = m[1].toUpperCase();
  const number = Number(m[2]);

  const d = await linearGraphQL<{
    issues: { nodes: Array<{ id: string; identifier: string; title: string; team: { id: string; name: string } }> };
  }>(
    apiKey,
    `query($filter: IssueFilter) {
      issues(filter: $filter, first: 1) {
        nodes { id identifier title team { id name } }
      }
    }`,
    { filter: { team: { key: { eq: teamKey } }, number: { eq: number } } },
  );
  return d.issues.nodes[0] ?? null;
}

export async function updateLinearIssue(
  apiKey: string,
  issueId: string,
  input: { stateId?: string; title?: string; description?: string; assigneeId?: string; dueDate?: string | null; priority?: number },
): Promise<{ identifier: string; title: string; url: string }> {
  const d = await linearGraphQL<{ issueUpdate: { success: boolean; issue: { identifier: string; title: string; url: string } } }>(
    apiKey,
    `mutation($id: String!, $input: IssueUpdateInput!) {
      issueUpdate(id: $id, input: $input) { success issue { identifier title url } }
    }`,
    { id: issueId, input },
  );
  if (!d.issueUpdate?.success) throw new Error("Linear recusou a atualização do card.");
  return d.issueUpdate.issue;
}

/**
 * Exclui um card do Linear. Usa `issueDelete`, que move o card pra lixeira
 * (recuperável por ~30 dias no Linear) — não é um hard-delete irreversível.
 */
export async function deleteLinearIssue(apiKey: string, issueId: string): Promise<void> {
  const d = await linearGraphQL<{ issueDelete: { success: boolean } }>(
    apiKey,
    `mutation($id: String!) { issueDelete(id: $id) { success } }`,
    { id: issueId },
  );
  if (!d.issueDelete?.success) throw new Error("Linear recusou a exclusão do card.");
}

/**
 * Cria um comentário num card. Para mencionar um usuário (notifica), inclua no
 * `body` o token `@[displayName](userId)` — formato oficial do Linear.
 */
export async function createLinearComment(apiKey: string, issueId: string, body: string): Promise<{ id: string; url: string }> {
  const d = await linearGraphQL<{ commentCreate: { success: boolean; comment: { id: string; url: string } } }>(
    apiKey,
    `mutation($input: CommentCreateInput!) {
      commentCreate(input: $input) { success comment { id url } }
    }`,
    { input: { issueId, body } },
  );
  if (!d.commentCreate?.success) throw new Error("Linear recusou o comentário.");
  return d.commentCreate.comment;
}

export interface LinearAttachment { id: string; title: string; subtitle: string | null; url: string }

/** Anexos (links) de um card. */
export async function listLinearIssueAttachments(apiKey: string, issueId: string): Promise<LinearAttachment[]> {
  const d = await linearGraphQL<{ issue: { attachments: { nodes: LinearAttachment[] } } | null }>(
    apiKey,
    `query($id: String!) { issue(id: $id) { attachments(first: 50) { nodes { id title subtitle url } } } }`,
    { id: issueId },
  );
  return d.issue?.attachments.nodes ?? [];
}

/** Cria um anexo de link (URL + título) num card. */
export async function createLinearAttachment(
  apiKey: string,
  input: { issueId: string; title: string; url: string; subtitle?: string },
): Promise<{ id: string; title: string; url: string }> {
  const d = await linearGraphQL<{ attachmentCreate: { success: boolean; attachment: { id: string; title: string; url: string } } }>(
    apiKey,
    `mutation($input: AttachmentCreateInput!) {
      attachmentCreate(input: $input) { success attachment { id title url } }
    }`,
    { input: { issueId: input.issueId, title: input.title, url: input.url, subtitle: input.subtitle } },
  );
  if (!d.attachmentCreate?.success) throw new Error("Linear recusou criar o anexo.");
  return d.attachmentCreate.attachment;
}

/** Edita um anexo (título/subtítulo). O Linear não permite trocar a URL — recrie. */
export async function updateLinearAttachment(
  apiKey: string,
  id: string,
  input: { title?: string; subtitle?: string },
): Promise<{ id: string; title: string }> {
  const d = await linearGraphQL<{ attachmentUpdate: { success: boolean; attachment: { id: string; title: string } } }>(
    apiKey,
    `mutation($id: String!, $input: AttachmentUpdateInput!) {
      attachmentUpdate(id: $id, input: $input) { success attachment { id title } }
    }`,
    { id, input },
  );
  if (!d.attachmentUpdate?.success) throw new Error("Linear recusou editar o anexo.");
  return d.attachmentUpdate.attachment;
}

/** Exclui um anexo de um card. */
export async function deleteLinearAttachment(apiKey: string, id: string): Promise<void> {
  const d = await linearGraphQL<{ attachmentDelete: { success: boolean } }>(
    apiKey,
    `mutation($id: String!) { attachmentDelete(id: $id) { success } }`,
    { id },
  );
  if (!d.attachmentDelete?.success) throw new Error("Linear recusou excluir o anexo.");
}

export interface LinearLabel { id: string; name: string; color: string; team?: { id: string } | null }

/** Lista as labels do workspace. Se `teamId`, traz só as do time + as globais. */
export async function listLinearLabels(apiKey: string, teamId?: string): Promise<LinearLabel[]> {
  const d = await linearGraphQL<{ issueLabels: { nodes: LinearLabel[] } }>(
    apiKey,
    `query { issueLabels(first: 250) { nodes { id name color team { id } } } }`,
  );
  const all = d.issueLabels.nodes;
  if (!teamId) return all;
  return all.filter((l) => !l.team || l.team.id === teamId);
}

/** Cria uma label. Com `teamId` é do time; sem, é do workspace. */
export async function createLinearLabel(
  apiKey: string,
  input: { name: string; color?: string; teamId?: string },
): Promise<{ id: string; name: string; color: string }> {
  const d = await linearGraphQL<{ issueLabelCreate: { success: boolean; issueLabel: { id: string; name: string; color: string } } }>(
    apiKey,
    `mutation($input: IssueLabelCreateInput!) {
      issueLabelCreate(input: $input) { success issueLabel { id name color } }
    }`,
    { input: { name: input.name, color: input.color ?? "#6e7b8b", teamId: input.teamId } },
  );
  if (!d.issueLabelCreate?.success) throw new Error("Linear recusou criar a label.");
  return d.issueLabelCreate.issueLabel;
}

/** Edita uma label (nome e/ou cor). */
export async function updateLinearLabel(
  apiKey: string,
  id: string,
  input: { name?: string; color?: string },
): Promise<{ id: string; name: string; color: string }> {
  const d = await linearGraphQL<{ issueLabelUpdate: { success: boolean; issueLabel: { id: string; name: string; color: string } } }>(
    apiKey,
    `mutation($id: String!, $input: IssueLabelUpdateInput!) {
      issueLabelUpdate(id: $id, input: $input) { success issueLabel { id name color } }
    }`,
    { id, input },
  );
  if (!d.issueLabelUpdate?.success) throw new Error("Linear recusou editar a label.");
  return d.issueLabelUpdate.issueLabel;
}

/** Adiciona uma label a uma issue (sem mexer nas demais). */
export async function addLinearIssueLabel(apiKey: string, issueId: string, labelId: string): Promise<void> {
  const d = await linearGraphQL<{ issueAddLabel: { success: boolean } }>(
    apiKey,
    `mutation($id: String!, $labelId: String!) { issueAddLabel(id: $id, labelId: $labelId) { success } }`,
    { id: issueId, labelId },
  );
  if (!d.issueAddLabel?.success) throw new Error("Linear recusou adicionar a label.");
}

/** Remove uma label de uma issue. */
export async function removeLinearIssueLabel(apiKey: string, issueId: string, labelId: string): Promise<void> {
  const d = await linearGraphQL<{ issueRemoveLabel: { success: boolean } }>(
    apiKey,
    `mutation($id: String!, $labelId: String!) { issueRemoveLabel(id: $id, labelId: $labelId) { success } }`,
    { id: issueId, labelId },
  );
  if (!d.issueRemoveLabel?.success) throw new Error("Linear recusou remover a label.");
}

export interface CreatedIssue { identifier: string; title: string; url: string }

export async function createLinearIssue(
  apiKey: string,
  input: { teamId: string; title: string; description?: string; projectId?: string },
): Promise<CreatedIssue> {
  const d = await linearGraphQL<{ issueCreate: { success: boolean; issue: CreatedIssue } }>(
    apiKey,
    `mutation($input: IssueCreateInput!) {
      issueCreate(input: $input) { success issue { identifier title url } }
    }`,
    { input },
  );
  if (!d.issueCreate?.success) throw new Error("Linear recusou a criação do card.");
  return d.issueCreate.issue;
}
