import { NextResponse } from "next/server";
import { getMonthlyUsage } from "@/lib/db/usage";

export const runtime = "nodejs";

// Orçamentos/limites exibidos (alvos visuais). Reais são tokensUsed/costUsd.
const TOKEN_LIMIT = 5_000_000;
const CREDIT_LIMIT = 50;

/** Uso REAL do mês de uma branch: GET /api/branches/usage?branch=<id>. */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const branch = searchParams.get("branch");
  if (!branch) return NextResponse.json({ error: "branch é obrigatório" }, { status: 400 });

  const { tokensUsed, costUsd } = await getMonthlyUsage(branch);
  return NextResponse.json({
    tokensUsed,
    tokensLimit: TOKEN_LIMIT,
    costUsd,
    creditsUsd: CREDIT_LIMIT,
  });
}
