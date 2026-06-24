import { eq } from "drizzle-orm";
import { db, ensureSchema } from "./index";
import { recurringTasks, type RecurringTask } from "./schema";
import { createTask } from "./tasks";

export type Frequency = "daily" | "weekly" | "monthly";

export interface RecurringDTO {
  id: string;
  branch: string;
  title: string;
  instruction: string | null;
  frequency: Frequency;
  weekdays: string[];
  dayOfMonth: number | null;
  active: boolean;
  lastGenerated: string | null;
  createdAt: number;
}

function toDTO(r: RecurringTask): RecurringDTO {
  return {
    id: r.id,
    branch: r.branch,
    title: r.title,
    instruction: r.instruction,
    frequency: r.frequency as Frequency,
    weekdays: r.weekdays ? (JSON.parse(r.weekdays) as string[]) : [],
    dayOfMonth: r.dayOfMonth,
    active: r.active,
    lastGenerated: r.lastGenerated,
    createdAt: r.createdAt,
  };
}

export async function listRecurring(branch?: string): Promise<RecurringDTO[]> {
  await ensureSchema();
  const rows = branch
    ? await db.select().from(recurringTasks).where(eq(recurringTasks.branch, branch))
    : await db.select().from(recurringTasks);
  return rows.map(toDTO).sort((a, b) => a.createdAt - b.createdAt);
}

export interface UpsertRecurringInput {
  id?: string;
  branch: string;
  title: string;
  instruction?: string | null;
  frequency: Frequency;
  weekdays?: string[];
  dayOfMonth?: number | null;
  active?: boolean;
}

export async function upsertRecurring(input: UpsertRecurringInput): Promise<RecurringDTO> {
  await ensureSchema();
  const weekdays = input.frequency === "weekly" ? JSON.stringify(input.weekdays ?? []) : null;
  const dayOfMonth = input.frequency === "monthly" ? (input.dayOfMonth ?? 1) : null;

  if (input.id) {
    const existing = (await db.select().from(recurringTasks).where(eq(recurringTasks.id, input.id)))[0];
    if (existing) {
      await db.update(recurringTasks).set({
        branch: input.branch,
        title: input.title,
        instruction: input.instruction ?? null,
        frequency: input.frequency,
        weekdays,
        dayOfMonth,
        active: input.active ?? existing.active,
      }).where(eq(recurringTasks.id, input.id));
      const updated = (await db.select().from(recurringTasks).where(eq(recurringTasks.id, input.id)))[0];
      return toDTO(updated);
    }
  }

  const row: RecurringTask = {
    id: crypto.randomUUID(),
    branch: input.branch,
    title: input.title,
    instruction: input.instruction ?? null,
    frequency: input.frequency,
    weekdays,
    dayOfMonth,
    active: input.active ?? true,
    lastGenerated: null,
    createdAt: Date.now(),
  };
  await db.insert(recurringTasks).values(row);
  return toDTO(row);
}

export async function deleteRecurring(id: string): Promise<void> {
  await ensureSchema();
  await db.delete(recurringTasks).where(eq(recurringTasks.id, id));
}

/* ── Materialização ───────────────────────────────────────────── */

const WEEKDAYS = ["dom", "seg", "ter", "qua", "qui", "sex", "sab"];

function todayInfo() {
  const d = new Date();
  const dd = `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
  return { dd, weekday: WEEKDAYS[d.getDay()], dayOfMonth: d.getDate() };
}

function isDueToday(r: RecurringDTO, t: ReturnType<typeof todayInfo>): boolean {
  if (!r.active) return false;
  if (r.frequency === "daily") return true;
  if (r.frequency === "weekly") return r.weekdays.includes(t.weekday);
  if (r.frequency === "monthly") return r.dayOfMonth === t.dayOfMonth;
  return false;
}

/**
 * Gera as tasks das recorrentes que vencem hoje e ainda não foram geradas hoje.
 * Idempotente: usa lastGenerated para não duplicar. Retorna quantas criou.
 */
export async function generateDueTasks(): Promise<number> {
  await ensureSchema();
  const all = (await db.select().from(recurringTasks)).map(toDTO);
  const t = todayInfo();
  let created = 0;

  for (const r of all) {
    if (!isDueToday(r, t)) continue;
    if (r.lastGenerated === t.dd) continue; // já gerou hoje
    await createTask({
      title: r.title,
      branch: r.branch,
      due: t.dd,
      list: t.weekday,
      instruction: r.instruction ?? null,
      sourceRecurring: r.id,
    });
    await db.update(recurringTasks).set({ lastGenerated: t.dd }).where(eq(recurringTasks.id, r.id));
    created++;
  }
  return created;
}
