// Ported from the herdr-firstmate-bearings sidebar mod (MIT, same author): ask.js.
// Builds the note the Discuss sheet sends. The note holds the section and the item id, never the
// row's text: row text can come from worker output.

const MAX_ID_LENGTH = 64;
const PREFIX = "[bearings panel] discuss";

/** The item id as the note carries it: no whitespace, cut to MAX_ID_LENGTH. */
export function sanitizeId(itemId: string): string {
  return itemId.replace(/\s+/g, "").slice(0, MAX_ID_LENGTH);
}

/** The note for a typed text. With no text, the note names only the item. */
export function getNoteBody(sectionId: string, itemId: string, typed: string): string {
  const text = typed.replace(/\s+/g, " ").trim();
  const target = `${PREFIX} ${sectionId} ${sanitizeId(itemId)}`;
  return text ? `${target} - ${text}` : target;
}

/** One id per sheet, so a retry of the same sheet writes one note. */
export function makeRequestId(): string {
  return `bearings-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
