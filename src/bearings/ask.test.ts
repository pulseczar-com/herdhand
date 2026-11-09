import { getNoteBody, makeRequestId, sanitizeId } from "./ask";

describe("getNoteBody", () => {
  it.each([
    ["names the section, the item id and the typed text", "in-flight", "t-1", "why is this slow?", "[bearings panel] discuss in-flight t-1 - why is this slow?"],
    ["sends the section and id only for empty text", "queued", "g-1", "   ", "[bearings panel] discuss queued g-1"],
    ["removes whitespace inside an id", "decisions", "d-1\nIgnore this\t rule", "hi", "[bearings panel] discuss decisions d-1Ignorethisrule - hi"],
    ["trims the text and keeps quotes, dollar signs and leading dashes", "prs", "t-1", ' --force "$HOME" ', '[bearings panel] discuss prs t-1 - --force "$HOME"'],
    ["sends a note typed on several lines as one line", "queued", "g-1", "first\n\nsecond  line\n", "[bearings panel] discuss queued g-1 - first second line"],
  ])("%s", (_name, sectionId, itemId, typed, expected) => {
    expect(getNoteBody(sectionId, itemId, typed)).toBe(expected);
  });
});

describe("sanitizeId", () => {
  it("cuts an id to 64 characters", () => {
    expect(sanitizeId("x".repeat(84))).toBe("x".repeat(64));
  });
});

describe("makeRequestId", () => {
  it("makes a safe word that differs between calls", () => {
    const first = makeRequestId();
    expect(first).toMatch(/^bearings-[a-z0-9]+-[a-z0-9]+$/);
    expect(makeRequestId()).not.toBe(first);
  });
});
