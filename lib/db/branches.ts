import { eq } from "drizzle-orm";
import { db, ensureSchema } from "./index";
import { branches, type Branch } from "./schema";
import { encryptSecret, decryptSecret } from "../crypto";

/**
 * DTO de branch exposto ao cliente. NUNCA inclui o token em claro — apenas
 * `hasToken` indicando se já existe um token salvo para a branch.
 */
export type BranchDTO = Omit<Branch, "claudeToken"> & { hasToken: boolean };

function toDTO(row: Branch): BranchDTO {
  const { claudeToken, ...rest } = row;
  return { ...rest, hasToken: !!claudeToken };
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
  /**
   * Token Claude da branch. `undefined` = não mexe (preserva o existente).
   * String vazia = remove o token. String não-vazia = cifra e salva.
   */
  claudeToken?: string | null;
}

/** Resolve o valor de `claude_token` a persistir, dado o input e o existente. */
function resolveToken(input: UpsertBranchInput, existing?: Branch): string | null {
  if (input.claudeToken === undefined) return existing?.claudeToken ?? null;
  if (input.claudeToken === null || input.claudeToken === "") return null;
  return encryptSecret(input.claudeToken);
}

export async function upsertBranch(input: UpsertBranchInput): Promise<BranchDTO> {
  await ensureSchema();
  const now = Date.now();
  const existing = (await db.select().from(branches).where(eq(branches.id, input.id)))[0];
  const claudeToken = resolveToken(input, existing);

  if (existing) {
    await db.update(branches).set({
      name:        input.name,
      short:       input.short,
      icon:        input.icon,
      accent:      input.accent,
      accent2:     input.accent2,
      accentSoft:  input.accentSoft,
      tagline:     input.tagline ?? existing.tagline,
      sort:        input.sort ?? existing.sort,
      claudeToken,
    }).where(eq(branches.id, input.id));
    const updated = (await db.select().from(branches).where(eq(branches.id, input.id)))[0];
    return toDTO(updated);
  }

  const row: Branch = {
    id:          input.id,
    name:        input.name,
    short:       input.short,
    icon:        input.icon,
    accent:      input.accent,
    accent2:     input.accent2,
    accentSoft:  input.accentSoft,
    tagline:     input.tagline ?? null,
    sort:        input.sort ?? 0,
    claudeToken,
    createdAt:   now,
  };
  await db.insert(branches).values(row);
  return toDTO(row);
}

export async function deleteBranch(id: string): Promise<void> {
  await ensureSchema();
  await db.delete(branches).where(eq(branches.id, id));
}

/**
 * Retorna o token Claude DECIFRADO de uma branch — uso server-side apenas
 * (ex: agente fazendo chamadas à API Claude). null se não houver token.
 */
export async function getBranchToken(id: string): Promise<string | null> {
  await ensureSchema();
  const row = (await db.select().from(branches).where(eq(branches.id, id)))[0];
  if (!row?.claudeToken) return null;
  return decryptSecret(row.claudeToken);
}
