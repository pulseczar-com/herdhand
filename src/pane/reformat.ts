/**
 * Reformats a pane's screen text for the phone's width: text in, blocks out. The rules work on any
 * program's text, and each one keeps the lines as they are when it is not sure.
 */

export type Block =
  | { kind: "lines"; lines: string[] }
  // Lines that a program wrapped at the pane's width, joined. The prefix is the indent and the
  // marker; the text wraps under its own first word.
  | { kind: "paragraph"; prefix: string; text: string }
  // A divider line, drawn as one thin line; the label is the short text inside it, if any. The
  // label shows first when the line is shorter before it than after it, as in the source.
  | { kind: "rule"; label: string | null; isLabelFirst: boolean }
  | { kind: "table"; header: string[]; rows: string[][] };

type TableBlock = Extract<Block, { kind: "table" }>;

// A divider line: rule characters, then text with none of them, then rule characters.
const DIVIDER_PARTS = /^([─━═╌┄┈╍┅\-=_]*)([^─━═╌┄┈╍┅\-=_]*)([─━═╌┄┈╍┅\-=_]*)$/;
const MIN_RULE_LENGTH = 8;
const MAX_LABEL_LENGTH = 30;

const BOX_TOP = /^\s*[┌╭┏╔][─━═┬┳╦╤]+[┐╮┓╗]$/;
const BOX_SEPARATOR = /^\s*[├┣╠╞][─━═┼╋╬╪]+[┤┫╣╡]$/;
const BOX_BOTTOM = /^\s*[└╰┗╚][─━═┴┻╩╧]+[┘╯┛╝]$/;
const BOX_ROW = /^\s*[│┃║](.*)[│┃║]$/;
// A line that starts like a box table's: its spaces are cell padding, even when the table is cut off.
const BOX_LINE_START = /^\s*[│┃║├┣╠╞┌╭┏╔└╰┗╚]/;
const BOX_COLUMN_EDGE = /[┬┳╦╤]/g;
const CELL_EDGE = /[│┃║]/;

// A list marker: one symbol (●, -, *, ❯) or a number with a dot or a parenthesis, then spaces.
const LIST_MARKER = /^\s*(?:[^\p{L}\p{N}\s]|\d+[.)])\s+/u;
// Two or more spaces inside a line: columns, which never join.
const COLUMN_GAP = /\S {2,}\S/;
// Three or more spaces inside a line: a gap that a program padded to right-align text.
const WIDE_GAP = /(?<=\S) {3,}(?=\S)/g;
const GAP = /(?<=\S) {2,}(?=\S)/g;
// A program wraps a little before the edge; this many columns of slack still count as full.
const WRAP_SLACK = 2;

/**
 * The blocks to show for a pane's text on a phone that shows `phoneColumns` monospace columns.
 * `paneColumns` is the pane's width as Herdr reports it; with null, no lines join.
 */
export function reformatPane(text: string, phoneColumns: number, paneColumns: number | null): Block[] {
  const lines = text
    .trimEnd()
    .split("\n")
    .map((line) => line.trimEnd());
  const blocks: Block[] = [];
  let plain: string[] = [];
  const flushPlain = () => {
    blocks.push(...reflow(collapseGaps(plain, phoneColumns), paneColumns));
    plain = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const divider = parseDivider(lines[i]);
    if (divider) {
      flushPlain();
      blocks.push({ kind: "rule", ...divider });
      continue;
    }
    const tableEnd = findTableEnd(lines, i);
    if (tableEnd !== null) {
      flushPlain();
      blocks.push(makeTableBlock(lines.slice(i, tableEnd + 1), phoneColumns));
      i = tableEnd;
      continue;
    }
    plain.push(lines[i]);
  }
  flushPlain();
  return blocks;
}

// ---- Dividers ----

/**
 * A divider line: one or two runs of one rule character, at least one of them long, with at most
 * one short label before, between or after them. The label has spaces around it and none of the
 * rule characters, so a line that is not sure to be a divider stays text.
 */
