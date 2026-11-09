// Ported from the herdr-firstmate-bearings sidebar mod (MIT, same author): toon.js.
// Reads the TOON text that `fm-tasks-axi.sh show <id> --full` prints. Only that shape is supported:
// "key: value" lines, values bare or in double quotes (JSON escapes), and one level of nesting
// where an unindented "name:" line is followed by indented lines.

const LINE = /^(\s*)([^:\s][^:]*?):(?:\s+(.*))?$/;

function readValue(text: string): string {
  const value = text.trim();
  if (!value.startsWith('"')) return value;
  try {
    return JSON.parse(value) as string;
  } catch {
    return value.slice(1, -1);
  }
}

type ToonBlock = Record<string, string>;
type Toon = Record<string, string | ToonBlock>;

/** `{ name: { key: value } }` for nested blocks and `{ key: value }` for top-level lines. */
export function parseToon(text: string): Toon {
  const result: Toon = {};
  let block: ToonBlock | null = null;
  for (const line of text.split("\n")) {
    const match = LINE.exec(line);
    if (!match) continue;
    const [, indent, key, value] = match;
    if (indent.length === 0 && value === undefined) {
      block = {};
      result[key] = block;
    } else if (indent.length === 0) {
      block = null;
      result[key] = readValue(value);
    } else if (block) {
      block[key] = readValue(value ?? "");
    }
  }
  return result;
}

/** The record of one task: the keys under "task:". Empty when the text has no such block. */
export function parseTaskRecord(text: string): ToonBlock {
  const task = parseToon(text).task;
  return typeof task === "object" ? task : {};
}
