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
