/** The message of a thrown value: an Error's message, or the value as text. */
export function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
