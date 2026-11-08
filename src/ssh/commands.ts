import type { HerdrKind } from "@/herdr/kinds";

// sshd runs a command through the person's login shell, which may not be POSIX (fish, for
// example). `sh -c` makes the script run the same everywhere. The script must hold no single quote.
function wrapInPosixShell(script: string): string {
  return `sh -c '${script}'`;
}

// Herdr installs to ~/.local/bin, which a non-login shell may not have on its PATH.
const WITH_LOCAL_BIN = 'PATH="$HOME/.local/bin:$PATH";';

const DESKTOP_FOUND = "hc";
const TUI_BRIDGE_VERSION = "herdr-api-bridge-v1";

/** Prints "hc" when the desktop app's CLI exists, and the TUI bridge's version when it exists. */
export const DETECT_COMMAND = wrapInPosixShell(
  [
    WITH_LOCAL_BIN,
    `command -v hc >/dev/null && echo ${DESKTOP_FOUND};`,
    "command -v herdr >/dev/null && herdr remote-api-bridge --check",
  ].join(" "),
);

// The TUI's socket answers one request per connection, so its bridge exits after one reply.
// The loop starts a bridge for each request line, so the app keeps one long command. The bridge
// fails only when it cannot reach Herdr; the loop then ends, and the app sees the close.
const TUI_BRIDGE_LOOP =
  'while IFS= read -r request; do printf "%s\\n" "$request" | herdr remote-api-bridge || exit; done';

/** Each kind's bridge: a plain command that reads requests on stdin and writes replies. */
export const BRIDGE_COMMANDS: Record<HerdrKind, string> = {
  desktop: wrapInPosixShell(`${WITH_LOCAL_BIN} exec hc connect`),
  tui: wrapInPosixShell(`${WITH_LOCAL_BIN} ${TUI_BRIDGE_LOOP}`),
};

/** The Herdr kinds that DETECT_COMMAND's output shows, desktop first. */
export function parseDetection(output: string): HerdrKind[] {
  const lines = output.split("\n").map((line) => line.trim());
  const kinds: HerdrKind[] = [];
  if (lines.includes(DESKTOP_FOUND)) kinds.push("desktop");
  if (lines.includes(TUI_BRIDGE_VERSION)) kinds.push("tui");
  return kinds;
}

/** A value as one shell word: in single quotes, with each single quote written as `'\''`. */
function quoteShellWord(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

/** Runs a script with `sh`, which gets the values as `$1`, `$2` and so on. The script must hold no single quote. */
function runScript(script: string, values: (string | number)[]): string {
  return [wrapInPosixShell(script), "sh", ...values.map((value) => quoteShellWord(String(value)))].join(" ");
}

/** The exit code the file-reading command gives for a path that is not a regular file. */
export const NOT_A_FILE_EXIT_CODE = 3;

// A line longer than this many bytes is replaced by a short note. A read holds at most 100 lines,
// so it prints at most 1.6 MB. That stays under the native module's 8 MiB output cap, and it
// can finish inside the module's 20 s run timeout on a slow link.
const MAX_LINE_LENGTH = 16_000;

// The note is one JSON line with the number of the line it replaces, so each note has its own id.
// It is the same for every agent (see `parseLongLineNote`).
const LONG_LINE_NOTE = '{"herdhandLongLine":%d}';

// A long line that holds a tool result gets this note instead, with the id of the call. The chat
// then shows the call as done, or as failed when the line says the result is an error. A long
// line that holds a tool call has no such note: the call is lost, and its result waits for it
// without showing.
const LONG_RESULT_NOTE = '{"herdhandLongLine":%d,"callId":"%s","failed":%s}';

// How the agents' files mark a tool result, the id of its call, and a failure.
const RESULT_LINE_AWK =
  String.raw`/"type":"(tool_result|function_call_output|custom_tool_call_output|tool\.execution_complete)"|"role":"toolResult"/`;
const CALL_ID_AWK = '/"(tool_use_id|call_id|toolCallId)":"[^"\\\\]+"/';
const FAILED_AWK = '/"(is_error|isError)":true|"success":false/';

const toAwkString = (text: string) => text.replace(/"/g, '\\"');

// Prints each line, or its note when it is long. awk adds the newline of the last line only when
// nl is 1, so a last line with no newline stays as it is.
const KEEP_SHORT_LINES_AWK = [
  'NR > 1 { printf "\\n" }',
  "{",
  'if (length($0) <= max) printf "%s", $0;',
  `else if ($0 ~ ${RESULT_LINE_AWK} && match($0, ${CALL_ID_AWK})) {`,
  'id = substr($0, RSTART, RLENGTH); sub(/^"[A-Za-z_]+":"/, "", id); sub(/"$/, "", id);',
  `failed = ($0 ~ ${FAILED_AWK}) ? "true" : "false";`,
  `printf "${toAwkString(LONG_RESULT_NOTE)}", start + NR - 1, id, failed }`,
  `else printf "${toAwkString(LONG_LINE_NOTE)}", start + NR - 1 }`,
  'END { if (NR > 0 && nl == 1) printf "\\n" }',
].join(" ");

// Prints the file's line count (a last line with no newline counts), then the lines from $2, at
// most $3 of them, with a note for each line longer than $4. $5 is the awk program.
const READ_LINES_SCRIPT = [
  `f=$1; [ -f "$f" ] || exit ${NOT_A_FILE_EXIT_CODE};`,
  'n=$(wc -l < "$f"); partial=$(tail -c 1 "$f"); [ -n "$partial" ] && n=$((n + 1)); echo $n;',
  '[ "$3" -gt 0 ] || exit 0;',
  'nl=1; [ -n "$partial" ] && [ $(($2 + $3 - 1)) -ge $n ] && nl=0;',
  'tail -n +"$2" "$f" | head -n "$3" | LC_ALL=C awk -v start="$2" -v max="$4" -v nl="$nl" "$5"',
].join(" ");

/** The command that prints a file's line count on the first line, and then the lines from `offset` (the first line is 1), at most `limit`. */
export function readLinesCommand(path: string, offset: number, limit: number): string {
  return runScript(READ_LINES_SCRIPT, [path, offset, limit, MAX_LINE_LENGTH, KEEP_SHORT_LINES_AWK]);
}

// Prints the path of each file whose name matches the pattern $2, exactly $3 levels below the
// folder $1. A folder that is missing has no files.
const FIND_FILES_SCRIPT = 'find -L "$1" -mindepth "$3" -maxdepth "$3" -type f -name "$2" 2>/dev/null; exit 0';

/** The command that prints the path of each file whose name matches `namePattern` (a glob), `depth` levels below `folder`. */
export function findFilesCommand(folder: string, namePattern: string, depth: number): string {
  return runScript(FIND_FILES_SCRIPT, [folder, namePattern, depth]);
}
