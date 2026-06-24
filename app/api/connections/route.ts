import { NextResponse } from "next/server";
import { listConnections, upsertConnection, deleteConnection } from "@/lib/db/connections";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const branch = searchParams.get("branch") ?? undefined;
  const all = await listConnections(branch);
  return NextResponse.json({ connections: all });
}

export async function POST(request: Request) {
  const body = await request.json();
  if (!body?.connector || typeof body.connector !== "string") {
    return NextResponse.json({ error: "connector é obrigatório" }, { status: 400 });
  }
  try {
    const connection = await upsertConnection({
      id: typeof body.id === "string" ? body.id : undefined,
      connector: body.connector,
      branch: body.branch ?? null,
      name: body.name ?? null,
      config: body.config ?? null,
      secret: typeof body.secret === "string" ? body.secret : undefined,
      connected: typeof body.connected === "boolean" ? body.connected : undefined,
    });
    return NextResponse.json({ connection });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "erro ao salvar conexão";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const body = await request.json();
  if (!body?.id) {
    return NextResponse.json({ error: "id é obrigatório" }, { status: 400 });
  }
  await deleteConnection(body.id);
  return NextResponse.json({ ok: true });
}
