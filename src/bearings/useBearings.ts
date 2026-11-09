import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";

import { getErrorMessage } from "@/errorMessage";
import type { RunCommand } from "@/ssh/bridge";
import { AWAY_MARKER, getSnapshotCommand } from "@/ssh/commands";

import { readBearings, type Section } from "./bearings";

/** How long Bearings waits after one run ends before the next starts. */
export const REFRESH_INTERVAL_MS = 30_000;

type BearingsState = {
  /** All six sections of the last good snapshot, or null before the first one. */
  sections: Section[] | null;
  /** When the last good snapshot arrived, in milliseconds since 1970. */
  updatedAt: number | null;
  /** One line about the last run, when it failed. */
  error: string | null;
  isAway: boolean;
};

const NO_DATA: BearingsState = { sections: null, updatedAt: null, error: null, isAway: false };

/**
 * The Firstmate's bearings, run on open and again every REFRESH_INTERVAL_MS until the screen
 * closes. One run at a time, so slow replies never pile up. A failed run keeps the last
 * sections and shows one error line. No run starts while the app is in the background.
 * `refresh` runs at once and starts the wait again; a run that is already going is waited for.
 */
export function useBearings(run: RunCommand, folder: string) {
  const [state, setState] = useState(NO_DATA);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const running = useRef<Promise<void> | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const isOpen = useRef(true);

  const refresh = useCallback((): Promise<void> => {
    clearTimeout(timer.current);
    running.current ??= runOnce().finally(() => {
      running.current = null;
      if (!isOpen.current) return;
      setIsRefreshing(false);
      timer.current = setTimeout(poll, REFRESH_INTERVAL_MS);
    });
    return running.current;

    async function runOnce() {
      setIsRefreshing(true);
      const update = await readSnapshot(run, folder);
      if (isOpen.current) setState((last) => update(last));
    }

    function poll() {
      if (AppState.currentState === "background") {
        timer.current = setTimeout(poll, REFRESH_INTERVAL_MS);
        return;
      }
      void refresh();
    }
  }, [run, folder]);

  useEffect(() => {
    isOpen.current = true;
    void refresh();
    return () => {
      isOpen.current = false;
      clearTimeout(timer.current);
    };
  }, [refresh]);

  return { ...state, isRefreshing, refresh };
}

/** Runs the snapshot. Gives the change to the state, which keeps the last sections when the run failed. */
async function readSnapshot(run: RunCommand, folder: string): Promise<(last: BearingsState) => BearingsState> {
  try {
    const { output, exitCode } = await run(getSnapshotCommand(folder));
    if (exitCode !== 0) return failed(`Could not refresh (exit ${exitCode})`);
    if (output.trim() === AWAY_MARKER) return (last) => ({ ...last, error: null, isAway: true });
    return readSnapshotText(output);
  } catch (failure) {
    return failed(`Could not refresh: ${getErrorMessage(failure)}`);
  }
}

function readSnapshotText(output: string): (last: BearingsState) => BearingsState {
  try {
    const { sections, unsupported } = readBearings(output);
    if (unsupported) return failed(unsupported);
    return () => ({ sections, updatedAt: Date.now(), error: null, isAway: false });
  } catch (failure) {
    return failed(`Could not read the bearings: ${getErrorMessage(failure)}`);
  }
}

const failed = (error: string) => (last: BearingsState) => ({ ...last, error, isAway: false });
