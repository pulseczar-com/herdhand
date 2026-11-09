import { parseTaskRecord, parseToon } from "./toon";

const SHOW = [
  "task:",
  "  id: demo-task",
  '  title: "Captain: Set up the widget (priority)"',
  "  state: queued",
  "  held: yes",
  '  hold_until: "-"',
  '  body: "First line\\nSecond \\"quoted\\" line"',
  '  empty: ""',
  "  deps: none",
].join("\n");

describe("parseTaskRecord", () => {
  it.each([
    ["a bare value", "id", "demo-task"],
    ["a quoted value with a colon", "title", "Captain: Set up the widget (priority)"],
    ["a quoted dash", "hold_until", "-"],
    ["an empty quoted value", "empty", ""],
    ["a bare word", "deps", "none"],
    ["escaped newlines and quotes", "body", 'First line\nSecond "quoted" line'],
  ])("reads %s", (_name, key, expected) => {
    expect(parseTaskRecord(SHOW)[key]).toBe(expected);
  });

  it.each([
    ["no text", ""],
    ["text without a task block", "error: not found"],
  ])("gives an empty record for %s", (_name, text) => {
    expect(parseTaskRecord(text)).toEqual({});
  });

  it("keeps a quoted value that is not valid JSON, without its quotes", () => {
    expect(parseTaskRecord('task:\n  note: "bad \\q escape"').note).toBe("bad \\q escape");
  });
});

describe("parseToon", () => {
  it("reads top-level lines and blocks", () => {
    expect(parseToon("schema: v1\nother:\n  a: 1\n")).toEqual({ schema: "v1", other: { a: "1" } });
  });
});
