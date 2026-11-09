import { PAIR_COMMAND } from "./command";

describe("PAIR_COMMAND", () => {
  it("fetches the pairing script from the main branch", () => {
    expect(PAIR_COMMAND).toBe(
      "curl -fsSL https://raw.githubusercontent.com/pulseczar-com/herdhand/main/scripts/pair.sh | sh",
    );
  });
});
