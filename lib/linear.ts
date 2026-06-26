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
export interface LinearIssue { identifier: string; title: string; state?: { name: string }; team?: { name: string }; project?: { name: string } | null; assignee?: { name: string } | null; url: string }

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
export interface IssueFilter { limit?: number; teamKey?: string; projectId?: string }

export async function listLinearIssues(apiKey: string, filter: IssueFilter = {}): Promise<LinearIssue[]> {
  const f: Record<string, unknown> = {};
  if (filter.teamKey) f.team = { key: { eq: filter.teamKey } };
  if (filter.projectId) f.project = { id: { eq: filter.projectId } };
  const d = await linearGraphQL<{ issues: { nodes: LinearIssue[] } }>(
    apiKey,
    `query($n: Int!, $filter: IssueFilter) {
      issues(first: $n, orderBy: updatedAt, filter: $filter) {
        nodes { identifier title url state { name } team { name } project { name } assignee { name } }
      }
    }`,
    { n: filter.limit ?? 25, filter: Object.keys(f).length ? f : undefined },
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
  input: { stateId?: string; title?: string; description?: string; assigneeId?: string; dueDate?: string | null },
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
