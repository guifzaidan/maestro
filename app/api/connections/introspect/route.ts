import { NextResponse } from "next/server";
import { getConnectionTarget } from "@/lib/db/connections";
import { introspectTurso } from "@/lib/turso-introspect";

/**
 * Lista as tabelas (colunas + contagem) de um banco Turso externo.
 * Aceita `{ id }` (conexão salva — decifra o token no servidor) ou
 * `{ url, token }` (credenciais ainda não salvas).
 */
export async function POST(request: Request) {
  const body = await request.json();
  let url: string | undefined = typeof body.url === "string" ? body.url : undefined;
  let token: string | null | undefined = typeof body.token === "string" ? body.token : undefined;

  if (body.id) {
    const target = await getConnectionTarget(body.id);
    if (!target) return NextResponse.json({ error: "conexão não encontrada" }, { status: 404 });
    url = target.url;
    // só usa o token salvo se o cliente não mandou um novo
    if (token === undefined) token = target.token;
  }

  if (!url) return NextResponse.json({ error: "url é obrigatória" }, { status: 400 });

  try {
    const tables = await introspectTurso(url, token);
    return NextResponse.json({ tables });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "falha ao conectar no banco";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
