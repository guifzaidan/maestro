import { eq } from "drizzle-orm";
import { db, ensureSchema } from "./index";
import { tasks } from "./schema";
import { getState, setState } from "./app-state";

/** Grupo criado direto na aba Grupos, ainda sem task associada.
    `branch: null` = criado no escopo "todas as branches" (visível sempre). */
export interface EmptyGroup {
  name: string;
  branch: string | null;
}

const ORDER_KEY = "group-order";
const EMPTY_KEY = "empty-groups";

/** Metainformações dos grupos: ordem personalizada + grupos vazios. */
export async function getGroupMeta(): Promise<{ order: string[]; empty: EmptyGroup[] }> {
  await ensureSchema();
  const [orderRaw, emptyRaw] = await Promise.all([getState(ORDER_KEY), getState(EMPTY_KEY)]);
  const order = safeParse<string[]>(orderRaw, []);
  const empty = safeParse<EmptyGroup[]>(emptyRaw, []);
  return { order, empty };
}

export async function setGroupOrder(order: string[]): Promise<void> {
  await setState(ORDER_KEY, JSON.stringify(order));
}

export async function setEmptyGroups(empty: EmptyGroup[]): Promise<void> {
  await setState(EMPTY_KEY, JSON.stringify(empty));
}

/**
 * Renomeia um grupo em todo lugar: memberships das tasks, ordem e grupos vazios.
 * Retorna os ids das tasks que mudaram (o front reconcilia o estado local).
 */
export async function renameGroup(from: string, to: string): Promise<string[]> {
  await ensureSchema();
  const changed: string[] = [];
  const all = await db.select().from(tasks);
  for (const t of all) {
    if (!t.groups) continue;
    const arr = safeParse<string[]>(t.groups, []);
    if (!arr.includes(from)) continue;
    const next = arr.map((g) => (g === from ? to : g));
    await db.update(tasks).set({ groups: JSON.stringify(next) }).where(eq(tasks.id, t.id));
    changed.push(t.id);
  }

  const { order, empty } = await getGroupMeta();
  await setGroupOrder(order.map((g) => (g === from ? to : g)));
  await setEmptyGroups(empty.map((e) => (e.name === from ? { ...e, name: to } : e)));
  return changed;
}

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try { return JSON.parse(raw) as T; } catch { return fallback; }
}
