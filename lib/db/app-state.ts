import { eq } from "drizzle-orm";
import { db, ensureSchema } from "./index";
import { appState } from "./schema";

/** Lê um valor do KV `app_state`. Retorna null se a chave não existe. */
export async function getState(key: string): Promise<string | null> {
  await ensureSchema();
  const row = (await db.select().from(appState).where(eq(appState.key, key)))[0];
  return row?.value ?? null;
}

/** Grava (upsert) um valor no KV `app_state`. */
export async function setState(key: string, value: string): Promise<void> {
  await ensureSchema();
  const existing = (await db.select().from(appState).where(eq(appState.key, key)))[0];
  if (existing) {
    await db.update(appState).set({ value, updatedAt: Date.now() }).where(eq(appState.key, key));
  } else {
    await db.insert(appState).values({ key, value, updatedAt: Date.now() });
  }
}
