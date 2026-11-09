import { createContext, type ReactNode, useCallback, useContext, useMemo } from "react";

import { getErrorMessage } from "@/errorMessage";
import type { Space } from "@/herdr/backend";
import type { RunCommand } from "@/ssh/bridge";
import { getNoteCommand } from "@/ssh/commands";

import type { CachedRecord } from "./records";
import { getLastSeen } from "./lastSeen";
import { useBearings } from "./useBearings";

type BearingsValue = ReturnType<typeof useBearings> & {
  folder: string;
  /** The Firstmate's space: its name and badge title the screens. */
  space: Space;
  run: RunCommand;
  /** The task records fetched in this session, so an opened item shows at once. */
  recordCache: Map<string, CachedRecord>;
  /** Saves a note in the Firstmate's inbox. Gives null when it was saved, else why it failed. */
  sendNote(requestId: string, body: string): Promise<string | null>;
};

const BearingsContext = createContext<BearingsValue | null>(null);

type BearingsProviderProps = { machineId: string; run: RunCommand; folder: string; space: Space; children: ReactNode };

/**
 * The Firstmate's bearings for the screens of Bearings: the pane's list and each opened item
 * share one snapshot and one poll. It runs only while a Bearings screen is open.
 */
export function BearingsProvider({ machineId, run, folder, space, children }: BearingsProviderProps) {
  const seen = getLastSeen(machineId, folder);
  const { sections, updatedAt, error, isAway, isRefreshing, refresh } = useBearings(run, folder, seen);
  const recordCache = seen.records;

  const sendNote = useCallback(
    async (requestId: string, body: string) => {
      try {
        const { exitCode } = await run(getNoteCommand(folder, requestId, body));
        if (exitCode !== 0) return `exit code ${exitCode}`;
      } catch (failure) {
        return getErrorMessage(failure);
      }
      // The list shows what the note changed.
      void refresh();
      return null;
    },
    [run, folder, refresh],
  );

  const value = useMemo(
    () => ({ sections, updatedAt, error, isAway, isRefreshing, refresh, folder, space, run, recordCache, sendNote }),
    [sections, updatedAt, error, isAway, isRefreshing, refresh, folder, space, run, recordCache, sendNote],
  );
  return <BearingsContext.Provider value={value}>{children}</BearingsContext.Provider>;
}

/** The open Bearings, or null while the connection is not open. */
export function useBearingsContext(): BearingsValue | null {
  return useContext(BearingsContext);
}
