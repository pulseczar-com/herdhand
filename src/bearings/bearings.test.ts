import fixture from "./fixtures/bearings.json";
import { getItem, getRepo, getRecordSignature, hasTaskRecord, prChip, readBearings, type Row, withoutEmptySections } from "./bearings";

const fixtureText = JSON.stringify(fixture);
const snapshotText = (extra: object) => JSON.stringify({ schema: "fm-bearings.v1", ...extra });
const sectionsOf = (text: string) => Object.fromEntries(readBearings(text).sections.map((section) => [section.id, section]));
const rowOf = (extra: Partial<Row>): Row => ({ itemId: "x", title: "T", detail: "", facts: [], ...extra });

describe("readBearings", () => {
  it("gives six sections with their counts", () => {
    const { sections } = readBearings(fixtureText);
    expect(sections.map((section) => section.title)).toEqual(["Waiting on you", "In flight", "PRs", "Secondmates", "Queued", "Landed"]);
    expect(Object.fromEntries(sections.map((section) => [section.id, section.count]))).toEqual({
      decisions: 1,
      "in-flight": 2,
      prs: 1,
      secondmates: 2,
      queued: 2,
      landed: 1,
    });
  });

  it("gives each section the tone of its accent bar", () => {
    expect(readBearings(fixtureText).sections.map((section) => section.tone)).toEqual(["danger", "active", "active", "neutral", "neutral", "success"]);
  });

  it("highlights Waiting on you only when it has rows", () => {
    expect(readBearings(fixtureText).sections[0].highlighted).toBe(true);
    expect(readBearings(snapshotText({})).sections[0].highlighted).toBe(false);
  });

  it("gives the unsupported state and no sections for an unknown schema", () => {
    expect(readBearings(JSON.stringify({ schema: "fm-bearings.v2" }))).toEqual({
      unsupported: "Unsupported bearings version (got fm-bearings.v2)",
      sections: [],
    });
  });

  it.each([
    ["missing keys", snapshotText({})],
    ["unknown keys", snapshotText({ future: [1, 2] })],
  ])("gives six empty sections for %s", (_name, text) => {
    const { sections } = readBearings(text);
    expect(sections).toHaveLength(6);
    expect(sections.every((section) => section.count === 0)).toBe(true);
  });

  it("throws on text that is not JSON", () => {
    expect(() => readBearings("not json")).toThrow();
  });

  it("leaves out unhealthy endpoints", () => {
    expect(readBearings(fixtureText)).not.toHaveProperty("health");
  });

  it("gives every row its item id", () => {
    expect(readBearings(fixtureText).sections.map((section) => section.rows.map((row) => row.itemId))).toEqual([
      ["d-1"],
      ["t-1", "t-2"],
      ["t-1"],
      ["sm-a", "sm-b"],
      ["g-1", "g-2"],
      ["t-0"],
    ]);
  });
});

describe("withoutEmptySections", () => {
  it("keeps only the sections with rows", () => {
    const text = snapshotText({ landed: [{ id: "t-0", what: "Widget docs" }] });
    expect(withoutEmptySections(readBearings(text).sections).map((section) => section.id)).toEqual(["landed"]);
  });
});

