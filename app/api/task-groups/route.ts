import { NextResponse } from "next/server";
import { getGroupMeta, setGroupOrder, setEmptyGroups, renameGroup, type EmptyGroup } from "@/lib/db/task-groups";

export async function GET() {
  const meta = await getGroupMeta();
  return NextResponse.json(meta);
}

/**
 * Atualiza metainformações dos grupos. Aceita, isolada ou combinadamente:
 *  - { order: string[] }             → ordem personalizada
 *  - { empty: EmptyGroup[] }         → lista de grupos vazios
 *  - { rename: { from, to } }        → renomeia em tasks + ordem + vazios
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));

  if (body?.rename && typeof body.rename.from === "string" && typeof body.rename.to === "string") {
    const to = body.rename.to.trim();
    if (!to) return NextResponse.json({ error: "novo nome vazio" }, { status: 400 });
    const changed = await renameGroup(body.rename.from, to);
    return NextResponse.json({ ok: true, changed });
  }

  if (Array.isArray(body?.order)) {
    await setGroupOrder(body.order.filter((g: unknown) => typeof g === "string"));
  }
  if (Array.isArray(body?.empty)) {
    const empty: EmptyGroup[] = body.empty
      .filter((e: unknown) => e && typeof (e as EmptyGroup).name === "string")
      .map((e: EmptyGroup) => ({ name: e.name, branch: e.branch ?? null }));
    await setEmptyGroups(empty);
  }

  return NextResponse.json({ ok: true });
}
