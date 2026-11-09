import { getItem } from "./bearings";
import { getLabel, getLink, getRelativeDate, getTypedFields } from "./fields";
import { parseTaskRecord } from "./toon";

const NOW = Date.UTC(2030, 5, 15, 23, 59);

describe("getRelativeDate", () => {
  it.each([
    ["2030-06-15", "today"],
    ["2030-06-14", "1d ago"],
    ["2030-06-12", "3d ago"],
    ["2030-07-15", "in 30d"],
    ["2030-06-16", "in 1d"],
    ["2029-06-15", "365d ago"],
    ["soon", ""],
    ["2030-06-15 10:00", ""],
    ["", ""],
  ])("shows %j as %j", (text, expected) => {
    expect(getRelativeDate(text, NOW)).toBe(expected);
  });
});

describe("getLabel", () => {
  it.each([
    ["body", "Description"],
    ["hold_reason", "Hold reason"],
    ["question", "Question"],
    ["doing", "Doing"],
  ])("labels %s as %s", (key, expected) => {
    expect(getLabel(key)).toBe(expected);
  });
});

describe("getTypedFields", () => {
  it("makes short values badges with the key as prefix", () => {
    const { badges, texts } = getTypedFields([["Kind", "ship"], ["Priority", "1"], ["Id", "abc-123"], ["Hold kind", "captain"]], NOW);
    expect(badges.map((badge) => [badge.prefix, badge.text])).toEqual([["kind", "ship"], ["priority", "1"], ["id", "abc-123"], ["hold kind", "captain"]]);
    expect(texts).toEqual([]);
  });

  it("shows a date badge as a relative date, with the full date as tip", () => {
    const { badges } = getTypedFields([["Filed", "2030-06-12"], ["hold_until", "2030-06-20"], ["Closed", "unknown"]], NOW);
    expect(badges).toEqual([
      { prefix: "filed", text: "3d ago", tip: "2030-06-12" },
      { prefix: "hold until", text: "in 5d", tip: "2030-06-20" },
      { prefix: "closed", text: "unknown", tip: "" },
    ]);
  });

  it("shows a boolean only when true, and then only as its name", () => {
    const { badges } = getTypedFields([["blocked", "yes"], ["held", "no"], ["Flag", "true"], ["Other", "false"]], NOW);
    expect(badges).toEqual([{ prefix: "", text: "blocked", tip: "" }, { prefix: "", text: "flag", tip: "" }]);
  });

  it("makes long-text fields and long values texts, in order", () => {
    const { badges, texts } = getTypedFields([["Question", "Ship it?"], ["Kind", "ship"], ["Hold reason", "waiting"], ["Note", "x".repeat(41)]], NOW);
    expect(texts.map((text) => text.label)).toEqual(["Question", "Hold reason", "Note"]);
    expect(badges.map((badge) => badge.text)).toEqual(["ship"]);
  });

  it("keeps a value of exactly 40 characters a badge", () => {
    const { badges, texts } = getTypedFields([["Note", "x".repeat(40)]], NOW);
    expect([badges.length, texts.length]).toEqual([1, 0]);
  });

  it("keeps the Doing text a paragraph, even when short", () => {
    const { badges, texts } = getTypedFields([["Doing", "tests green"]], NOW);
    expect(texts).toEqual([{ label: "Doing", value: "tests green" }]);
    expect(badges).toEqual([]);
  });

  it("makes a URL a link chip, never a badge or text, and lists a repeated URL once", () => {
    const { badges, texts, links } = getTypedFields(
      [
        ["Artifact", "https://example.com/acme/app/pull/12"],
        ["links", "report:https://docs.example.com/guide/setup"],
        ["Artifact", "https://example.com/acme/app/pull/12"],
      ],
      NOW,
    );
    expect(links).toEqual([
      { url: "https://example.com/acme/app/pull/12", label: "PR #12", isPr: true },
      { url: "https://docs.example.com/guide/setup", label: "docs.example.com/setup", isPr: false },
    ]);
    expect([badges, texts]).toEqual([[], []]);
  });

  it("keeps the URL of a long-text field inside the text", () => {
    const { texts, links } = getTypedFields([["Question", "See https://example.com/x first"]], NOW);
    expect(texts).toHaveLength(1);
    expect(links).toEqual([]);
  });

  it.each([
    ["the same date", "2030-06-10", 1],
    ["another date", "2030-06-11", 2],
  ])("drops created only when filed has %s", (_name, created, count) => {
    const { badges } = getTypedFields([["filed", "2030-06-10"], ["created", created]], NOW);
    expect(badges).toHaveLength(count);
  });
});

describe("getLink", () => {
  it.each([
    ["a link with no path, by its host", "https://example.com", "example.com"],
    ["a URL the parser rejects, by its own text", "https://[bad", "https://[bad"],
  ])("labels %s", (_name, url, label) => {
    expect(getLink(url).label).toBe(label);
  });
});

describe("an opened item with a real-shaped record", () => {
  const body = "From https://example.com/acme/app/pull/25 'Not fixed': the connection hangs until the timeout and the user sees no error at all.";
  const text = `task:
  id: queued-example
  title: "Example: items the review left unfixed"
  state: queued
  blocked: no
  kind: ship
  repo: example-app
  created: 2030-06-10
  closed: "-"
  deps: none
  body: ${JSON.stringify(body)}
`;

  it("shows the long body as a paragraph labeled Description", () => {
    const item = getItem({ itemId: "queued-example", title: "Example: items…", facts: [["Filed", "2030-06-10"]], detail: "" }, parseTaskRecord(text));
    const { texts, badges } = getTypedFields(item.fields, NOW);
    expect(texts).toEqual([{ label: "body", value: body }]);
    expect(getLabel(texts[0].label)).toBe("Description");
    expect(badges.map((badge) => badge.prefix)).toEqual(["id", "state", "kind", "filed"]);
  });
});
