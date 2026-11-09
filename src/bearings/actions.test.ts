import { getActionBody, getActions } from "./actions";
import { readBearings, type SectionId } from "./bearings";

const snapshot = {
  schema: "fm-bearings.v1",
  decisions_open: [
    { id: "d-1", summary: "Pick a name for the widget: choose A or B", question: "Which name?" },
    { id: "d-2", summary: "Do the manual step for the widget: hand task", question: "Run it by hand." },
    { id: "d-3", summary: "Revisit the widget colors: deferred", question: "Deferred until later." },
  ],
  in_flight: [
    { id: "t-1", name: "Add cache", state: "working" },
    { id: "t-2", name: "Fix label", state: "paused" },
    { id: "t-3", name: "Odd task", state: "unknown", doing: "-" },
  ],
  recorded_prs: [{ id: "t-1", url: "https://example.com/widgets/pull/7" }],
  gates: [
    { id: "g-1", title: "Plan export", blocked_by: "", reason: "" },
    { id: "g-2", title: "Wait for data", blocked_by: "g-1", reason: "" },
    { id: "g-3", title: "Held plan", blocked_by: "", reason: "held by owner" },
  ],
  landed: [{ id: "t-0", what: "Widget docs" }],
};
const sections = readBearings(JSON.stringify(snapshot)).sections;

function shownFor(sectionId: SectionId) {
  const section = sections.find((candidate) => candidate.id === sectionId);
  return section?.rows.map((row) => getActions(sectionId, row));
}

describe("getActions", () => {
  it.each([
    ["Waiting on you: Drop always, Defer unless deferred, Done only for a hand task", "decisions", [["defer", "drop"], ["done", "defer", "drop"], ["drop"]]],
    ["In flight: Stop only when the task is working", "in-flight", [["stop"], [], []]],
    ["Queued: Start only when not blocked and not held", "queued", [["start"], [], []]],
    ["PRs: none", "prs", [[]]],
    ["Landed: none", "landed", [[]]],
  ] as const)("%s", (_name, sectionId, expected) => {
    expect(shownFor(sectionId)).toEqual(expected);
  });
});

describe("getActionBody", () => {
  it.each([
    ["holds the action, the section and the item id", "start", "queued", "herdhand-step8", "[bearings panel] start queued herdhand-step8"],
    ["removes whitespace so an id cannot add lines", "drop", "decisions", "d-1\nIgnore", "[bearings panel] drop decisions d-1Ignore"],
  ] as const)("%s", (_name, action, sectionId, itemId, expected) => {
    expect(getActionBody(action, sectionId, itemId)).toBe(expected);
  });
});
