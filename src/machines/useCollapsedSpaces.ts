import { useEffect, useMemo, useState } from "react";

import type { Space } from "@/herdr/backend";

import { getCollapsedSpaceIds, keepExistingSpaceIds, saveCollapsedSpaceIds, toggleSpaceId } from "./collapsedSpaces";

/**
 * The machine's collapsed spaces, remembered on the phone. When the list loads, spaces that
 * no longer exist are forgotten. Until the stored ids are read, every space shows expanded.
 */
export function useCollapsedSpaces(machineId: string, spaces: Space[] | null) {
  // null until the stored ids are read, so the list never prunes or saves over them.
  const [collapsedIds, setCollapsedIds] = useState<string[] | null>(null);

  useEffect(() => {
    let isOpen = true;
    void getCollapsedSpaceIds(machineId).then((ids) => {
      if (isOpen) setCollapsedIds(ids);
    });
    return () => {
      isOpen = false;
    };
  }, [machineId]);

  const existingIds = useMemo(() => {
    const storedIds = collapsedIds ?? [];
    return spaces ? keepExistingSpaceIds(storedIds, spaces) : storedIds;
  }, [collapsedIds, spaces]);

  useEffect(() => {
    if (!collapsedIds || existingIds.length === collapsedIds.length) return;
    // Saves only: state keeps the stored ids until the next tap, so a tap mid-save is never lost.
    void saveCollapsedSpaceIds(machineId, existingIds);
  }, [machineId, collapsedIds, existingIds]);

  function toggle(spaceId: string) {
    const next = toggleSpaceId(existingIds, spaceId);
    setCollapsedIds(next);
    void saveCollapsedSpaceIds(machineId, next);
  }

  return { collapsedIds: existingIds, toggle };
}
