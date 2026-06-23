import { NextResponse } from "next/server";
import { importConnection } from "@/lib/turso-import";

/**
 * Importa/sincroniza as tabelas selecionadas de uma conexão Turso como tasks
 * vinculadas. Body: { id, workspace }. workspace = branch destino (dux|sheep|pessoal).
 */
export async function POST(request: Request) {
  const body = await request.json();
  if (!body?.id) return NextResponse.json({ error: "id é obrigatório" }, { status: 400 });
  const workspace = typeof body.workspace === "string" && body.workspace ? body.workspace : "pessoal";

  try {
    const result = await importConnection(body.id, workspace);
    return NextResponse.json({ result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "falha ao importar";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
