import { HERDR_KINDS, KIND_LABELS } from "./kinds";

describe("KIND_LABELS", () => {
  it("names each kind as Herdr's two front ends", () => {
    expect(HERDR_KINDS.map((kind) => KIND_LABELS[kind])).toEqual(["Herdr App", "Herdr TUI"]);
  });
});
