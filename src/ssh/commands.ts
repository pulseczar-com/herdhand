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

// Prints the file's line count (a last line with no newline counts), then the lines from $2, at
// most $3 of them. `tail` and `head` keep a last line with no newline as it is.
const READ_LINES_SCRIPT = [
  `f=$1; [ -f "$f" ] || exit ${NOT_A_FILE_EXIT_CODE};`,
  'n=$(wc -l < "$f"); [ -n "$(tail -c 1 "$f")" ] && n=$((n + 1)); echo $n;',
  '[ "$3" -gt 0 ] || exit 0;',
  'tail -n +"$2" "$f" | head -n "$3"',
].join(" ");

/** The command that prints a file's line count on the first line, and then the lines from `offset` (the first line is 1), at most `limit`. */
export function readLinesCommand(path: string, offset: number, limit: number): string {
  return runScript(READ_LINES_SCRIPT, [path, offset, limit]);
}

// Prints the path of each file named $2 directly inside a folder of folder $1.
const FIND_IN_SUBFOLDERS_SCRIPT = 'for f in "$1"/*/"$2"; do [ -f "$f" ] && echo "$f"; done; exit 0';

/** The command that prints the path of each file called `fileName` inside a folder of `folder`. */
export function findInSubfoldersCommand(folder: string, fileName: string): string {
  return runScript(FIND_IN_SUBFOLDERS_SCRIPT, [folder, fileName]);
}
