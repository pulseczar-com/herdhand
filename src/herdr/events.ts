import type { HerdrKind } from "./kinds";

/** How one kind of Herdr subscribes to its events and reads what comes back. */
export type EventFeed = {
  /** The one request line that turns the stream into an events stream. */
  subscribeLine: string;
  /** True for a line that tells the list may have changed. */
  isChange(message: object): boolean;
};

// The desktop app sends `event`, `missed` (with a fresh snapshot to follow) and a `heartbeat`
// every 15 s as JSON-RPC notifications. Its one reply, to the subscribe request, has no method.
const desktop: EventFeed = {
  subscribeLine: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "events.subscribe", params: {} }),
  isChange: (message) => {
    const { method } = message as { method?: unknown };
    return typeof method === "string" && method !== "heartbeat";
  },
};

// Everything that changes a space, a tab or a pane, but not focus, output or scroll, which
// change all the time and show nowhere in the list.
const TUI_SUBSCRIPTIONS = [
  "workspace.created",
  "workspace.updated",
  "workspace.renamed",
  "workspace.moved",
  "workspace.reordered",
  "workspace.closed",
  "tab.created",
  "tab.closed",
  "tab.renamed",
  "tab.moved",
  "pane.created",
  "pane.closed",
  "pane.updated",
  "pane.moved",
  "pane.exited",
  "pane.agent_detected",
  "pane.agent_status_changed",
  "layout.updated",
];

// The TUI wraps each event as `{event, data}`. Its one reply, to the subscribe request, has an id.
const tui: EventFeed = {
  subscribeLine: JSON.stringify({
    id: "events",
    method: "events.subscribe",
    params: { subscriptions: TUI_SUBSCRIPTIONS.map((type) => ({ type })) },
  }),
  isChange: (message) => typeof (message as { event?: unknown }).event === "string",
};

export const EVENT_FEEDS: Record<HerdrKind, EventFeed> = { desktop, tui };
