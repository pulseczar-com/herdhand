import { RETRY_MS, shouldFetchRecord } from "./records";

describe("shouldFetchRecord", () => {
  it.each([
    ["no cached record", undefined, "s1", 0, true],
    ["an unchanged record", { signature: "s1", record: {} }, "s1", 0, false],
    ["a record for an older signature", { signature: "s1", record: {} }, "s2", 0, true],
    ["a failure before the retry wait", { signature: "s1", failedAt: 1000 }, "s1", 1000 + RETRY_MS - 1, false],
    ["a failure at the retry wait", { signature: "s1", failedAt: 1000 }, "s1", 1000 + RETRY_MS, true],
  ])("for %s", (_name, entry, signature, now, expected) => {
    expect(shouldFetchRecord(entry, signature, now)).toBe(expected);
  });
});
