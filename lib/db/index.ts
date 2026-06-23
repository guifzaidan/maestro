import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import * as schema from "./schema";

/**
 * Cliente libSQL. Local agora (arquivo SQLite), Turso depois — basta apontar
 * DATABASE_URL para `libsql://...` e setar DATABASE_AUTH_TOKEN. Nenhum código
 * de query muda na migração.
 */
const url = process.env.DATABASE_URL ?? "file:local.db";
const authToken = process.env.DATABASE_AUTH_TOKEN;

export const client = createClient({ url, authToken });
export const db = drizzle(client, { schema });

let schemaReady: Promise<unknown> | null = null;

/** Cria as tabelas na primeira chamada (idempotente). Roda local e no Turso. */
export function ensureSchema() {
  if (!schemaReady) {
    schemaReady = (async () => {
      await client.batch(
        [
          `CREATE TABLE IF NOT EXISTS tasks (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            workspace TEXT NOT NULL,
            list TEXT,
            done INTEGER NOT NULL DEFAULT 0,
            due TEXT,
            tools TEXT,
            instruction TEXT,
            created_at INTEGER NOT NULL
          )`,
          `CREATE TABLE IF NOT EXISTS agent_runs (
            id TEXT PRIMARY KEY,
            workspace TEXT NOT NULL,
            status TEXT NOT NULL,
            created_at INTEGER NOT NULL
          )`,
          `CREATE TABLE IF NOT EXISTS messages (
            id TEXT PRIMARY KEY,
            run_id TEXT NOT NULL,
            role TEXT NOT NULL,
            content TEXT NOT NULL,
            created_at INTEGER NOT NULL
          )`,
          `CREATE TABLE IF NOT EXISTS connections (
            id TEXT PRIMARY KEY,
            connector TEXT NOT NULL,
            workspace TEXT,
            name TEXT,
            config TEXT,
            secret TEXT,
            connected INTEGER NOT NULL DEFAULT 0,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
          )`,
        ],
        "write",
      );

      // Migrações aditivas (SQLite não tem ADD COLUMN IF NOT EXISTS).
      // Cada ALTER roda isolado; falha = coluna já existe, ignora.
      const migrations = [
        "ALTER TABLE tasks ADD COLUMN source_connection TEXT",
        "ALTER TABLE tasks ADD COLUMN source_table TEXT",
        "ALTER TABLE tasks ADD COLUMN source_pk TEXT",
      ];
      for (const stmt of migrations) {
        try {
          await client.execute(stmt);
        } catch {
          /* coluna já existe */
        }
      }
    })();
  }
  return schemaReady;
}
