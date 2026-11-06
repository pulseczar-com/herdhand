import { RequestTimeoutError } from "@/rpc/client";

import { ConnectError, describeConnectError, toConnectError } from "./errors";

const machine = { name: "test-box", host: "test-box.example.com" };

function nativeError(code: string, message: string) {
  return Object.assign(new Error(message), { code });
}

describe("toConnectError", () => {
  it.each([
    { error: nativeError("HOST_KEY_UNKNOWN", "SHA256:abc"), reason: "hostKeyUnknown", fingerprint: "SHA256:abc" },
    { error: nativeError("HOST_KEY_CHANGED", "SHA256:new"), reason: "hostKeyChanged", fingerprint: "SHA256:new" },
    {
      error: nativeError(
        "HOST_KEY_UNKNOWN",
        "Call to function 'Ssh.connect' has been rejected.\n→ Caused by: SHA256:ab+c/12",
      ),
      reason: "hostKeyUnknown",
      fingerprint: "SHA256:ab+c/12",
    },
    {
      error: nativeError(
        "HOST_KEY_CHANGED",
        "Call to function 'Ssh.connect' has been rejected.\n→ Caused by: SHA256:new",
      ),
      reason: "hostKeyChanged",
      fingerprint: "SHA256:new",
    },
    { error: nativeError("HOST_KEY_UNKNOWN", "no key here"), reason: "hostKeyUnknown", fingerprint: undefined },
    { error: nativeError("AUTH_FAILED", "Login failed"), reason: "loginFailed", fingerprint: undefined },
    { error: nativeError("UNREACHABLE", "timeout"), reason: "unreachable", fingerprint: undefined },
    { error: new RequestTimeoutError("hello"), reason: "noReply", fingerprint: undefined },
    { error: new Error("something else"), reason: "other", fingerprint: undefined },
  ])("maps $reason", ({ error, reason, fingerprint }) => {
    const converted = toConnectError(error);

    expect(converted.reason).toBe(reason);
    expect(converted.fingerprint).toBe(fingerprint);
  });

  it.each([
    { raw: "no common algorithm", expected: "no common algorithm" },
    {
      raw: "Call to function 'Ssh.connect' has been rejected.\n→ Caused by: no common algorithm",
      expected: "no common algorithm",
    },
  ])("keeps only the cause in the message of $raw", ({ raw, expected }) => {
    const converted = toConnectError(nativeError("SSH_ERROR", raw));

    expect(converted.reason).toBe("other");
    expect(converted.message).toBe(expected);
  });

  it("keeps an error that is already a ConnectError", () => {
    const error = new ConnectError("herdrNotFound", "none");

    expect(toConnectError(error)).toBe(error);
  });
});

describe("describeConnectError", () => {
  it.each([
    { reason: "loginFailed", expected: "Login failed. Check the user name and password." },
    { reason: "unreachable", expected: "Cannot reach test-box.example.com." },
    { reason: "herdrNotFound", expected: "No Herdr found on test-box." },
    { reason: "noReply", expected: "Herdr on test-box did not answer." },
    { reason: "hostKeyUnknown", expected: "The host key of test-box.example.com is not trusted yet." },
    {
      reason: "hostKeyChanged",
      expected: "The host key of test-box.example.com has changed. Herdhand will not connect.",
    },
    { reason: "closed", expected: "The connection to test-box closed: reset by peer" },
    { reason: "other", expected: "reset by peer" },
  ] as const)("describes $reason", ({ reason, expected }) => {
    const error = new ConnectError(reason, "reset by peer");

    expect(describeConnectError(error, machine)).toBe(expected);
  });
});
