import { parseStoredOrder, settleOrder } from "./order";

describe("settleOrder", () => {
  it.each([
    { when: "a new space", order: ["a", "b"], ids: ["a", "b", "c"], expected: ["a", "b", "c"] },
    { when: "new spaces, in Herdr's order", order: ["b"], ids: ["a", "b", "c"], expected: ["b", "a", "c"] },
    { when: "a closed space", order: ["a", "b", "c"], ids: ["a", "c"], expected: ["a", "c"] },
    { when: "no order yet", order: [], ids: ["a", "b"], expected: ["a", "b"] },
  ])("handles $when", ({ order, ids, expected }) => {
    expect(settleOrder(order, ids)).toEqual(expected);
  });

  it("returns the same array when nothing changes", () => {
    const order = ["a", "b"];
    expect(settleOrder(order, ["b", "a"])).toBe(order);
  });
});

describe("parseStoredOrder", () => {
  it.each([
    { when: "nothing stored", stored: null, expected: [] },
    { when: "an array", stored: JSON.stringify(["s2", "s1"]), expected: ["s2", "s1"] },
    { when: "an array with a value that is not an id", stored: JSON.stringify(["s2", 4, null]), expected: ["s2"] },
    { when: "text that is not JSON", stored: "{oops", expected: [] },
    { when: "an object, as an earlier version stored", stored: JSON.stringify({ children: { root: ["space:s1"] } }), expected: [] },
    { when: "a number", stored: "7", expected: [] },
  ])("reads $when", ({ stored, expected }) => {
    expect(parseStoredOrder(stored)).toEqual(expected);
  });
});
