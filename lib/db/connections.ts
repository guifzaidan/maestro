import { eq } from "drizzle-orm";
import { db, ensureSchema } from "./index";
import { connections, type Connection } from "./schema";
import { encryptSecret, decryptSecret } from "../crypto";

/** Forma segura enviada ao cliente — nunca inclui o segredo em claro. */
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

function toDTO(row: Connection): ConnectionDTO {
  return {
    id: row.id,
    connector: row.connector,
    workspace: row.workspace,
    name: row.name,
    config: row.config ? (JSON.parse(row.config) as Record<string, unknown>) : null,
    connected: row.connected,
    hasSecret: !!row.secret,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function listConnections(): Promise<ConnectionDTO[]> {
  await ensureSchema();
  const rows = await db.select().from(connections);
  return rows.map(toDTO);
}

export interface UpsertConnectionInput {
  id?: string;
  connector: string;
  workspace?: string | null;
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
    if (input.workspace !== undefined) fields.workspace = input.workspace;
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
    workspace: input.workspace ?? null,
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
