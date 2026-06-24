import { NextResponse } from "next/server";
import { getBranchToken } from "@/lib/db/branches";
import { validateClaudeToken } from "@/lib/agent/validate-token";

export const runtime = "nodejs";

/** Testa o token Claude salvo de uma branch contra a API da Anthropic. Body: { id }. */
export async function POST(request: Request) {
  const body = await request.json();
  if (!body?.id) return NextResponse.json({ ok: false, error: "id é obrigatório" }, { status: 400 });

  const token = await getBranchToken(body.id);
  if (!token) return NextResponse.json({ ok: false, error: "Sem token salvo nesta branch." });

  const result = await validateClaudeToken(token);
  return NextResponse.json(result);
}
