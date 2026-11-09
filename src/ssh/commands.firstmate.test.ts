/// <reference types="node" />
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { AWAY_MARKER, getNoteCommand, getRecordCommand, getSnapshotCommand, getTestFirstmateCommand } from "./commands";

// The commands run on a real shell here, against a fake Firstmate home whose scripts print the
// arguments they get, one on each line.
describe("the Firstmate commands", () => {
  let base: string;
  // A name with a space and a single quote, so quoting is tested too.
  let home: string;

  const writeScript = (name: string, body: string) => {
    const path = join(home, "bin", name);
    writeFileSync(path, `#!/bin/sh\n${body}\n`);
    chmodSync(path, 0o755);
  };
  const printArgs = 'for arg in "$@"; do printf "%s\\n" "$arg"; done';

  beforeAll(() => {
    base = mkdtempSync(join(tmpdir(), "herdhand-"));
    home = join(base, "first mate's home");
    mkdirSync(join(home, "bin"), { recursive: true });
    mkdirSync(join(home, "state"));
    writeScript("fm-bearings-snapshot.sh", printArgs);
    writeScript("fm-tasks-axi.sh", printArgs);
    writeScript("fm-inbox.sh", printArgs);
  });

  afterAll(() => rmSync(base, { recursive: true, force: true }));

  // sshd gives the command to the login shell as one string.
  const run = (command: string) => spawnSync("/bin/sh", ["-c", command], { env: { PATH: "/usr/bin:/bin", NODE_ENV: "test" }, encoding: "utf8" });
  const lines = (command: string) => execFileSync("/bin/sh", ["-c", command], { env: { PATH: "/usr/bin:/bin", NODE_ENV: "test" }, encoding: "utf8" }).trim().split("\n");

  it("tells a Firstmate home by its executable snapshot script", () => {
    expect(run(getTestFirstmateCommand(home)).status).toBe(0);
    expect(run(getTestFirstmateCommand(base)).status).not.toBe(0);
  });

  it("runs the snapshot with the flags that list every decision and landed item", () => {
    expect(lines(getSnapshotCommand(home))).toEqual(["--json", "--all-decisions", "--all-landed"]);
  });

  it("prints only the away marker while the home is in away mode", () => {
    writeFileSync(join(home, "state", ".afk"), "");
    try {
      const result = run(getSnapshotCommand(home));
      expect([result.status, result.stdout.trim()]).toEqual([0, AWAY_MARKER]);
    } finally {
      rmSync(join(home, "state", ".afk"));
    }
  });

  it("runs show --full for a task id", () => {
    expect(lines(getRecordCommand(home, "t-1"))).toEqual(["show", "t-1", "--full"]);
  });

  it("sends a note body that has quotes, dollar signs and a leading dash as one argument", () => {
    const body = `[bearings panel] discuss prs t-1 - --force "$HOME" it's \`id\``;
    expect(lines(getNoteCommand(home, "req-1", body))).toEqual(["note", "--request-id", "req-1", "--", body]);
  });

  it("reports the exit code of the script", () => {
    writeScript("fm-inbox.sh", "exit 3");
    expect(run(getNoteCommand(home, "req-1", "x")).status).toBe(3);
  });
});
