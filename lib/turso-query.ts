import { createClient } from "@libsql/client";

export interface QueryResult {
  columns: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
  truncated: boolean;
}

const MAX_ROWS = 500;

/** Statements de escrita/DDL bloqueados — a consulta do agente é read-only. */
const FORBIDDEN = /\b(insert|update|delete|drop|alter|create|replace|attach|detach|reindex|vacuum|pragma|begin|commit|rollback)\b/i;

/**
 * Roda uma consulta SELECT read-only num banco Turso/libSQL externo.
 * Recusa qualquer statement que não seja uma única leitura (SELECT/WITH).
 * Limita o resultado a MAX_ROWS. Server-side apenas.
 */
export async function queryTurso(
  url: string,
  token: string | null | undefined,
  sql: string,
): Promise<QueryResult> {
  const trimmed = sql.trim().replace(/;+\s*$/, ""); // remove ; final
  if (!trimmed) throw new Error("SQL vazio.");
  if (trimmed.includes(";")) throw new Error("Apenas um statement por consulta (sem ';').");
  if (!/^(select|with)\b/i.test(trimmed)) throw new Error("Só consultas SELECT/WITH são permitidas (read-only).");
  if (FORBIDDEN.test(trimmed)) throw new Error("Consulta contém comando de escrita/DDL — bloqueado (read-only).");

  const client = createClient({ url, authToken: token ?? undefined });
  const res = await client.execute(trimmed);
  const all = res.rows as unknown as Record<string, unknown>[];
  const truncated = all.length > MAX_ROWS;
  const rows = truncated ? all.slice(0, MAX_ROWS) : all;
  return {
    columns: res.columns ?? (rows[0] ? Object.keys(rows[0]) : []),
    rows,
    rowCount: rows.length,
    truncated,
  };
}
