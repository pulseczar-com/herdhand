/// <reference types="node" />
import { execFileSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { BRIDGE_COMMANDS, DETECT_COMMAND, parseDetection } from "./commands";

// The commands run on a real shell here, with fake Herdr programs in a fake home directory's
// ~/.local/bin, which is not on the shell's own PATH.
describe("the host commands", () => {
  let home: string;

  beforeAll(() => {
    home = mkdtempSync(join(tmpdir(), "herdhand-"));
    const bin = join(home, ".local", "bin");
    mkdirSync(bin, { recursive: true });
    writeFileSync(join(bin, "hc"), '#!/bin/sh\necho "hc $*"\n');
    // Like the real bridge, the fake answers one request line and exits.
    writeFileSync(
      join(bin, "herdr"),
      '#!/bin/sh\n[ "$2" = "--check" ] && echo herdr-api-bridge-v1 && exit\nread -r request\ncase "$request" in *fail*) exit 1;; esac\nprintf "%s\\n" "herdr $* $request"\n',
    );
    chmodSync(join(bin, "hc"), 0o755);
    chmodSync(join(bin, "herdr"), 0o755);
  });

  afterAll(() => rmSync(home, { recursive: true, force: true }));

  // sshd gives the command to the login shell as one string.
  const run = (command: string, input = "") =>
    execFileSync("/bin/sh", ["-c", command], {
      env: { HOME: home, PATH: "/usr/bin:/bin", NODE_ENV: "test" },
      encoding: "utf8",
      input,
    });

  it("finds both kinds in ~/.local/bin", () => {
    expect(parseDetection(run(DETECT_COMMAND))).toEqual(["desktop", "tui"]);
  });

  it("starts the desktop bridge from ~/.local/bin", () => {
    expect(run(BRIDGE_COMMANDS.desktop).trim()).toBe("hc connect");
  });

  it("starts the TUI bridge from ~/.local/bin once for each request, and keeps backslashes", () => {
    const requests = ['{"id":"1","method":"ping"}', '{"id":"2","params":{"text":"a\\nb"}}'];
    expect(run(BRIDGE_COMMANDS.tui, `${requests.join("\n")}\n`).trim().split("\n")).toEqual(
      requests.map((request) => `herdr remote-api-bridge ${request}`),
    );
  });

  it("ends the TUI bridge when Herdr cannot answer, so the app sees the connection close", () => {
    const requests = ['{"id":"fail"}', '{"id":"2"}'];
    expect(() => run(BRIDGE_COMMANDS.tui, `${requests.join("\n")}\n`)).toThrow(/Command failed/);
  });
});
