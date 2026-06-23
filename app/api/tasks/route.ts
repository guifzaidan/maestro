import { NextResponse } from "next/server";
import { listTasks, createTask, toggleTask, updateTask, deleteTask } from "@/lib/db/tasks";

export async function GET() {
  const all = await listTasks();
  return NextResponse.json({ tasks: all });
}

export async function POST(request: Request) {
  const body = await request.json();
  if (!body?.title || !body?.workspace) {
    return NextResponse.json({ error: "title e workspace são obrigatórios" }, { status: 400 });
  }
  const task = await createTask({
    title: body.title,
    workspace: body.workspace,
    list: body.list ?? null,
    due: body.due ?? null,
    tools: body.tools ?? null,
    instruction: body.instruction ?? null,
  });
  return NextResponse.json({ task }, { status: 201 });
}

export async function PATCH(request: Request) {
  const body = await request.json();
  if (!body?.id) {
    return NextResponse.json({ error: "id é obrigatório" }, { status: 400 });
  }
  if (typeof body.done === "boolean") {
    await toggleTask(body.id, body.done);
  } else {
    const fields: { title?: string; due?: string | null; instruction?: string | null; workspace?: string } = {};
    if (typeof body.title === "string" && body.title.trim()) fields.title = body.title.trim();
    if ("due" in body) fields.due = body.due ?? null;
    if ("instruction" in body) fields.instruction = body.instruction ?? null;
    if (typeof body.workspace === "string" && body.workspace.trim()) fields.workspace = body.workspace.trim();
    if (Object.keys(fields).length === 0)
      return NextResponse.json({ error: "nenhum campo para atualizar" }, { status: 400 });
    await updateTask(body.id, fields);
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const body = await request.json();
  if (!body?.id) {
    return NextResponse.json({ error: "id é obrigatório" }, { status: 400 });
  }
  await deleteTask(body.id);
  return NextResponse.json({ ok: true });
}
