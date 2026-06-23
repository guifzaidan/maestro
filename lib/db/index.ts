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
          // Branches — fonte de verdade para contextos/workspaces.
          `CREATE TABLE IF NOT EXISTS branches (
            id          TEXT PRIMARY KEY,
            name        TEXT NOT NULL,
            short       TEXT NOT NULL,
            icon        TEXT NOT NULL,
            accent      TEXT NOT NULL,
            accent2     TEXT NOT NULL,
            accent_soft TEXT NOT NULL,
            tagline     TEXT,
            sort        INTEGER NOT NULL DEFAULT 0,
            created_at  INTEGER NOT NULL
          )`,
          `CREATE TABLE IF NOT EXISTS tasks (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            workspace TEXT NOT NULL REFERENCES branches(id),
            list TEXT,
            done INTEGER NOT NULL DEFAULT 0,
            due TEXT,
            tools TEXT,
            instruction TEXT,
            created_at INTEGER NOT NULL
          )`,
          `CREATE TABLE IF NOT EXISTS agent_runs (
            id TEXT PRIMARY KEY,
            workspace TEXT NOT NULL REFERENCES branches(id),
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
            workspace TEXT REFERENCES branches(id),
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

      // Seed dos 3 branches iniciais — INSERT OR IGNORE para ser idempotente.
      await client.batch(
        [
          `INSERT OR IGNORE INTO branches (id, name, short, icon, accent, accent2, accent_soft, tagline, sort, created_at)
           VALUES ('dux', 'DUX', 'DX', 'Circle', '#f59e0b', '#f97316', 'rgba(245, 158, 11, 0.18)', 'Token Claude · DUX', 0, 1700000000000)`,
          `INSERT OR IGNORE INTO branches (id, name, short, icon, accent, accent2, accent_soft, tagline, sort, created_at)
           VALUES ('sheep', 'Sheep Tech', 'ST', 'X', '#10b981', '#22d3ee', 'rgba(16, 185, 129, 0.18)', 'Token Claude · Sheep', 1, 1700000000001)`,
          `INSERT OR IGNORE INTO branches (id, name, short, icon, accent, accent2, accent_soft, tagline, sort, created_at)
           VALUES ('pessoal', 'Pessoal', 'P', 'Triangle', '#3b82f6', '#06b6d4', 'rgba(59, 130, 246, 0.18)', 'Token do orquestrador', 2, 1700000000002)`,
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
