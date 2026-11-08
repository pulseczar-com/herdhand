import type { Pane } from "@/herdr/backend";

// A session id from Herdr goes into a file name pattern, so it may hold only these characters.
const SAFE_SESSION_ID = /^[A-Za-z0-9_-]+$/;

/** The pane's session id, or null when it has none or it is not safe to use in a pattern. */
export function getSafeSessionId(pane: Pane): string | null {
  return pane.sessionId !== undefined && SAFE_SESSION_ID.test(pane.sessionId) ? pane.sessionId : null;
}

/**
 * The one path of a search, or null. With none or several the pane has no chat: the app never
 * picks a transcript by guessing.
 */
export function getOnlyPath(paths: string[]): string | null {
  return paths.length === 1 ? paths[0] : null;
}
