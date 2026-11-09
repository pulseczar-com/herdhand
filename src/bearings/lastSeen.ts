import type { Section } from "./bearings";
import type { CachedRecord } from "./records";

/** What the app last read from one Firstmate home. */
export type LastSeen = {
  /** All six sections of the last good snapshot, or null before the first one. */
  sections: Section[] | null;
  /** When that snapshot arrived, in milliseconds since 1970. */
  updatedAt: number | null;
  /** The task records fetched so far, by section and item id. */
  records: Map<string, CachedRecord>;
};

// Kept in memory for the app session, so Bearings opens on its last data at once while the
// refresh runs. Nothing goes to disk: the data belongs to the machine.
const seen = new Map<string, LastSeen>();

/** The last data of a Firstmate home on a machine. An empty record when none was read yet. */
export function getLastSeen(machineId: string, folder: string): LastSeen {
  const key = `${machineId}\n${folder}`;
  let entry = seen.get(key);
  if (!entry) {
    entry = { sections: null, updatedAt: null, records: new Map() };
    seen.set(key, entry);
  }
  return entry;
}

/** Forgets all of it. For tests. */
export function resetLastSeen() {
  seen.clear();
}
