import { useEffect, useState } from "react";

import type { RunCommand } from "@/ssh/bridge";
import { getTestFirstmateCommand } from "@/ssh/commands";

// What the check found for each folder, kept for the session so a folder is checked once. A
// failed check is not kept, so the next open of the pane tries again.
const found = new Map<string, boolean>();

/** Forgets what the checks found. For tests. */
export function resetFirstmateChecks() {
  found.clear();
}

/**
 * Whether the folder is a Firstmate home: it has an executable `bin/fm-bearings-snapshot.sh`.
 * False until the check ends, and for a pane that reports no folder or a connection that is not open.
 */
export function useIsFirstmate(machineId: string, run: RunCommand | undefined, folder: string | undefined): boolean {
  const key = `${machineId}\n${folder}`;
  // Counts the checks that ended, so the pane renders again with what they found.
  const [, setChecks] = useState(0);

  useEffect(() => {
    if (!folder || !run || found.has(key)) return;
    let isOpen = true;
    run(getTestFirstmateCommand(folder)).then(
      ({ exitCode }) => {
        found.set(key, exitCode === 0);
        if (isOpen) setChecks((count) => count + 1);
      },
      () => undefined,
    );
    return () => {
      isOpen = false;
    };
  }, [key, run, folder]);

  return Boolean(folder && run && found.get(key));
}
