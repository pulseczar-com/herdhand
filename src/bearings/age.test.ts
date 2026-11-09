import { getAgeText } from "./age";

describe("getAgeText", () => {
  it.each([
    [0, "0s ago"],
    [12_000, "12s ago"],
    [59_400, "59s ago"],
    [60_000, "1m ago"],
    [200_000, "3m ago"],
    [-5_000, "0s ago"],
  ])("shows %i ms as %s", (elapsed, expected) => {
    expect(getAgeText(1_000_000, 1_000_000 + elapsed)).toBe(expected);
  });
});
