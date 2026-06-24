import { eq, desc } from "drizzle-orm";
import { db, ensureSchema } from "./index";
import { tasks, type Task, type NewTask } from "./schema";

export interface CreateTaskInput {
  title: string;
  branch: string;
  list?: string | null;
  due?: string | null;
  tools?: string[] | null;
  instruction?: string | null;
}

export async function listTasks(): Promise<Task[]> {
  await ensureSchema();
  return db.select().from(tasks).orderBy(desc(tasks.createdAt));
}

export async function createTask(input: CreateTaskInput): Promise<Task> {
  await ensureSchema();
  const row: NewTask = {
    id: crypto.randomUUID(),
    title: input.title,
    branch: input.branch,
    list: input.list ?? null,
    done: false,
    due: input.due ?? null,
    tools: input.tools ? JSON.stringify(input.tools) : null,
    instruction: input.instruction ?? null,
    createdAt: Date.now(),
  };
  await db.insert(tasks).values(row);
  return row as Task;
}

export async function toggleTask(id: string, done: boolean): Promise<void> {
  await ensureSchema();
  await db.update(tasks).set({ done }).where(eq(tasks.id, id));
}

export async function updateTask(
  id: string,
  fields: { title?: string; due?: string | null; instruction?: string | null; branch?: string },
): Promise<void> {
  await ensureSchema();
  await db.update(tasks).set(fields).where(eq(tasks.id, id));
}

export async function deleteTask(id: string): Promise<void> {
  await ensureSchema();
  await db.delete(tasks).where(eq(tasks.id, id));
}
