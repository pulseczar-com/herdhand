import type { HerdrClient } from "@/rpc/client";

import { READ_LINES } from "./backend";
import { makeDesktopBackend } from "./desktop";
import desktopRead from "./fixtures/desktop-read.json";
import tuiRead from "./fixtures/tui-read.json";
import { makeTuiBackend } from "./tui";

// The fixtures are `terminal.read` and `pane.read` replies recorded from `hc connect` and
// `herdr remote-api-bridge`, with the text replaced by placeholders.
function makeClient(reply: unknown): HerdrClient {
  return { request: jest.fn().mockResolvedValue(reply), receive: jest.fn(), rejectAll: jest.fn() };
}

describe("readPane", () => {
  it.each([
    {
      kind: "desktop app",
      makeBackend: makeDesktopBackend,
      paneId: "t6",
      reply: desktopRead,
      request: ["terminal.read", { terminal: "t6", lines: READ_LINES }],
      text: desktopRead.text,
    },
    {
      kind: "TUI",
      makeBackend: makeTuiBackend,
      paneId: "w7:p1",
      reply: tuiRead,
      request: ["pane.read", { pane_id: "w7:p1", source: "recent_unwrapped", format: "ansi", strip_ansi: false, lines: READ_LINES }],
      text: tuiRead.read.text,
    },
  ])("reads a pane from the $kind", async ({ makeBackend, paneId, reply, request, text }) => {
    const client = makeClient(reply);

    await expect(makeBackend(client).readPane(paneId)).resolves.toBe(text);
    expect(client.request).toHaveBeenCalledWith(...request);
  });

  it.each([
    { kind: "desktop app", makeBackend: makeDesktopBackend, reply: {} },
    { kind: "TUI", makeBackend: makeTuiBackend, reply: { read: {} } },
  ])("reads a reply with no text from the $kind as empty", async ({ makeBackend, reply }) => {
    await expect(makeBackend(makeClient(reply)).readPane("p1")).resolves.toBe("");
  });
});
