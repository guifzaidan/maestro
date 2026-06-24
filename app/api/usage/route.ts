import { NextResponse } from "next/server";
import { getMonthlyUsage, getTotalMonthlyUsage } from "@/lib/db/usage";

export const runtime = "nodejs";

/**
 * Uso REAL do mês: GET /api/usage (todas as branches) ou ?branch=<id>.
 * Retorna apenas o consumido (tokens + custo estimado) — sem saldo/limite,
 * que a API da Anthropic não expõe.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const branch = searchParams.get("branch");
  const { tokensUsed, costUsd } = branch
    ? await getMonthlyUsage(branch)
    : await getTotalMonthlyUsage();
  return NextResponse.json({ tokensUsed, costUsd });
}
