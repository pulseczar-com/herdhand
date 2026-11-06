/**
 * Styled pane text: the TUI's `pane.read` with `format: "ansi"` carries SGR style codes. This
 * removes every escape sequence and keeps where the program dimmed the text.
 */

export type Segment = { text: string; isDim: boolean };

type StyledText = {
  text: string;
  // Each plain line (trailing spaces trimmed) that has dim text, as its segments.
  dimLines: Map<string, Segment[]>;
};

// One escape sequence: a CSI (its parameters and final byte kept, to find style codes), an OSC
// ended by BEL or ST, or a two-character escape (any final byte but the `[` and `]` that start
// the other two).
const ESCAPE = /\x1b(?:\[([0-?]*)[ -/]*([@-~])|\][^\x07\x1b]*(?:\x07|\x1b\\)|[ -/]*[0-Z\\^-~])/y;
// SGR codes that take a color: `5;n` (a palette color) or `2;r;g;b` (a true color) follows.
const COLOR_CODES = new Set([38, 48, 58]);
const PALETTE_COLOR = "5";
const PALETTE_COLOR_PARTS = 2;
const TRUE_COLOR_PARTS = 4;
const SGR_RESET = 0;
const SGR_DIM = 2;
const SGR_NORMAL_INTENSITY = 22;

/** The text with every escape sequence removed, and the lines that have dim text. */
export function parseStyledText(raw: string): StyledText {
  const dimLines = new Map<string, Segment[]>();
  let text = "";
  let isDim = false;
  let lineSegments: Segment[] = [];
  let position = 0;
  while (position < raw.length) {
    const character = raw[position];
    if (character === "\x1b") {
      ESCAPE.lastIndex = position;
      const escape = ESCAPE.exec(raw);
      if (escape?.[2] === "m") isDim = getDimAfterSgr(escape[1], isDim);
      // An unfinished sequence drops only its ESC.
      position = escape ? ESCAPE.lastIndex : position + 1;
      continue;
    }
    text += character;
    position++;
    if (character === "\n") {
      addDimLine(dimLines, lineSegments);
      lineSegments = [];
      continue;
    }
    appendCharacter(lineSegments, character, isDim);
  }
  addDimLine(dimLines, lineSegments);

  return { text, dimLines };
}

/** The dim state after an SGR parameter list. */
function getDimAfterSgr(parameters: string, wasDim: boolean): boolean {
  const codes = parameters.split(";");
  let isDim = wasDim;
  for (let index = 0; index < codes.length; index++) {
    // A `:` joins the parts of one color or style, so this code is not a plain one.
    if (codes[index].includes(":")) continue;
    // An empty code, as in `ESC[m` or `ESC[;2m`, is a reset.
    const code = codes[index] === "" ? SGR_RESET : Number(codes[index]);
    if (COLOR_CODES.has(code)) {
      const isPaletteColor = codes[index + 1] === PALETTE_COLOR;
      index += isPaletteColor ? PALETTE_COLOR_PARTS : TRUE_COLOR_PARTS;
    } else if (code === SGR_RESET || code === SGR_NORMAL_INTENSITY) {
      isDim = false;
    } else if (code === SGR_DIM) {
      isDim = true;
    }
  }
  return isDim;
}

/** Keeps the line when it has dim text, by its plain text with its trailing spaces trimmed. */
function addDimLine(dimLines: Map<string, Segment[]>, lineSegments: Segment[]) {
  const segments = trimTrailingSpaces(lineSegments);
  if (!segments.some((segment) => segment.isDim)) return;
  const plainLine = segments.map((segment) => segment.text).join("");
  dimLines.set(plainLine, segments);
}

function appendCharacter(segments: Segment[], character: string, isDim: boolean) {
  const last = segments[segments.length - 1];
  if (last?.isDim === isDim) last.text += character;
  else segments.push({ text: character, isDim });
}

/** The line's segments with its trailing spaces removed, in place. */
function trimTrailingSpaces(segments: Segment[]): Segment[] {
  while (segments.length > 0) {
    const last = segments[segments.length - 1];
    last.text = last.text.trimEnd();
    if (last.text !== "") break;
    segments.pop();
  }
  return segments;
}
