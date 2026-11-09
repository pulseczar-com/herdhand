// Ported from the herdr-firstmate-bearings sidebar mod (MIT, same author): records.js.
// Decides when a task record is fetched. A record is fetched once; it is fetched again only
// when the snapshot entry for its id changes.
import type { TaskRecord } from "./bearings";

/** A record that failed to load is tried again after this long, so a broken Firstmate does not get a call on every open. */
export const RETRY_MS = 5 * 60 * 1000;

/** What the cache keeps for one id: the signature it was fetched for, then the record or the time of the failure. */
export type CachedRecord = { signature: string; record?: TaskRecord; failedAt?: number };

/** Whether the record of an id is missing, was fetched for an older signature, or failed at least RETRY_MS ago. */
export function shouldFetchRecord(entry: CachedRecord | undefined, signature: string, now: number): boolean {
  if (entry?.signature !== signature) return true;
  return entry.failedAt !== undefined && now - entry.failedAt >= RETRY_MS;
}
