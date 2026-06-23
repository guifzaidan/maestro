import { createClient } from "@libsql/client";
import { and, eq } from "drizzle-orm";
import { db, ensureSchema } from "./db/index";
import { tasks, type NewTask } from "./db/schema";
import { getImportSpec } from "./db/connections";

/** Escapa um identificador SQLite para uso entre aspas duplas. */
function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

// ── Normalização de valores externos ──────────────────────────────────────

/** Tenta interpretar qualquer valor como Date (vários formatos comuns). */
function toDate(value: unknown): Date | null {
  if (value == null) return null;
  if (typeof value === "number") {
    const ms = value > 1e12 ? value : value * 1000; // epoch s vs ms
    const d = new Date(ms);
    return isNaN(d.getTime()) ? null : d;
  }
  const s = String(value).trim();
  if (!s) return null;
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/); // dd/mm/yyyy
  if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/); // yyyy-mm-dd[...]
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (/^\d{10}$/.test(s)) return new Date(Number(s) * 1000); // epoch s
  if (/^\d{13}$/.test(s)) return new Date(Number(s)); // epoch ms
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function fmtDate(d: Date): string {
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

/** Converte o valor da coluna de data num `due` no formato dd/mm/yyyy. */
export function normalizeDueDate(value: unknown): string | null {
  const d = toDate(value);
  return d ? fmtDate(d) : null;
}

const DONE_TOKENS = new Set([
  "done", "completed", "complete", "concluido", "concluído", "finished",
  "closed", "resolved", "true", "1", "sim", "yes", "ok", "feito",
]);

/** Interpreta o valor da coluna de status como "concluído" (true) ou não. */
export function isDoneValue(value: unknown): boolean {
  if (value == null) return false;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  return DONE_TOKENS.has(String(value).trim().toLowerCase());
}

const DOW_TO_LIST = ["dom", "seg", "ter", "qua", "qui", "sex", "sab"];

/** Deriva o dia da semana (seg..dom) a partir de um due dd/mm/yyyy. */
function listFromDue(due: string | null): string | null {
  if (!due) return null;
  const m = due.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  return DOW_TO_LIST[d.getDay()] ?? null;
}

// ── Importação / sincronização ────────────────────────────────────────────

export interface ImportResult {
  imported: number;
  updated: number;
  skipped: number;
  tables: { table: string; rows: number; error?: string }[];
}

const ROW_CAP = 1000;

/**
 * Lê as tabelas selecionadas de uma conexão Turso e cria/atualiza tasks
 * vinculadas (por connection+table+pk) no workspace informado. Status é
 * sincronizado a partir da fonte externa (one-way: externo → hub).
 */
export async function importConnection(connectionId: string, workspace: string): Promise<ImportResult> {
  await ensureSchema();
  const spec = await getImportSpec(connectionId);
  if (!spec) throw new Error("conexão não encontrada");
  if (!spec.url) throw new Error("conexão sem url");

  const ext = createClient({ url: spec.url, authToken: spec.token ?? undefined });
  const result: ImportResult = { imported: 0, updated: 0, skipped: 0, tables: [] };

  for (const table of spec.tables) {
    const mapping = spec.mappings[table] ?? {};
    try {
      // PK única declarada → usa-a; senão cai no rowid implícito.
      const info = await ext.execute(`PRAGMA table_info(${quoteIdent(table)})`);
      const pks = info.rows.filter((r) => Number(r.pk) > 0).map((r) => String(r.name));
      const pkExpr = pks.length === 1 ? quoteIdent(pks[0]) : "rowid";

      const res = await ext.execute(`SELECT ${pkExpr} AS __pk, * FROM ${quoteIdent(table)} LIMIT ${ROW_CAP}`);
      let count = 0;

      for (const r of res.rows) {
        const row = r as Record<string, unknown>;
        const pk = row.__pk == null ? null : String(row.__pk);
        if (pk == null) { result.skipped++; continue; }

        const rawTitle = mapping.title ? String(row[mapping.title] ?? "").trim() : "";
        const title = rawTitle || `${table} #${pk}`;
        const due = mapping.date ? normalizeDueDate(row[mapping.date]) : null;
        const done = mapping.status ? isDoneValue(row[mapping.status]) : false;
        const list = listFromDue(due);

        const existing = (await db
          .select()
          .from(tasks)
          .where(and(
            eq(tasks.sourceConnection, connectionId),
            eq(tasks.sourceTable, table),
            eq(tasks.sourcePk, pk),
          )))[0];

        if (existing) {
          await db.update(tasks).set({ title, due, done, list, workspace }).where(eq(tasks.id, existing.id));
          result.updated++;
        } else {
          const newRow: NewTask = {
            id: crypto.randomUUID(),
            title,
            workspace,
            list,
            done,
            due,
            tools: null,
            instruction: null,
            createdAt: Date.now(),
            sourceConnection: connectionId,
            sourceTable: table,
            sourcePk: pk,
          };
          await db.insert(tasks).values(newRow);
          result.imported++;
        }
        count++;
      }
      result.tables.push({ table, rows: count });
    } catch (e) {
      result.tables.push({ table, rows: 0, error: e instanceof Error ? e.message : "falha" });
    }
  }

  return result;
}
