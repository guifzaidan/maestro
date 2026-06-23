import { createClient } from "@libsql/client";

export interface TableColumn {
  name: string;
  type: string;
  pk: boolean;
}

export interface TableInfo {
  name: string;
  columns: TableColumn[];
  rowCount: number | null;
}

/** Escapa um identificador SQLite para uso entre aspas duplas. */
function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

/**
 * Conecta num banco Turso/libSQL externo e lista as tabelas do usuário com
 * suas colunas (nome, tipo, se é PK) e contagem de linhas. Server-side apenas.
 */
export async function introspectTurso(url: string, token: string | null | undefined): Promise<TableInfo[]> {
  const client = createClient({ url, authToken: token ?? undefined });
  const tablesRes = await client.execute(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '\\_%' ESCAPE '\\' ORDER BY name",
  );

  const tables: TableInfo[] = [];
  for (const row of tablesRes.rows) {
    const name = String(row.name);
    const colsRes = await client.execute(`PRAGMA table_info(${quoteIdent(name)})`);
    const columns: TableColumn[] = colsRes.rows.map((c) => ({
      name: String(c.name),
      type: String(c.type ?? ""),
      pk: Number(c.pk) > 0,
    }));
    let rowCount: number | null = null;
    try {
      const cnt = await client.execute(`SELECT count(*) AS n FROM ${quoteIdent(name)}`);
      rowCount = Number(cnt.rows[0]?.n ?? 0);
    } catch {
      rowCount = null;
    }
    tables.push({ name, columns, rowCount });
  }
  return tables;
}
