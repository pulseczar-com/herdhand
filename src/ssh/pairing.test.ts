import Ssh from "../../modules/ssh";

import type { PairingCode } from "@/pairing/code";

import { ConnectError } from "./errors";
import { getPhoneKey, pairMachine } from "./pairing";

jest.mock("../../modules/ssh", () => ({ getPhoneKey: jest.fn(), pair: jest.fn() }));

const PUBLIC_KEY = "ecdsa-sha2-nistp256 AAAAE2VjZHNh";
const CREATED_AT = Date.UTC(2026, 10, 7);
const COMMENT_PATTERN = /^herdhand-[A-Za-z0-9._-]+-2026-11-07$/;

const code: PairingCode = {
  name: "test-box",
  user: "test-user",
  host: "test-box.example.com",
  port: 22,
  hostKeyFingerprints: ["SHA256:a", "SHA256:b"],
  oneTimeKeySeed: "seed",
  expiresAt: CREATED_AT,
};

beforeEach(() => {
  jest.mocked(Ssh.getPhoneKey).mockResolvedValue({ publicKey: PUBLIC_KEY, fingerprint: "SHA256:phone", createdAt: CREATED_AT });
  jest.mocked(Ssh.pair).mockResolvedValue("SHA256:a");
});

describe("getPhoneKey", () => {
  it("names the key for the phone and the day it was made", async () => {
    const phoneKey = await getPhoneKey();

    expect(phoneKey.comment).toMatch(COMMENT_PATTERN);
    expect(phoneKey).toMatchObject({ fingerprint: "SHA256:phone", line: `${PUBLIC_KEY} ${phoneKey.comment}` });
  });
});

describe("pairMachine", () => {
  it("sends the phone key line to the address in the form, trusting only the code's host keys", async () => {
    const target = { host: "192.0.2.10", port: 2222, user: "other-user" };

    expect(await pairMachine(code, target)).toBe("SHA256:a");

    expect(Ssh.pair).toHaveBeenCalledWith({
      ...target,
      hostKeyFingerprints: ["SHA256:a", "SHA256:b"],
      oneTimeKeySeed: "seed",
      phoneKeyLine: expect.stringMatching(new RegExp(`^${PUBLIC_KEY} herdhand-`)),
    });
  });

  it("rejects with a ConnectError", async () => {
    jest.mocked(Ssh.pair).mockRejectedValue(Object.assign(new Error("refused"), { code: "PAIRING_REFUSED" }));

    const failure = pairMachine(code, code);

    await expect(failure).rejects.toBeInstanceOf(ConnectError);
    await expect(failure).rejects.toMatchObject({ reason: "pairingRefused" });
  });
});
