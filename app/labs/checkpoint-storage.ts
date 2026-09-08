export const checkpointPrefix = "reconlab.understanding.v2:";
export const legacyCheckpointKey = "reconlab.understanding.v1";
type CheckpointStorage = Pick<Storage, "getItem" | "setItem" | "key" | "length">;

export function readCheckpoints(storage: CheckpointStorage): Record<string, boolean> {
  let legacy: unknown;
  try { legacy = JSON.parse(storage.getItem(legacyCheckpointKey) ?? "{}"); }
  catch { legacy = {}; } // A damaged old snapshot must not hide valid v2 results.
  const entries: [string, boolean][] = legacy && typeof legacy === "object" && !Array.isArray(legacy)
    ? Object.entries(legacy).filter(([, value]) => value === true).map(([key]) => [key, true]) : [];
  for (let index = 0; index < storage.length; index++) {
    const key = storage.key(index);
    if (key?.startsWith(checkpointPrefix) && storage.getItem(key) === "true") {
      entries.push([key.slice(checkpointPrefix.length), true]);
    }
  }
  return Object.fromEntries(entries);
}

export function saveCheckpoint(storage: CheckpointStorage, key: string) {
  // Independent keys make simultaneous passes additive, not last-writer-wins.
  storage.setItem(`${checkpointPrefix}${key}`, "true");
}
