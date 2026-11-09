import { useEffect, useState } from "react";

import type { RunCommand } from "@/ssh/bridge";
import { getRecordCommand } from "@/ssh/commands";

import { getRecordSignature, hasTaskRecord, type Row, type SectionId, type TaskRecord } from "./bearings";
import { type CachedRecord, shouldFetchRecord } from "./records";
import { parseTaskRecord } from "./toon";

type RecordSource = { recordCache: Map<string, CachedRecord>; run: RunCommand; folder: string };

/**
 * The full task record of an item, from `fm-tasks-axi.sh show --full`. It is fetched when the
 * item opens, once for each version of its row, and kept in `cache` for the session. A secondmate
 * has no record. A failed fetch keeps the record it had, or else leaves the snapshot fields alone to show.
 */
export function useTaskRecord({ recordCache: cache, run, folder }: RecordSource, sectionId: SectionId, row: Row | undefined) {
  const wantsRecord = row !== undefined && hasTaskRecord(sectionId);
  const signature = row ? getRecordSignature(sectionId, row) : "";
  const itemId = row?.itemId ?? "";
  // The same item can be in two sections, each with its own signature.
  const cacheKey = `${sectionId}\n${itemId}`;
  // Counts the fetches that ended, so the screen renders again with what they cached.
  const [, setFetches] = useState(0);
  const entry = cache.get(cacheKey);
  const isCurrent = entry?.signature === signature;

  useEffect(() => {
    if (!wantsRecord || !shouldFetchRecord(cache.get(cacheKey), signature, Date.now())) return;
    let isOpen = true;
    fetchRecord(run, folder, itemId, signature).then((fetched) => {
      cache.set(cacheKey, { ...fetched, record: fetched.record ?? cache.get(cacheKey)?.record });
      if (isOpen) setFetches((count) => count + 1);
    });
    return () => {
      isOpen = false;
    };
  }, [wantsRecord, cache, run, folder, itemId, cacheKey, signature]);

  return {
    // An older record stays on show while the newer one loads.
    record: entry?.record,
    hasFailed: isCurrent && entry.failedAt !== undefined && entry.record === undefined,
  };
}

async function fetchRecord(run: RunCommand, folder: string, itemId: string, signature: string): Promise<CachedRecord> {
  try {
    const { output, exitCode } = await run(getRecordCommand(folder, itemId));
    if (exitCode !== 0) return { signature, failedAt: Date.now() };
    return { signature, record: parseTaskRecord(output) as TaskRecord };
  } catch {
    return { signature, failedAt: Date.now() };
  }
}
