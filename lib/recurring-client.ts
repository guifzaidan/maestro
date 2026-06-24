"use client";

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

export interface SaveRecurringInput {
  id?: string;
  branch: string;
  title: string;
  instruction?: string | null;
  frequency: Frequency;
  weekdays?: string[];
  dayOfMonth?: number | null;
  active?: boolean;
}

export async function fetchRecurring(branch?: string): Promise<RecurringDTO[]> {
  const url = branch ? `/api/recurring?branch=${encodeURIComponent(branch)}` : "/api/recurring";
  const res = await fetch(url);
  const data = await res.json().catch(() => ({}));
  return data.recurring ?? [];
}

export async function saveRecurring(input: SaveRecurringInput): Promise<RecurringDTO> {
  const res = await fetch("/api/recurring", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.recurring) throw new Error(data.error || `Falha ao salvar (HTTP ${res.status})`);
  return data.recurring;
}

export async function removeRecurring(id: string): Promise<void> {
  await fetch("/api/recurring", {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id }),
  });
}

/** Materializa as tasks recorrentes vencidas hoje. Retorna quantas criou. */
export async function generateRecurring(): Promise<number> {
  try {
    const res = await fetch("/api/recurring/generate", { method: "POST" });
    const data = await res.json().catch(() => ({}));
    return data.created ?? 0;
  } catch {
    return 0;
  }
}
