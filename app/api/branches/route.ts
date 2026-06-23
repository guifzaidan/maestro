import { NextResponse } from "next/server";
import { listBranches, upsertBranch, deleteBranch } from "@/lib/db/branches";

export async function GET() {
  const all = await listBranches();
  return NextResponse.json({ branches: all });
}

export async function POST(request: Request) {
  const body = await request.json();
  if (!body?.id || !body?.name) {
    return NextResponse.json({ error: "id e name são obrigatórios" }, { status: 400 });
  }
  try {
    const branch = await upsertBranch({
      id:         body.id,
      name:       body.name,
      short:      body.short ?? body.id.slice(0, 2).toUpperCase(),
      icon:       body.icon ?? "Circle",
      accent:     body.accent ?? "#6366f1",
      accent2:    body.accent2 ?? "#3b82f6",
      accentSoft: body.accentSoft ?? "rgba(99, 102, 241, 0.18)",
      tagline:    body.tagline ?? null,
      sort:       body.sort ?? 99,
    });
    return NextResponse.json({ branch });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "erro ao salvar branch";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const body = await request.json();
  if (!body?.id) {
    return NextResponse.json({ error: "id é obrigatório" }, { status: 400 });
  }
  await deleteBranch(body.id);
  return NextResponse.json({ ok: true });
}
