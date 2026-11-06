/**
 * Splits a command's output stream into lines and keeps only the lines that are JSON objects.
 * Login banners and prompts can reach the stream before the bridge starts, so other lines are
 * skipped.
 */
export class JsonLineReader {
  private pending = "";

  /** Adds a chunk of output and returns the complete JSON-object lines it finished. */
  push(chunk: string): object[] {
    // Splits only the new chunk, so a long line that arrives in many chunks is not rescanned.
    const parts = chunk.split("\n");
    const last = parts.pop() ?? "";
    if (parts.length === 0) {
      this.pending += last;
      return [];
    }
    const lines = [this.pending + parts[0], ...parts.slice(1)];
    this.pending = last;
    return lines.map(parseObjectLine).filter((value): value is object => value !== null);
  }
}

/** Parses a line from its first "{", so a shell prompt with no line end before it is dropped. */
function parseObjectLine(line: string): object | null {
  const start = line.indexOf("{");
  if (start < 0) return null;
  const text = line.slice(start).trim();
  try {
    const value: unknown = JSON.parse(text);
    return isObject(value) ? value : null;
  } catch {
    return null;
  }
}

function isObject(value: unknown): value is object {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
