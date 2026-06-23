"use client";

/** DTO de conexão como vem da API (sem segredo em claro). */
export interface ConnectionDTO {
  id: string;
  connector: string;
  workspace: string | null;
  name: string | null;
  config: Record<string, unknown> | null;
  connected: boolean;
  hasSecret: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface SaveConnectionInput {
  id?: string;
  connector: string;
  workspace?: string | null;
  name?: string | null;
  config?: Record<string, unknown> | null;
  /** segredo em claro; omita ou vazio para manter o atual */
  secret?: string;
  connected?: boolean;
}

export async function fetchConnections(): Promise<ConnectionDTO[]> {
  const res = await fetch("/api/connections");
  const data = await res.json();
  return data.connections ?? [];
}

export async function saveConnection(input: SaveConnectionInput): Promise<ConnectionDTO | null> {
  const res = await fetch("/api/connections", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = await res.json();
  return data.connection ?? null;
}

export async function removeConnection(id: string): Promise<void> {
  await fetch("/api/connections", {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id }),
  });
}

export interface IntrospectedColumn { name: string; type: string; pk: boolean }
export interface IntrospectedTable { name: string; columns: IntrospectedColumn[]; rowCount: number | null }

/** Lista as tabelas de um banco Turso (por conexão salva `id` ou `url`+`token`). */
export async function introspectConnection(
  input: { id?: string; url?: string; token?: string },
): Promise<{ tables?: IntrospectedTable[]; error?: string }> {
  const res = await fetch("/api/connections/introspect", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  return res.json();
}

export interface ImportResult {
  imported: number;
  updated: number;
  skipped: number;
  tables: { table: string; rows: number; error?: string }[];
}

/** Importa/sincroniza as tabelas selecionadas de uma conexão como tasks. */
export async function importConnection(
  id: string,
  workspace: string,
): Promise<{ result?: ImportResult; error?: string }> {
  const res = await fetch("/api/connections/import", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id, workspace }),
  });
  return res.json();
}
