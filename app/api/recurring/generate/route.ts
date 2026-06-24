import { NextResponse } from "next/server";
import { generateDueTasks } from "@/lib/db/recurring";

export const runtime = "nodejs";

/** Materializa as tasks das recorrentes que vencem hoje (idempotente). */
export async function POST() {
  const created = await generateDueTasks();
  return NextResponse.json({ created });
}