function parseDivider(line: string): { label: string | null; isLabelFirst: boolean } | null {
  const [, before, text, after] = DIVIDER_PARTS.exec(line.trim()) ?? [];
  if (before === undefined || !isOneRule(before, after)) return null;
  if (text === "") return { label: null, isLabelFirst: false };

  const label = text.trim();
  const isSeparated = (before === "" || text.startsWith(" ")) && (after === "" || text.endsWith(" "));
  if (!isSeparated || label === "" || getLength(label) > MAX_LABEL_LENGTH) return null;
  return { label, isLabelFirst: before.length < after.length };
}

/** True when the runs are all one rule character and at least one of them is long. */
function isOneRule(before: string, after: string): boolean {
  const runs = [before, after].filter((run) => run !== "");
  const character = runs[0]?.[0] ?? "";
  const isOneCharacter = runs.every((run) => run === character.repeat(run.length));
  return isOneCharacter && runs.some((run) => run.length >= MIN_RULE_LENGTH);
}

// ---- Box tables ----

/**
 * The index of the bottom line of a box table whose top line is at `start`, or null. The bottom
 * line must follow the table's rows and separators directly.
 */
function findTableEnd(lines: string[], start: number): number | null {
  if (!BOX_TOP.test(lines[start])) return null;
  let end = start + 1;
  while (end < lines.length && (BOX_ROW.test(lines[end]) || BOX_SEPARATOR.test(lines[end]))) end++;
  return end < lines.length && BOX_BOTTOM.test(lines[end]) ? end : null;
}

/** A table as one card for each row, or its lines as they are when it fits the phone or does not parse. */
function makeTableBlock(tableLines: string[], phoneColumns: number): Block {
  const unchanged: Block = { kind: "lines", lines: tableLines };
  const fits = tableLines.every((line) => getLength(line.trim()) <= phoneColumns);
  if (fits) return unchanged;
  return parseTable(tableLines) ?? unchanged;
}

/**
 * A box table's header and rows, a cell's wrapped lines joined. Null when any line does not
 * parse, the table has no header separator, or the table has no separators between body rows and
 * a body cell is empty: that cell may be a wrapped one, and the rows cannot be told apart.
 */
function parseTable(tableLines: string[]): TableBlock | null {
  const columnCount = (tableLines[0].match(BOX_COLUMN_EDGE) ?? []).length + 1;
  const groups = splitRowGroups(tableLines.slice(1, -1), columnCount);
  if (!groups || groups.length < 2) return null;

  const [headerGroup, ...bodyGroups] = groups;
  const hasEmptyCell = bodyGroups[0].some((cells) => cells.includes(""));
  if (bodyGroups.length === 1 && hasEmptyCell) return null;
  // With no separators between body rows, each line is its own row.
  const rows = bodyGroups.length === 1 ? bodyGroups[0] : bodyGroups.map(joinRowLines);
  return { kind: "table", header: joinRowLines(headerGroup), rows };
}

/** The cells of each line, in groups between separator lines. Null when a line is not a row. */
function splitRowGroups(bodyLines: string[], columnCount: number): string[][][] | null {
  const groups: string[][][] = [[]];
  for (const line of bodyLines) {
    if (BOX_SEPARATOR.test(line)) {
      groups.push([]);
      continue;
    }
    const row = BOX_ROW.exec(line);
    const cells = row?.[1].split(CELL_EDGE).map((cell) => cell.trim());
    if (!cells || cells.length !== columnCount) return null;
    groups[groups.length - 1].push(cells);
  }
  return groups.filter((group) => group.length > 0);
}

/** One row from the lines of a row whose cells wrapped. */
function joinRowLines(rowLines: string[][]): string[] {
  return rowLines[0].map((_, column) => {
    const parts = rowLines.map((cells) => cells[column]).filter(Boolean);
    return parts.join(" ");
  });
}

// ---- Right-aligned gaps ----

/**
 * The lines with each long run of spaces in a line wider than the phone cut to two, so text that
 * a program right-aligned stays next to the rest. A line in aligned columns stays as it is.
 */
function collapseGaps(lines: string[], phoneColumns: number): string[] {
  return lines.map((line, index) => {
    const fits = getLength(line) <= phoneColumns;
    if (fits || BOX_LINE_START.test(line) || isColumnOutput(lines, index)) return line;
    return line.replace(WIDE_GAP, "  ");
  });
}