describe("rows", () => {
  it("gives an in-flight row a title, a repo and a status pill", () => {
    const rows = sectionsOf(fixtureText)["in-flight"].rows;
    expect(rows[0].title).toBe("Add widget cache");
    expect(rows[0].repo).toBe("example/widgets");
    expect(rows.map((row) => row.status)).toEqual([
      { text: "working", tone: "attention" },
      { text: "paused", tone: "neutral" },
    ]);
  });

  it("does not show a backend note of the snapshot", () => {
    const text = snapshotText({ in_flight: [{ id: "t", name: "Task", state: "unknown", repo: "a/b", doing: "backend target gone: x" }] });
    const [row] = sectionsOf(text)["in-flight"].rows;
    expect(row.detail).toBe("");
    expect([row.repo, row.status]).toEqual(["a/b", undefined]);
    expect(row.facts.map(([label]) => label)).not.toContain("Doing");
  });

  it("shows the Doing text once, as a field and not as the detail", () => {
    const doing = "PR https://github.com/o/r/pull/7 checks green";
    const [row] = sectionsOf(snapshotText({ in_flight: [{ id: "t", name: "Task", doing }] }))["in-flight"].rows;
    expect(row.detail).toBe("");
    expect(row.facts.filter(([label]) => label === "Doing")).toEqual([["Doing", doing]]);
  });

  it("gives a landed row a merged pill and a blocked gate a held pill", () => {
    const text = snapshotText({
      landed: [{ id: "l", what: "Done" }],
      gates: [{ id: "g", title: "Gate", blocked_by: "t-1" }, { id: "h", title: "Free", blocked_by: "-" }],
    });
    const sections = sectionsOf(text);
    expect(sections.landed.rows[0].status).toEqual({ text: "merged", tone: "success" });
    expect(sections.queued.rows.map((row) => row.status)).toEqual([{ text: "held", tone: "neutral" }, undefined]);
  });

  it("gives a queued row with no owner and no reason no detail", () => {
    const text = snapshotText({ gates: [{ title: "Task", owner: "(main)", reason: "-" }] });
    expect(sectionsOf(text).queued.rows[0].detail).toBe("");
  });

  it("flags an unreadable secondmate", () => {
    expect(sectionsOf(fixtureText).secondmates.rows.map((row) => row.flagged)).toEqual([false, true]);
  });

  it("lists the facts the snapshot has and skips empty ones", () => {
    const sections = sectionsOf(fixtureText);
    expect(sections["in-flight"].rows[1].facts).toEqual([
      ["Repo", "example/widgets"],
      ["State", "paused"],
      ["Doing", "waiting on CI"],
      ["Kind", "task"],
      ["Id", "t-2"],
    ]);
    expect(sections.queued.rows[0].facts).toEqual([["Owner", "fleet"], ["Filed", "2026-01-01"]]);
    expect(sections.decisions.rows[0].facts[0]).toEqual(["Question", "Which name for the widget? A or B."]);
  });

  it("titles a hold by its title alone, with a plain pill", () => {
    const decisions = [
      { id: "a", owner: "(main)", summary: "Captain: Widget setup for launch (priority): Captain does the widget setup by hand…", question: "Q" },
      { id: "b", owner: "(main)", summary: "Gizmo: patch the sites (captain hand task): Captain…", question: "Q" },
      { id: "c", owner: "(main)", summary: "Gizmo: patch acme-web and retire two old sites", question: "Q" },
    ];
    const rows = sectionsOf(snapshotText({ decisions_open: decisions })).decisions.rows;
    expect(rows.map((row) => row.title)).toEqual([
      "Widget setup for launch (priority)",
      "Gizmo: patch the sites (captain hand task)",
      "Gizmo: patch acme-web and retire two old sites",
    ]);
    expect(rows.map((row) => row.status?.text)).toEqual(["decision", "hand task", "decision"]);
    expect(rows.map((row) => row.status?.tone)).toEqual(["danger", "neutral", "danger"]);
    expect(rows.some((row) => row.facts.some(([, value]) => value.includes("(main)")))).toBe(false);
  });
});

describe("PR rows", () => {
  it("title a PR by its task and give it a chip and a URL", () => {
    const [row] = sectionsOf(fixtureText).prs.rows;
    expect(row.title).toBe("Add widget cache");
    expect(row.pr).toEqual({ label: "PR #7", repo: "widgets" });
    expect(row.url).toBe("https://example.com/widgets/pull/7");
    expect(sectionsOf(fixtureText)["in-flight"].rows[0].url).toBeUndefined();
  });

  it.each([
    ["a pull URL", "https://github.com/o/r/pull/12", { label: "PR #12", repo: "o/r" }],
    ["a URL with no pull number", "https://example.com/x", { label: "PR", repo: "" }],
    ["no URL", undefined, { label: "PR", repo: "" }],
  ])("make a chip from %s", (_name, url, expected) => {
    expect(prChip(url)).toEqual(expected);
  });
});

