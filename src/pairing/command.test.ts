import { makePairCommand } from "./command";

describe("makePairCommand", () => {
  it("fetches the script of the app's release", () => {
    expect(makePairCommand("1.2.0")).toBe(
      "curl -fsSL https://raw.githubusercontent.com/pulseczar-com/herdhand/v1.2.0/scripts/pair.sh | sh",
    );
  });
});
