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
