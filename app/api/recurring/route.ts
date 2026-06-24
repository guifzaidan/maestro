import { NextResponse } from "next/server";
import { listRecurring, upsertRecurring, deleteRecurring, type Frequency } from "@/lib/db/recurring";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const branch = searchParams.get("branch") ?? undefined;
  const items = await listRecurring(branch);
  return NextResponse.json({ recurring: items });
}

export async function POST(request: Request) {
  const body = await request.json();
  if (!body?.title || !body?.branch || !body?.frequency) {
    return NextResponse.json({ error: "title, branch e frequency são obrigatórios" }, { status: 400 });
  }
  try {
    const item = await upsertRecurring({
      id: typeof body.id === "string" ? body.id : undefined,
      branch: body.branch,
      title: body.title,
      instruction: body.instruction ?? null,
      frequency: body.frequency as Frequency,
      weekdays: Array.isArray(body.weekdays) ? body.weekdays : [],
      dayOfMonth: typeof body.dayOfMonth === "number" ? body.dayOfMonth : null,
      active: typeof body.active === "boolean" ? body.active : undefined,
    });
    return NextResponse.json({ recurring: item });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "erro ao salvar recorrente";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const body = await request.json();
  if (!body?.id) return NextResponse.json({ error: "id é obrigatório" }, { status: 400 });
  await deleteRecurring(body.id);
  return NextResponse.json({ ok: true });
}
