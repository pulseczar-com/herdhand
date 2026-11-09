import { getAgeText } from "./age";

describe("getAgeText", () => {
  it.each([
    [0, "0 s ago"],
    [12_000, "12 s ago"],
    [59_400, "59 s ago"],
    [60_000, "1 min ago"],
    [200_000, "3 min ago"],
    [-5_000, "0 s ago"],
  ])("shows %i ms as %s", (elapsed, expected) => {
    expect(getAgeText(1_000_000, 1_000_000 + elapsed)).toBe(expected);
  });
});