describe("getItem", () => {
  it("gives the record's full title and every field, then the snapshot fields it lacks", () => {
    const row = rowOf({ title: "Add widget c…", facts: [["Repo", "example/widgets"], ["State", "working"], ["Doing", "writing tests"]] });
    const record = { id: "t-1", title: "Captain: Add widget cache, with a long name that the snapshot cut", state: "working", deps: "none", closed: "-", note: "" };
    expect(getItem(row, record)).toEqual({
      title: "Add widget cache, with a long name that the snapshot cut",
      fields: [["id", "t-1"], ["state", "working"], ["Doing", "writing tests"]],
    });
  });

  it("keeps the snapshot title and fields when there is no record", () => {
    const row = rowOf({ title: "Add widget cache", facts: [["Repo", "example/widgets"], ["Kind", "none"], ["Id", "t-9"]] });
    expect(getItem(row, undefined)).toEqual({ title: "Add widget cache", fields: [["Id", "t-9"]] });
    expect(getItem(row, {}).title).toBe("Add widget cache");
  });

  it("does not repeat a snapshot field the record has in another spelling", () => {
    const row = rowOf({ facts: [["Blocked by", "x"], ["Owner", "fleet"]] });
    expect(getItem(row, { blocked_by: "y" }).fields).toEqual([["blocked_by", "y"], ["Owner", "fleet"]]);
  });

  it("leaves out the fields the item shows in its own way", () => {
    const row = rowOf({
      status: { text: "working", tone: "attention" },
      pr: { label: "PR #1", repo: "o/r" },
      url: "https://github.com/o/r/pull/1",
      facts: [["Repo", "o/r"], ["State", "working"], ["Doing", "x"]],
    });
    const record = { id: "t-1", title: "T", name: "T", summary: "s", what: "w", repo: "o/r", state: "working", pr: "https://github.com/o/r/pull/1", kind: "ship" };
    expect(getItem(row, record).fields).toEqual([["id", "t-1"], ["kind", "ship"], ["Doing", "x"]]);
  });

  it("keeps a state it does not show as a pill, and leaves out the state unknown", () => {
    expect(getItem(rowOf({ facts: [["State", "paused"]] }), undefined).fields).toEqual([["State", "paused"]]);
    expect(getItem(rowOf({ facts: [["State", "unknown"]] }), undefined).fields).toEqual([]);
  });

  it("shows the id once on a PR item and never repeats the chip, its URL or the pill", () => {
    const url = "https://github.com/example/acme-api/pull/12";
    const [row] = sectionsOf(snapshotText({ recorded_prs: [{ id: "t-1", url }] })).prs.rows;
    const record = { id: "t-1", state: "in_flight", pr: "PR #12", links: `pr:${url}`, kind: "ship" };
    expect(getItem(row, record).fields).toEqual([["id", "t-1"], ["state", "in_flight"], ["links", `pr:${url}`], ["kind", "ship"]]);
  });

  it("drops a field that repeats the pill or the repo, whatever its key", () => {
    const row = rowOf({ status: { text: "working", tone: "attention" }, repo: "acme-api" });
    expect(getItem(row, { id: "t-1", phase: "working", home: "acme-api", kind: "ship" }).fields).toEqual([["id", "t-1"], ["kind", "ship"]]);
  });

  it("drops a badge whose value another field already has, and keeps the id", () => {
    const row = rowOf({ facts: [["Task", "t-1"], ["Owner", "bo"]] });
    expect(getItem(row, { kind: "ship", id: "t-1", name2: "ship" }).fields).toEqual([["kind", "ship"], ["id", "t-1"], ["Owner", "bo"]]);
  });

  it("lets yes, no and date values repeat across fields", () => {
    const record = { held: "yes", blocked: "yes", created: "2030-06-12", filed: "2030-06-12" };
    expect(getItem(rowOf({}), record).fields).toEqual(Object.entries(record));
  });
});

describe("getRepo", () => {
  it.each([
    ["the PR's repo before the row's and the record's", rowOf({ pr: { label: "PR", repo: "o/pr" }, repo: "o/snap" }), { repo: "rec" }, "pr"],
    ["the row's repo before the record's", rowOf({ repo: "o/snap" }), { repo: "rec" }, "snap"],
    ["the record's repo for a landed row, never a URL", rowOf({ url: "https://github.com/o/from-url/pull/1" }), { repo: "example-repo" }, "example-repo"],
    ["nothing for a record repo of a dash", rowOf({}), { repo: "-" }, ""],
    ["nothing with no record", rowOf({}), undefined, ""],
    ["only the repo part of an owner/repo name", rowOf({ repo: "example/acme-api" }), undefined, "acme-api"],
  ])("uses %s", (_name, row, record, expected) => {
    expect(getRepo(row, record)).toBe(expected);
  });
});

describe("task records", () => {
  it("has none for secondmates and one for every other section", () => {
    expect(readBearings(fixtureText).sections.map((section) => hasTaskRecord(section.id))).toEqual([true, true, true, false, true, true]);
  });

  it("changes the signature when the row changes", () => {
    const row = rowOf({ facts: [["Doing", "a"]] });
    const changed = rowOf({ facts: [["Doing", "b"]] });
    expect(getRecordSignature("in-flight", row)).toBe(getRecordSignature("in-flight", rowOf({ facts: [["Doing", "a"]] })));
    expect(getRecordSignature("in-flight", row)).not.toBe(getRecordSignature("in-flight", changed));
  });
});
