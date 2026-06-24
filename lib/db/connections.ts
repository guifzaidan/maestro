import { eq, or, isNull } from "drizzle-orm";
import { db, ensureSchema } from "./index";
import { connections, type Connection } from "./schema";
import { encryptSecret, decryptSecret } from "../crypto";
import type { TableMapping } from "../table-mapping";

/** Forma segura enviada ao cliente — nunca inclui o segredo em claro. */
export interface ConnectionDTO {
  id: string;
  connector: string;
  branch: string | null;
  name: string | null;
  config: Record<string, unknown> | null;
  connected: boolean;
  hasSecret: boolean;
  createdAt: number;
  updatedAt: number;
}

function toDTO(row: Connection): ConnectionDTO {
  return {
    id: row.id,
    connector: row.connector,
    branch: row.branch,
    name: row.name,
    config: row.config ? (JSON.parse(row.config) as Record<string, unknown>) : null,
    connected: row.connected,
    hasSecret: !!row.secret,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function listConnections(branch?: string): Promise<ConnectionDTO[]> {
  await ensureSchema();
  const rows = branch
    ? await db.select().from(connections).where(or(eq(connections.branch, branch), isNull(connections.branch)))
    : await db.select().from(connections);
  return rows.map(toDTO);
}

export interface UpsertConnectionInput {
  id?: string;
  connector: string;
  branch?: string | null;
  name?: string | null;
  config?: Record<string, unknown> | null;
  /** segredo em claro; string vazia/undefined = manter o atual */
  secret?: string | null;
  connected?: boolean;
}

export async function upsertConnection(input: UpsertConnectionInput): Promise<ConnectionDTO> {
  await ensureSchema();
  const now = Date.now();
  const existing = input.id
    ? (await db.select().from(connections).where(eq(connections.id, input.id)))[0]
    : undefined;

  // Cifra um novo segredo se enviado; senão preserva o que já estava salvo.
  const secret =
    typeof input.secret === "string" && input.secret.length > 0
      ? encryptSecret(input.secret)
      : (existing?.secret ?? null);

  if (existing) {
    const fields: Partial<Connection> = { updatedAt: now, secret };
    if (input.connector !== undefined) fields.connector = input.connector;
    if (input.branch !== undefined) fields.branch = input.branch;
    if (input.name !== undefined) fields.name = input.name;
    if (input.config !== undefined) fields.config = input.config ? JSON.stringify(input.config) : null;
    if (input.connected !== undefined) fields.connected = input.connected;
    await db.update(connections).set(fields).where(eq(connections.id, existing.id));
    const updated = (await db.select().from(connections).where(eq(connections.id, existing.id)))[0];
    return toDTO(updated);
  }

  const row: Connection = {
    id: input.id ?? crypto.randomUUID(),
    connector: input.connector,
    branch: input.branch ?? null,
    name: input.name ?? null,
    config: input.config ? JSON.stringify(input.config) : null,
    secret,
    connected: input.connected ?? false,
    createdAt: now,
    updatedAt: now,
  };
  await db.insert(connections).values(row);
  return toDTO(row);
}

export async function deleteConnection(id: string): Promise<void> {
  await ensureSchema();
  await db.delete(connections).where(eq(connections.id, id));
}

/**
 * Uso EXCLUSIVO do servidor (ex.: o agente vai realmente conectar no serviço).
 * Decifra o segredo de uma conexão. Nunca exponha o retorno ao cliente.
 */
export async function getConnectionSecret(id: string): Promise<string | null> {
  await ensureSchema();
  const row = (await db.select().from(connections).where(eq(connections.id, id)))[0];
  if (!row?.secret) return null;
  return decryptSecret(row.secret);
}

/**
 * Uso server-side: url + token (decifrado) de uma conexão Turso salva, para
 * abrir o banco externo e introspeccionar/sincronizar. Nunca exponha ao cliente.
 */
export async function getConnectionTarget(id: string): Promise<{ url: string; token: string | null } | null> {
  await ensureSchema();
  const row = (await db.select().from(connections).where(eq(connections.id, id)))[0];
  if (!row) return null;
  const url = row.config ? ((JSON.parse(row.config) as { url?: string }).url ?? "") : "";
  const token = row.secret ? decryptSecret(row.secret) : null;
  return { url, token };
}

/** Spec completo (server-side) para importar/sincronizar uma conexão Turso. */
export interface ImportSpec {
  url: string;
  token: string | null;
  tables: string[];
  mappings: Record<string, TableMapping>;
  branch: string | null;
}

/** Alvo Turso (server-side) com credenciais decifradas, para o agente consultar. */
export interface TursoTarget {
  id: string;
  name: string | null;
  url: string;
  token: string | null;
}

/**
 * Lista as conexões Turso de uma branch (mais as globais, branch null) com
 * url + token decifrado. Uso EXCLUSIVO do servidor (agente). Nunca exponha.
 */
export async function listTursoTargets(branch: string): Promise<TursoTarget[]> {
  await ensureSchema();
  const rows = await db
    .select()
    .from(connections)
    .where(or(eq(connections.branch, branch), isNull(connections.branch)));
  return rows
    .filter((r) => r.connector === "turso")
    .map((r) => {
      const url = r.config ? ((JSON.parse(r.config) as { url?: string }).url ?? "") : "";
      const token = r.secret ? decryptSecret(r.secret) : null;
      return { id: r.id, name: r.name, url, token };
    })
    .filter((t) => t.url);
}

export async function getImportSpec(id: string): Promise<ImportSpec | null> {
  await ensureSchema();
  const row = (await db.select().from(connections).where(eq(connections.id, id)))[0];
  if (!row) return null;
  const cfg = row.config
    ? (JSON.parse(row.config) as { url?: string; tables?: string[]; mappings?: Record<string, TableMapping> })
    : {};
  return {
    url: cfg.url ?? "",
    token: row.secret ? decryptSecret(row.secret) : null,
    tables: Array.isArray(cfg.tables) ? cfg.tables : [],
    mappings: cfg.mappings ?? {},
    branch: row.branch,
  };
}
