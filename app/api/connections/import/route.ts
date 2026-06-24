import { NextResponse } from "next/server";
import { importConnection } from "@/lib/turso-import";
import { BRANCH_IDS } from "@/lib/theme";

/**
 * Importa/sincroniza as tabelas selecionadas de uma conexão Turso como tasks
 * vinculadas. Body: { id, branch }. branch = id da branch destino.
 */
export async function POST(request: Request) {
  const body = await request.json();
  if (!body?.id) return NextResponse.json({ error: "id é obrigatório" }, { status: 400 });
  const branch = typeof body.branch === "string" && body.branch ? body.branch : BRANCH_IDS.pessoal;

  try {
    const result = await importConnection(body.id, branch);
    return NextResponse.json({ result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "falha ao importar";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
