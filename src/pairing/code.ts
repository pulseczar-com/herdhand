/**
 * What a pairing code from `scripts/pair.sh` holds: where the machine is, its host keys, and a
 * one-time key that the machine accepts once, until the code expires.
 */
export type PairingCode = {
  name: string;
  user: string;
  host: string;
  port: number;
  /** "SHA256:..." fingerprints of every host key the machine has. */
  hostKeyFingerprints: string[];
  /** The one-time key's 32-byte Ed25519 seed, in base64. */
  oneTimeKeySeed: string;
  /** In milliseconds since 1970. */
  expiresAt: number;
};

const PREFIX = "herdhand://pair?";
const VERSION = "1";
// 32 bytes in base64 without padding: a SHA-256 fingerprint, or an Ed25519 seed.
const BASE64_32_BYTES = /^[A-Za-z0-9+/]{43}$/;
const MAX_PORT = 65535;
const MS_PER_SECOND = 1000;

const NOT_A_CODE = { error: "This is not a Herdhand pairing code." };
const NEWER_VERSION = { error: "This pairing code needs a newer version of Herdhand." };
const DAMAGED = { error: "This pairing code is damaged. Run the command again." };

/**
 * Reads a scanned pairing code: `herdhand://pair?v=1&n=&u=&a=&p=&k=&c=&x=`. The name, user and
 * address are percent-encoded. Base64 values keep their "+", so a "+" never means a space here.
 */
export function parsePairingCode(text: string): PairingCode | { error: string } {
  if (!text.startsWith(PREFIX)) return NOT_A_CODE;
  const fields = readFields(text.slice(PREFIX.length));
  if (!fields) return DAMAGED;
  if (fields.get("v") !== VERSION) return NEWER_VERSION;

  const user = fields.get("u");
  const host = fields.get("a");
  const port = Number(fields.get("p"));
  const fingerprints = (fields.get("k") ?? "").split(",");
  const seed = fields.get("c") ?? "";
  const expiresAt = Number(fields.get("x"));
  const isValid =
    !!user &&
    !!host &&
    Number.isInteger(port) &&
    port >= 1 &&
    port <= MAX_PORT &&
    fingerprints.every((fingerprint) => BASE64_32_BYTES.test(fingerprint)) &&
    BASE64_32_BYTES.test(seed) &&
    Number.isInteger(expiresAt) &&
    expiresAt > 0;
  if (!isValid) return DAMAGED;

  return {
    name: fields.get("n") || host,
    user,
    host,
    port,
    hostKeyFingerprints: fingerprints.map((fingerprint) => `SHA256:${fingerprint}`),
    oneTimeKeySeed: seed,
    expiresAt: expiresAt * MS_PER_SECOND,
  };
}

export function isExpired(code: Pick<PairingCode, "expiresAt">, now: number): boolean {
  return now >= code.expiresAt;
}

// React Native's URLSearchParams lacks `get`, and it would turn "+" into a space.
function readFields(query: string): Map<string, string> | null {
  const fields = new Map<string, string>();
  for (const pair of query.split("&")) {
    const at = pair.indexOf("=");
    if (at === -1) continue;
    try {
      fields.set(pair.slice(0, at), decodeURIComponent(pair.slice(at + 1)));
    } catch {
      return null;
    }
  }
  return fields;
}
