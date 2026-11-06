import { router } from "expo-router";

import type { Pane } from "@/herdr/backend";

/** Opens the pane's screen, named by the pane's title, or by its id when it has none. */
export function openPane(machineId: string, pane: Pane) {
  const title = pane.title || pane.id;
  router.push({ pathname: "/machine/[id]/pane/[paneId]", params: { id: machineId, paneId: pane.id, title } });
}
