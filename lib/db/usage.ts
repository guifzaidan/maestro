import { and, eq, gte, sql } from "drizzle-orm";
import { db, ensureSchema } from "./index";
import { usage } from "./schema";

/**
 * Preço por milhão de tokens (USD) por modelo — input / output. Estimativa
 * baseada na tabela pública da Anthropic; o custo exibido é derivado dos
 * tokens reais consumidos, não da fatura exata.
 */
const PRICING: Record<string, { in: number; out: number }> = {
  "claude-opus-4-8":   { in: 15, out: 75 },
  "claude-sonnet-4-6": { in: 3,  out: 15 },
  "claude-haiku-4-5":  { in: 1,  out: 5  },
};
const DEFAULT_PRICING = { in: 3, out: 15 };

/** Custo estimado (USD) de uma chamada, pelos tokens e pelo modelo. */
export function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  const p = PRICING[model] ?? DEFAULT_PRICING;
  return (inputTokens / 1_000_000) * p.in + (outputTokens / 1_000_000) * p.out;
}

export interface RecordUsageInput {
  branch: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
}

/** Registra o consumo de uma chamada do agente. */
export async function recordUsage(input: RecordUsageInput): Promise<void> {
  if (!input.branch) return;
  const input_t = Math.max(0, Math.round(input.inputTokens || 0));
  const output_t = Math.max(0, Math.round(input.outputTokens || 0));
  if (input_t === 0 && output_t === 0) return;
  await ensureSchema();
  await db.insert(usage).values({
    id: crypto.randomUUID(),
    branch: input.branch,
    model: input.model,
    inputTokens: input_t,
    outputTokens: output_t,
    costUsd: estimateCost(input.model, input_t, output_t),
    createdAt: Date.now(),
  });
}

export interface MonthlyUsage {
  tokensUsed: number;
  costUsd: number;
}

/** Início do mês corrente (epoch ms), em horário local do servidor. */
function startOfMonth(): number {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
}

/** Soma tokens e custo do mês corrente para uma branch. */
export async function getMonthlyUsage(branch: string): Promise<MonthlyUsage> {
  await ensureSchema();
  const since = startOfMonth();
  const rows = await db
    .select({
      tokens: sql<number>`COALESCE(SUM(${usage.inputTokens} + ${usage.outputTokens}), 0)`,
      cost: sql<number>`COALESCE(SUM(${usage.costUsd}), 0)`,
    })
    .from(usage)
    .where(and(eq(usage.branch, branch), gte(usage.createdAt, since)));
  const row = rows[0];
  return { tokensUsed: Number(row?.tokens ?? 0), costUsd: Number(row?.cost ?? 0) };
}

/** Soma tokens e custo do mês corrente de TODAS as branches (consumo global). */
export async function getTotalMonthlyUsage(): Promise<MonthlyUsage> {
  await ensureSchema();
  const since = startOfMonth();
  const rows = await db
    .select({
      tokens: sql<number>`COALESCE(SUM(${usage.inputTokens} + ${usage.outputTokens}), 0)`,
      cost: sql<number>`COALESCE(SUM(${usage.costUsd}), 0)`,
    })
    .from(usage)
    .where(gte(usage.createdAt, since));
  const row = rows[0];
  return { tokensUsed: Number(row?.tokens ?? 0), costUsd: Number(row?.cost ?? 0) };
}
