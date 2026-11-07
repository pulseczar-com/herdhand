import { type ChildProcess, spawn, spawnSync } from "child_process";
import { createPrivateKey, createPublicKey, generateKeyPairSync } from "crypto";
import { chmodSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir, userInfo } from "os";
import { dirname, join } from "path";

import jsQR from "jsqr";

import { parsePairingCode } from "@/pairing/code";

const SCRIPT = join(__dirname, "pair.sh");
const SCRIPT_TIMEOUT_MS = 20_000;
const MODULE_PIXELS = 4;
const LIGHT_TOP = new Set(["█", "▀"]);
const LIGHT_BOTTOM = new Set(["█", "▄"]);
const QR_CHARACTERS = /[█▀▄]/;
// PKCS#8 wrapping of a raw 32-byte Ed25519 seed.
const ED25519_PKCS8_PREFIX = Buffer.from("302e020100300506032b657004220420", "hex");

let workDir: string;

beforeEach(() => {
  workDir = mkdtempSync(join(tmpdir(), "pair-test-"));
});

afterEach(() => {
  rmSync(workDir, { recursive: true, force: true });
});

/** Reads the half-block QR code in the script's output, white on black, as jsQR does a photo. */
function decodeQr(output: string): string | null {
  const rows = output
    .replace(/\x1b\[[0-9;]*m/g, "")
    .split("\n")
    .filter((line) => QR_CHARACTERS.test(line))
    .map((line) => [...line]);
  const width = rows[0].length * MODULE_PIXELS;
  const height = rows.length * 2 * MODULE_PIXELS;
  const pixels = new Uint8ClampedArray(width * height * 4);
  rows.forEach((row, rowIndex) =>
    row.forEach((character, column) => {
      const halves = [LIGHT_TOP.has(character), LIGHT_BOTTOM.has(character)];
      halves.forEach((isLight, half) => {
        for (let dy = 0; dy < MODULE_PIXELS; dy++) {
          for (let dx = 0; dx < MODULE_PIXELS; dx++) {
            const y = (rowIndex * 2 + half) * MODULE_PIXELS + dy;
            const at = (y * width + column * MODULE_PIXELS + dx) * 4;
            pixels.fill(isLight ? 255 : 0, at, at + 3);
            pixels[at + 3] = 255;
          }
        }
      });
    }),
  );
  return jsQR(pixels, width, height)?.data ?? null;
}

describe("the awk QR encoder", () => {
  const awks = findAwks();
  const payloads = [
    ["version 1", "herdhand"],
    ["two blocks", "x".repeat(60)],
    ["version information", "y".repeat(140)],
    // Three host keys and long names: about the longest link a machine gives.
    ["a long link", `herdhand://pair?v=1&k=${"a+/b".repeat(40)}&c=${"s".repeat(43)}`],
  ];
  let functions: string;

  beforeAll(() => {
    functions = writeFunctionsOnly();
  });

  afterAll(() => {
    const folders = [dirname(functions), ...awks.map(([, bin]) => bin)];
    folders.forEach((folder) => rmSync(folder, { recursive: true, force: true }));
  });

  it("runs on at least one awk", () => {
    expect(awks.length).toBeGreaterThan(0);
  });

  describe.each(awks)("with %s", (name, bin) => {
    it.each(payloads)("draws a code that decodes: %s", (_case, payload) => {
      const result = spawnSync("sh", ["-c", '. "$1"; draw_qr_with_awk "$2"', "sh", functions, payload], {
        encoding: "utf8",
        env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
      });

      expect(result.stderr).toBe("");
      expect(decodeQr(result.stdout)).toBe(payload);
    });
  });

  /** Each awk on this machine, as a folder whose `awk` runs it. */
  function findAwks(): [string, string][] {
    const found: [string, string][] = [];
    for (const name of ["mawk", "nawk", "gawk", "original-awk", "busybox"]) {
      const path = spawnSync("sh", ["-c", `command -v ${name}`], { encoding: "utf8" }).stdout.trim();
      if (!path) continue;
      const bin = mkdtempSync(join(tmpdir(), `awk-${name}-`));
      const run = name === "busybox" ? `exec ${path} awk "$@"` : `exec ${path} "$@"`;
      writeFileSync(join(bin, "awk"), `#!/bin/sh\n${run}\n`);
      chmodSync(join(bin, "awk"), 0o755);
      found.push([name, bin]);
    }
    return found;
  }
});

// The full run needs this machine's SSH host keys and ssh-keygen, as a real host has.
const hasHostKeys =
  existsSync("/etc/ssh") && readdirSync("/etc/ssh").some((name) => /^ssh_host_.*_key\.pub$/.test(name));
const hasSshKeygen = spawnSync("sh", ["-c", "command -v ssh-keygen"]).status === 0;
const describeWithSsh = hasHostKeys && hasSshKeygen ? describe : describe.skip;

describeWithSsh("a pairing run", () => {
  const OLD_LINE = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOldKeyStaysHereOldKeyStaysHereOldKeyStay old";
  let home: string;
  let authorizedKeys: string;

  beforeEach(() => {
    home = join(workDir, "home");
    authorizedKeys = join(home, ".ssh", "authorized_keys");
    spawnSync("mkdir", ["-p", dirname(authorizedKeys)]);
    // No newline at the end, as an editor can leave it.
    writeFileSync(authorizedKeys, OLD_LINE);
  });

  it("shows a code whose one-time key matches the line it installs, and removes it when stopped", async () => {
    const run = startScript();
    const output = await run.waitFor("Waiting for the phone.");
    const code = parsePairingCode(decodeQr(output) ?? "");
    const oneTimeLine = readOneTimeLine();

    expect(code).toMatchObject({ host: "192.0.2.10", port: 2222, user: userInfo().username });
    if ("error" in code) return;
    expect(code.hostKeyFingerprints).toHaveLength(countHostKeys());
    expect(publicKeyFromSeed(code.oneTimeKeySeed)).toEqual(oneTimeLine.publicKey);

    run.process.kill("SIGTERM");
    const { code: exitCode } = await run.exit;

    expect(exitCode).toBe(143);
    expect(readFileSync(authorizedKeys, "utf8")).toBe(`${OLD_LINE}\n`);
    expect(existsSync(dirname(oneTimeLine.pendingFile))).toBe(false);
  }, SCRIPT_TIMEOUT_MS);

  it("adds the phone key once, removes the one-time line and says which phone paired", async () => {
    const run = startScript();
    await run.waitFor("Waiting for the phone.");
    const oneTimeLine = readOneTimeLine();
    const phoneLine = makePhoneKeyLine();

    expect(runForcedCommand(oneTimeLine.command, phoneLine).status).toBe(0);
    expect(runForcedCommand(oneTimeLine.command, phoneLine).status).not.toBe(0);
    const { code, output } = await run.exit;

    expect(code).toBe(0);
    expect(output).toMatch(/Paired: herdhand-Test-2026-11-07 \(SHA256:[A-Za-z0-9+/]+\)/);
    expect(readFileSync(authorizedKeys, "utf8")).toBe(`${OLD_LINE}\n${phoneLine}\n`);
    expect(existsSync(dirname(oneTimeLine.pendingFile))).toBe(false);
  }, SCRIPT_TIMEOUT_MS);

  it("refuses a line that is not a phone key and leaves authorized_keys as it was", async () => {
    const run = startScript();
    await run.waitFor("Waiting for the phone.");

    runForcedCommand(readOneTimeLine().command, "ssh-ed25519 AAAA herdhand-x; rm -rf ~");
    const { code } = await run.exit;

    expect(code).not.toBe(0);
    expect(readFileSync(authorizedKeys, "utf8")).toBe(`${OLD_LINE}\n`);
  }, SCRIPT_TIMEOUT_MS);

  function startScript() {
    // A new session has no terminal, so the script skips its window size check.
    const child: ChildProcess = spawn("sh", [SCRIPT], {
      detached: true,
      env: { ...process.env, HOME: home, SSH_CONNECTION: "192.0.2.1 50000 192.0.2.10 2222" },
    });
    let output = "";
    child.stdout?.on("data", (data: Buffer) => (output += data.toString()));
    child.stderr?.on("data", (data: Buffer) => (output += data.toString()));
    const exit = new Promise<{ code: number | null; output: string }>((resolve) =>
      child.on("exit", (code) => resolve({ code, output })),
    );
    return {
      process: child,
      exit,
      waitFor: (text: string) =>
        new Promise<string>((resolve) => {
          const check = () => (output.includes(text) ? resolve(output) : setTimeout(check, 50));
          check();
        }),
    };
  }

  /** The one-time line's forced command, its pending file and its key. */
  function readOneTimeLine() {
    const line = readFileSync(authorizedKeys, "utf8")
      .split("\n")
      .find((candidate) => candidate.startsWith("command="));
    if (!line) throw new Error("No one-time line in authorized_keys");
    const command = line.slice('command="'.length, line.indexOf('",')).replace(/\\"/g, '"');
    const pendingFile = command.match(/> (\S+)'$/)?.[1] ?? "";
    const blob = Buffer.from(line.split(" ").at(-2) ?? "", "base64");
    return { command, pendingFile, publicKey: blob.subarray(blob.length - 32) };
  }

});

/** Runs a forced command as sshd does, with the phone's line as the command it was sent. */
function runForcedCommand(command: string, phoneLine: string) {
  return spawnSync("sh", ["-c", command], { env: { ...process.env, SSH_ORIGINAL_COMMAND: phoneLine } });
}

/** The script without its last line, so a shell can load its functions without running it. */
function writeFunctionsOnly(): string {
  const script = readFileSync(SCRIPT, "utf8");
  const path = join(mkdtempSync(join(tmpdir(), "pair-functions-")), "functions.sh");
  writeFileSync(path, script.replace(/\nmain "\$@"\n?$/, "\n"));
  return path;
}

function countHostKeys(): number {
  return readdirSync("/etc/ssh").filter((name) => /^ssh_host_.*_key\.pub$/.test(name)).length;
}

function publicKeyFromSeed(seedBase64: string): Buffer {
  const seed = Buffer.from(seedBase64, "base64");
  const privateKey = createPrivateKey({ key: Buffer.concat([ED25519_PKCS8_PREFIX, seed]), format: "der", type: "pkcs8" });
  const spki = createPublicKey(privateKey).export({ format: "der", type: "spki" });
  return spki.subarray(spki.length - 32);
}

function makePhoneKeyLine(): string {
  const { publicKey } = generateKeyPairSync("ed25519");
  const spki = publicKey.export({ format: "der", type: "spki" });
  const raw = spki.subarray(spki.length - 32);
  const blob = Buffer.concat([sshString(Buffer.from("ssh-ed25519")), sshString(raw)]);
  return `ssh-ed25519 ${blob.toString("base64")} herdhand-Test-2026-11-07`;
}

function sshString(value: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(value.length);
  return Buffer.concat([length, value]);
}
