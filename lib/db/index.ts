import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import * as schema from "./schema";
import { WORKSPACES } from "../theme";

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
            id           TEXT PRIMARY KEY,
            name         TEXT NOT NULL,
            short        TEXT NOT NULL,
            icon         TEXT NOT NULL,
            accent       TEXT NOT NULL,
            accent2      TEXT NOT NULL,
            accent_soft  TEXT NOT NULL,
            tagline      TEXT,
            sort         INTEGER NOT NULL DEFAULT 0,
            claude_token TEXT,
            created_at   INTEGER NOT NULL
          )`,
          `CREATE TABLE IF NOT EXISTS tasks (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            branch_id TEXT NOT NULL REFERENCES branches(id),
            list TEXT,
            done INTEGER NOT NULL DEFAULT 0,
            due TEXT,
            tools TEXT,
            instruction TEXT,
            created_at INTEGER NOT NULL
          )`,
          `CREATE TABLE IF NOT EXISTS agent_runs (
            id TEXT PRIMARY KEY,
            branch_id TEXT NOT NULL REFERENCES branches(id),
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
            branch_id TEXT REFERENCES branches(id),
            name TEXT,
            config TEXT,
            secret TEXT,
            connected INTEGER NOT NULL DEFAULT 0,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
          )`,
          `CREATE TABLE IF NOT EXISTS usage (
            id TEXT PRIMARY KEY,
            branch_id TEXT NOT NULL REFERENCES branches(id),
            model TEXT,
            input_tokens INTEGER NOT NULL DEFAULT 0,
            output_tokens INTEGER NOT NULL DEFAULT 0,
            cost_usd REAL NOT NULL DEFAULT 0,
            created_at INTEGER NOT NULL
          )`,
        ],
        "write",
      );

      // Seed dos branches iniciais (UUID fixo via WORKSPACES) — INSERT OR IGNORE
      // para ser idempotente. Fonte única de verdade: lib/theme.ts.
      await client.batch(
        WORKSPACES.map((w, i) => ({
          sql: `INSERT OR IGNORE INTO branches (id, name, short, icon, accent, accent2, accent_soft, tagline, sort, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          args: [w.id, w.name, w.short, w.icon, w.accent, w.accent2, w.accentSoft, w.tagline, i, 1700000000000 + i],
        })),
        "write",
      );

      // Migrações aditivas (SQLite não tem ADD COLUMN IF NOT EXISTS).
      // Cada ALTER roda isolado; falha = coluna já existe, ignora.
      const migrations = [
        "ALTER TABLE tasks ADD COLUMN source_connection TEXT",
        "ALTER TABLE tasks ADD COLUMN source_table TEXT",
        "ALTER TABLE tasks ADD COLUMN source_pk TEXT",
        "ALTER TABLE branches ADD COLUMN claude_token TEXT",
        // Renomeia workspace → branch_id (padroniza a referência à branch).
        "ALTER TABLE tasks RENAME COLUMN workspace TO branch_id",
        "ALTER TABLE connections RENAME COLUMN workspace TO branch_id",
        "ALTER TABLE agent_runs RENAME COLUMN workspace TO branch_id",
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
