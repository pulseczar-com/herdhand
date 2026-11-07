import { parsePairingCode } from "./code";

const FINGERPRINT_A = "Pyv+eAokr8pVq7UlZDh5pcC2Y8WEwixa/EggUE5onCY";
const FINGERPRINT_B = "V311Nz7RqHdCHVkqfyuftsFVnYAYUsuul3gUvrcpAyk";
const SEED = "97euG5HHLuy/eBOcuVdI5FMNmbvJamqlpuwAUitcymo";
const EXPIRES_AT_SECONDS = 1794076515;

const FIELDS: Record<string, string> = {
  v: "1",
  n: "test-box",
  u: "test-user",
  a: "test-box.example.com",
  p: "2222",
  k: `${FINGERPRINT_A},${FINGERPRINT_B}`,
  c: SEED,
  x: String(EXPIRES_AT_SECONDS),
};

function makeLink(changes: Record<string, string | null> = {}): string {
  const fields = { ...FIELDS, ...changes };
  const query = Object.entries(fields)
    .filter((entry): entry is [string, string] => entry[1] !== null)
    .map(([name, value]) => `${name}=${value}`)
    .join("&");
  return `herdhand://pair?${query}`;
}

const DAMAGED = { error: "This pairing code is damaged. Run the command again." };

describe("parsePairingCode", () => {
  it("reads every field, keeping + in base64 as it is", () => {
    expect(parsePairingCode(makeLink())).toEqual({
      name: "test-box",
      user: "test-user",
      host: "test-box.example.com",
      port: 2222,
      hostKeyFingerprints: [`SHA256:${FINGERPRINT_A}`, `SHA256:${FINGERPRINT_B}`],
      oneTimeKeySeed: SEED,
    });
  });

  it.each([
    ["a user name with a space", { u: "test%20user" }, { user: "test user" }],
    ["a name with an ampersand", { n: "lab%26test" }, { name: "lab&test" }],
    ["an IPv6 address", { a: "2001%3Adb8%3A%3A1" }, { host: "2001:db8::1" }],
  ])("decodes %s", (_case, changes, expected) => {
    expect(parsePairingCode(makeLink(changes))).toMatchObject(expected);
  });

  it.each([
    ["a web address", "https://example.com/?v=1"],
    ["plain text", "hello"],
    ["another Herdhand link", "herdhand://open?v=1"],
  ])("refuses %s", (_case, text) => {
    expect(parsePairingCode(text)).toEqual({ error: "This is not a Herdhand pairing code." });
  });

  it("asks for a newer app for a code of a later version", () => {
    expect(parsePairingCode(makeLink({ v: "2" }))).toEqual({
      error: "This pairing code needs a newer version of Herdhand.",
    });
  });

  it.each([
    ["no user", { u: null }],
    ["no address", { a: null }],
    ["no host keys", { k: "" }],
    ["a short host key fingerprint", { k: "abc" }],
    ["a seed of the wrong length", { c: "abc" }],
    ["a port out of range", { p: "70000" }],
    ["a port that is not a number", { p: "ssh" }],
    ["bad percent encoding", { n: "%E0%A4%A" }],
  ])("refuses a code with %s", (_case, changes) => {
    expect(parsePairingCode(makeLink(changes))).toEqual(DAMAGED);
  });

  it("uses the address as the name when the name is empty", () => {
    expect(parsePairingCode(makeLink({ n: "" }))).toMatchObject({ name: "test-box.example.com" });
  });
});
