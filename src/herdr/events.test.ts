import { EVENT_FEEDS } from "./events";

describe("the desktop event feed", () => {
  const { isChange, subscribeLine } = EVENT_FEEDS.desktop;

  it.each([
    { name: "a heartbeat", message: { jsonrpc: "2.0", method: "heartbeat", params: { seq: 3 } }, change: false },
    { name: "an event", message: { jsonrpc: "2.0", method: "event", params: { seq: 4 } }, change: true },
    { name: "a missed notice", message: { jsonrpc: "2.0", method: "missed", params: {} }, change: true },
    { name: "the reply to the subscribe request", message: { id: 1, jsonrpc: "2.0", result: { seq: 3 } }, change: false },
  ])("tells $name", ({ message, change }) => {
    expect(isChange(message)).toBe(change);
  });

  it("subscribes with one JSON-RPC request line", () => {
    expect(JSON.parse(subscribeLine)).toMatchObject({ jsonrpc: "2.0", method: "events.subscribe" });
  });

  it("watches the heartbeat", () => {
    expect(EVENT_FEEDS.desktop.watchesHeartbeat).toBe(true);
  });
});

describe("the TUI event feed", () => {
  const { isChange, subscribeLine } = EVENT_FEEDS.tui;

  it.each([
    { name: "an event", message: { event: "pane_agent_status_changed", data: {} }, change: true },
    { name: "the reply to the subscribe request", message: { id: "1", result: { type: "subscription_started" } }, change: false },
    { name: "an error reply", message: { id: "1", error: { message: "no" } }, change: false },
  ])("tells $name", ({ message, change }) => {
    expect(isChange(message)).toBe(change);
  });

  it("subscribes to structure changes, not to focus or output", () => {
    const { method, params } = JSON.parse(subscribeLine) as { method: string; params: { subscriptions: { type: string }[] } };
    const types = params.subscriptions.map((subscription) => subscription.type);

    expect(method).toBe("events.subscribe");
    expect(types).toEqual(expect.arrayContaining(["tab.created", "pane.closed", "pane.agent_status_changed"]));
    expect(types.filter((type) => /focused|output|scroll/.test(type))).toEqual([]);
  });

  it("does not watch the heartbeat", () => {
    expect(EVENT_FEEDS.tui.watchesHeartbeat).toBe(false);
  });
});
