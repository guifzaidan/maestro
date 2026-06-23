import { eq } from "drizzle-orm";
import { db, ensureSchema } from "./index";
import { branches, type Branch } from "./schema";

export type BranchDTO = Branch;

function toDTO(row: Branch): BranchDTO {
  return { ...row };
}

export async function listBranches(): Promise<BranchDTO[]> {
  await ensureSchema();
  const rows = await db.select().from(branches).orderBy(branches.sort);
  return rows.map(toDTO);
}

export interface UpsertBranchInput {
  id: string;
  name: string;
  short: string;
  icon: string;
  accent: string;
  accent2: string;
  accentSoft: string;
  tagline?: string | null;
  sort?: number;
}

export async function upsertBranch(input: UpsertBranchInput): Promise<BranchDTO> {
  await ensureSchema();
  const now = Date.now();
  const existing = (await db.select().from(branches).where(eq(branches.id, input.id)))[0];

  if (existing) {
    await db.update(branches).set({
      name:       input.name,
      short:      input.short,
      icon:       input.icon,
      accent:     input.accent,
      accent2:    input.accent2,
      accentSoft: input.accentSoft,
      tagline:    input.tagline ?? existing.tagline,
      sort:       input.sort ?? existing.sort,
    }).where(eq(branches.id, input.id));
    const updated = (await db.select().from(branches).where(eq(branches.id, input.id)))[0];
    return toDTO(updated);
  }

  const row: Branch = {
    id:         input.id,
    name:       input.name,
    short:      input.short,
    icon:       input.icon,
    accent:     input.accent,
    accent2:    input.accent2,
    accentSoft: input.accentSoft,
    tagline:    input.tagline ?? null,
    sort:       input.sort ?? 0,
    createdAt:  now,
  };
  await db.insert(branches).values(row);
  return toDTO(row);
}

export async function deleteBranch(id: string): Promise<void> {
  await ensureSchema();
  await db.delete(branches).where(eq(branches.id, id));
}
