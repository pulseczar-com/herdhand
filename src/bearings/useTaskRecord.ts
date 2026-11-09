import { useEffect, useState } from "react";

import type { RunCommand } from "@/ssh/bridge";
import { getRecordCommand } from "@/ssh/commands";

import { getRecordSignature, hasTaskRecord, type Row, type SectionId, type TaskRecord } from "./bearings";
import { type CachedRecord, shouldFetchRecord } from "./records";
import { parseTaskRecord } from "./toon";

/**
 * The full task record of an item, from `fm-tasks-axi.sh show --full`. It is fetched when the
 * item opens, once for each version of its row, and kept in `cache` for the session. A secondmate
 * has no record. A failed fetch leaves the snapshot fields alone to show.
 */
export function useTaskRecord(cache: Map<string, CachedRecord>, run: RunCommand, folder: string, sectionId: SectionId, row: Row | undefined) {
  const wantsRecord = row !== undefined && hasTaskRecord(sectionId);
  const signature = row ? getRecordSignature(sectionId, row) : "";
  const itemId = row?.itemId ?? "";
  // Counts the fetches that ended, so the screen renders again with what they cached.
  const [, setFetches] = useState(0);
  const entry = cache.get(itemId);
  const isCurrent = entry?.signature === signature;

  useEffect(() => {
    if (!wantsRecord || !shouldFetchRecord(cache.get(itemId), signature, Date.now())) return;
    let isOpen = true;
    fetchRecord(run, folder, itemId, signature).then((fetched) => {
      cache.set(itemId, fetched);
      if (isOpen) setFetches((count) => count + 1);
    });
    return () => {
      isOpen = false;
    };
  }, [wantsRecord, cache, run, folder, itemId, signature]);

  return {
    // An older record stays on show while the newer one loads.
    record: entry?.record,
    hasFailed: isCurrent && entry.failedAt !== undefined,
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
