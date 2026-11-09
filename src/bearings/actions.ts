// Ported from the herdr-firstmate-bearings sidebar mod (MIT, same author): actions.js.
// Which action buttons an item shows, and the note each one sends. A button shows only when the
// snapshot row proves the action is valid; when unsure, it is left out.
import { sanitizeId } from "./ask";
import type { Row, SectionId } from "./bearings";

export type ActionId = "start" | "done" | "defer" | "drop" | "stop";

/** `icon` is a Feather icon name; Drop and Stop ask first. */
export const ACTIONS: Record<ActionId, { label: string; icon: "play" | "check" | "clock" | "trash-2" | "square"; confirm: boolean }> = {
  start: { label: "Start now", icon: "play", confirm: false },
  done: { label: "Done", icon: "check", confirm: false },
  defer: { label: "Defer", icon: "clock", confirm: false },
  drop: { label: "Drop", icon: "trash-2", confirm: true },
  stop: { label: "Stop", icon: "square", confirm: true },
};

// The status text of a row says what is known about it: "hand task", "deferred", "working", "held".
const statusIs = (row: Row, text: string) => row.status?.text === text;

const RULES: Partial<Record<SectionId, (row: Row) => (ActionId | false)[]>> = {
  decisions: (row) => [statusIs(row, "hand task") && "done", !statusIs(row, "deferred") && "defer", "drop"],
  "in-flight": (row) => [statusIs(row, "working") && "stop"],
  queued: (row) => [!row.status && !row.reason && "start"],
};

/** The action ids, in button order, for a row of a section. Discuss is not here: every item has it. */
export function getActions(sectionId: SectionId, row: Row): ActionId[] {
  const ids = RULES[sectionId]?.(row) ?? [];
  return ids.filter((id) => id !== false);
}

export const getActionBody = (action: ActionId, sectionId: SectionId, itemId: string) =>
  `[bearings panel] ${action} ${sectionId} ${sanitizeId(itemId)}`;
