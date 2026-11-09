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

/**
 * Each kind's events command: a plain command on its own channel, which keeps a subscription
 * open. The desktop app's `hc connect` serves both. The TUI bridge here is the single-request
 * bridge, not the loop above, because a subscription takes over its socket until it closes.
 */
export const EVENTS_COMMANDS: Record<HerdrKind, string> = {
  desktop: BRIDGE_COMMANDS.desktop,
  tui: wrapInPosixShell(`${WITH_LOCAL_BIN} exec herdr remote-api-bridge`),
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
const HIDDEN_LINE_NOTE = '{"herdhandLongLine":%d,"hidden":true}';

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

// A Claude Code line that is not part of the chat has a top-level "attachment" key, a top-level
// "isSidechain":true, or a "type" that is not user or assistant. The cut keeps no prefix, so awk
// reads the start of the line: its scalar keys, then the one that decides. A key deep inside a
// long message does not count. The other agents' types are not in the list, so their lines never
// match. Such a line gets a note with "hidden", and the chat shows no row for it. Two kinds of
// long user line are not shown at full size but still show the marker, because the start of the
// line cannot show them: a line with "isMeta" (it comes after "message"), and a line whose text
// starts with a hidden tag, such as bash-stdout or local-command-stdout (the tag is inside
// "message").
const SCALAR_KEYS_AWK = String.raw`^\{("[A-Za-z]+":("[^"\\]*"|null|true|false|[0-9]+),)*`;
const HIDDEN_LINE_AWK =
  String.raw`/${SCALAR_KEYS_AWK}("attachment":\{|"isSidechain":true[,}]|"type":"(attachment|system|progress|summary|file-history-snapshot|queue-operation|last-prompt|api-request-[a-z]+)")/`;

const toAwkString = (text: string) => text.replace(/"/g, '\\"');

// Prints each line, or its note when it is long. awk adds the newline of the last line only when
// nl is 1, so a last line with no newline stays as it is.
const KEEP_SHORT_LINES_AWK = [
  'NR > 1 { printf "\\n" }',
  "{",
  'if (length($0) <= max) printf "%s", $0;',
  `else if ($0 ~ ${HIDDEN_LINE_AWK}) printf "${toAwkString(HIDDEN_LINE_NOTE)}", start + NR - 1;`,
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

// Runs a Firstmate script through a login shell, so the script finds the tools in the user's
// PATH (a remote command has a bare one). The script and its arguments stay separate arguments,
// never joined into a command string. $1 is the Firstmate home; the script is under it.
const RUN_IN_LOGIN_SHELL = String.raw`exec sh -lc "exec \"\$0\" \"\$@\""`;

/** The line the snapshot command prints, and exits 0, while the Firstmate is in away mode. */
export const AWAY_MARKER = "herdhand-away-mode";

// The standard flags list every decision and every landed item. `run` drops stderr, so the app
// cannot read the snapshot's own away-mode refusal; this tests the file the Firstmate keeps then.
const SNAPSHOT_SCRIPT = `[ -e "$1/state/.afk" ] && { echo ${AWAY_MARKER}; exit 0; }; ${RUN_IN_LOGIN_SHELL} "$1/bin/fm-bearings-snapshot.sh" --json --all-decisions --all-landed`;
const RECORD_SCRIPT = `${RUN_IN_LOGIN_SHELL} "$1/bin/fm-tasks-axi.sh" show "$2" --full`;
// `--` keeps a body that starts with a dash from being read as a flag.
const NOTE_SCRIPT = `${RUN_IN_LOGIN_SHELL} "$1/bin/fm-inbox.sh" note --request-id "$2" -- "$3"`;

/** Exits 0 when the folder is a Firstmate home: it has an executable snapshot script. */
export function getTestFirstmateCommand(home: string): string {
  return runScript('test -x "$1/bin/fm-bearings-snapshot.sh"', [home]);
}

/** Prints the bearings snapshot (JSON, schema fm-bearings.v1), or AWAY_MARKER in away mode. */
export function getSnapshotCommand(home: string): string {
  return runScript(SNAPSHOT_SCRIPT, [home]);
}

/** Prints the full record of one task, in TOON. */
export function getRecordCommand(home: string, taskId: string): string {
  return runScript(RECORD_SCRIPT, [home, taskId]);
}

/** Saves one note in the Firstmate's inbox. The same request id saves the note once. */
export function getNoteCommand(home: string, requestId: string, body: string): string {
  return runScript(NOTE_SCRIPT, [home, requestId, body]);
}
