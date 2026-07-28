"use client";

export interface EmptyGroup {
  name: string;
  branch: string | null;
}

export interface GroupMeta {
  order: string[];
  empty: EmptyGroup[];
}

export async function fetchGroupMeta(): Promise<GroupMeta> {
  try {
    const res = await fetch("/api/task-groups");
    const data = await res.json().catch(() => ({}));
    return { order: data.order ?? [], empty: data.empty ?? [] };
  } catch {
    return { order: [], empty: [] };
  }
}

export function saveGroupOrder(order: string[]): void {
  void fetch("/api/task-groups", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ order }),
  }).catch(() => {});
}

export function saveEmptyGroups(empty: EmptyGroup[]): void {
  void fetch("/api/task-groups", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ empty }),
  }).catch(() => {});
}

export function renameGroupRemote(from: string, to: string): void {
  void fetch("/api/task-groups", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ rename: { from, to } }),
  }).catch(() => {});
}
