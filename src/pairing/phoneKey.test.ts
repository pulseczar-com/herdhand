import { makePhoneKeyComment } from "./phoneKey";

const CREATED_AT = Date.UTC(2026, 10, 7, 23, 30);

describe("makePhoneKeyComment", () => {
  it.each([
    ["a plain model", "Pixel8", "herdhand-Pixel8-2026-11-07"],
    ["spaces", "Pixel 8 Pro", "herdhand-Pixel-8-Pro-2026-11-07"],
    ["other characters", "SM-S918B (Galaxy)", "herdhand-SM-S918B-Galaxy-2026-11-07"],
    ["dots and underscores", "moto_g.5", "herdhand-moto_g.5-2026-11-07"],
    ["no usable characters", "???", "herdhand-phone-2026-11-07"],
    ["no model", undefined, "herdhand-phone-2026-11-07"],
  ])("names the key for %s", (_case, model, expected) => {
    expect(makePhoneKeyComment(model, CREATED_AT)).toBe(expected);
  });
});
