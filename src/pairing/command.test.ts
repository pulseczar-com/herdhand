import { makePairCommand } from "./command";

describe("makePairCommand", () => {
  it.each([
    ["a release", "1.2.0", "https://raw.githubusercontent.com/pulseczar-com/herdhand/v1.2.0/scripts/pair.sh"],
    ["no known version", null, "https://raw.githubusercontent.com/pulseczar-com/herdhand/main/scripts/pair.sh"],
  ])("fetches the script of %s", (_case, version, url) => {
    expect(makePairCommand(version)).toBe(`curl -fsSL ${url} | sh`);
  });
});
