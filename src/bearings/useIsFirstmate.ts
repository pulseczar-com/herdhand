import { useEffect, useState } from "react";

import type { Pane } from "@/herdr/backend";
import type { RunCommand } from "@/ssh/bridge";
import { getTestFirstmateCommand } from "@/ssh/commands";

// What the check found for each pane, kept for the session so a pane is checked once. A failed
// check is not kept, so the next open of the pane tries again.
const found = new Map<string, boolean>();

type PaneIdentity = Pick<Pane, "cwd" | "pid" | "sessionId">;

/** Forgets what the checks found. For tests. */
export function resetFirstmateChecks() {
  found.clear();
}

/**
 * Whether the pane runs the Firstmate: its folder is a Firstmate home (it has an executable
 * `bin/fm-bearings-snapshot.sh`) and its pid or session id is the one the home's lock records.
 * False until the check ends, and for a pane that reports no folder or a connection that is not open.
 */
export function useIsFirstmate(machineId: string, run: RunCommand | undefined, pane: PaneIdentity | undefined): boolean {
  const { cwd: folder, pid, sessionId } = pane ?? {};
  const key = `${machineId}\n${folder}\n${pid ?? ""}\n${sessionId ?? ""}`;
  // Counts the checks that ended, so the pane renders again with what they found.
  const [, setChecks] = useState(0);

  useEffect(() => {
    if (!folder || !run || found.has(key)) return;
    let isOpen = true;
    run(getTestFirstmateCommand(folder, pid, sessionId)).then(
      ({ exitCode }) => {
        found.set(key, exitCode === 0);
        if (isOpen) setChecks((count) => count + 1);
      },
      () => undefined,
    );
    return () => {
      isOpen = false;
    };
  }, [key, run, folder, pid, sessionId]);

  return Boolean(folder && run && found.get(key));
}