/** True when a gap of the line ends where a gap of the previous or next text line ends. */
function isColumnOutput(lines: string[], index: number): boolean {
  const ownEnds = getGapEnds(lines[index]);
  const neighbors = [findTextLine(lines, index, -1), findTextLine(lines, index, 1)];
  const sharesGapEnd = (neighbor: string) => getGapEnds(neighbor).some((end) => ownEnds.includes(end));
  return neighbors.some((neighbor) => neighbor !== null && sharesGapEnd(neighbor));
}

/** The nearest line before (step -1) or after (step 1) the index that is not blank, or null. */
function findTextLine(lines: string[], index: number, step: 1 | -1): string | null {
  for (let i = index + step; i >= 0 && i < lines.length; i += step) {
    if (lines[i].trim() !== "") return lines[i];
  }
  return null;
}

/** The column of the first character after each gap of two or more spaces. */
function getGapEnds(line: string): number[] {
  return [...line.matchAll(GAP)].map((gap) => getLength(line.slice(0, gap.index + gap[0].length)));
}

// ---- Reflow ----

/**
 * Plain lines, with the lines that a program wrapped at the pane's width joined into paragraphs.
 * Every other line, and every line with columns, stays as it is.
 */
function reflow(lines: string[], width: number | null): Block[] {
  if (lines.length === 0) return [];
  if (width === null) return [{ kind: "lines", lines }];

  const blocks: Block[] = [];
  for (let start = 0; start < lines.length; start++) {
    const textColumn = getTextColumn(lines[start]);
    let end = start;
    while (end + 1 < lines.length && isContinuation(lines[end], lines[end + 1], textColumn, width)) end++;

    if (end > start) blocks.push(makeParagraph(lines.slice(start, end + 1), textColumn));
    else appendLine(blocks, lines[start]);
    start = end;
  }
  return blocks;
}

/**
 * True when `next` continues `previous`: the program broke the line only because the next word
 * would not fit in the pane, and `next` starts under the paragraph's text.
 */
function isContinuation(previous: string, next: string, textColumn: number, width: number): boolean {
  if (next.trim() === "" || getIndent(next) !== textColumn || LIST_MARKER.test(next)) return false;
  if (COLUMN_GAP.test(previous.slice(textColumn)) || COLUMN_GAP.test(next.trim())) return false;

  // A line under half the pane ends where its writer ended it. Both Herdr reads give a line that
  // the terminal soft-wrapped as one line, so a line longer than the pane is a whole line and
  // never joins the next one. The TUI `recent_unwrapped` source documents this. For the desktop
  // `terminal.read` it is observed behavior (herdr-core 0.1.18), not stated in the schema.
  const previousLength = getLength(previous);
  if (previousLength < width / 2 || previousLength > width) return false;

  const nextWordLength = getLength(next.trim().split(" ")[0]);
  return previousLength + 1 + nextWordLength > width - WRAP_SLACK;
}

/** One paragraph from wrapped lines: the first line's indent and marker are its prefix. */
function makeParagraph(paragraphLines: string[], textColumn: number): Block {
  const [first, ...rest] = paragraphLines;
  const text = [first.slice(textColumn), ...rest.map((line) => line.trim())].join(" ");
  return { kind: "paragraph", prefix: first.slice(0, textColumn), text };
}

/** Adds a line to the last block when that block is plain lines, so they show as one text. */
function appendLine(blocks: Block[], line: string) {
  const last = blocks[blocks.length - 1];
  if (last?.kind === "lines") last.lines.push(line);
  else blocks.push({ kind: "lines", lines: [line] });
}

/** Where a line's text starts: after its indent and its list marker. */
function getTextColumn(line: string): number {
  return LIST_MARKER.exec(line)?.[0].length ?? getIndent(line);
}

function getIndent(line: string): number {
  return line.length - line.trimStart().length;
}

// Counts characters, not UTF-16 units, so box-drawing and symbols count as one column each.
function getLength(text: string): number {
  return [...text].length;
}
