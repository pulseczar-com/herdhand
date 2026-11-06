import type { HerdrClient } from "@/rpc/client";

import { makeDesktopBackend } from "./desktop";
import desktopKeys from "./fixtures/desktop-keys.json";
import desktopSend from "./fixtures/desktop-send.json";
import tuiOk from "./fixtures/tui-ok.json";
import { makeTuiBackend } from "./tui";

// The fixtures are replies recorded from `hc connect` and `herdr remote-api-bridge`.
function makeClient(reply: unknown): HerdrClient {
  return { request: jest.fn().mockResolvedValue(reply), receive: jest.fn(), rejectAll: jest.fn() };
}

describe("sendLine", () => {
  it.each([
    {
      kind: "desktop app",
      makeBackend: makeDesktopBackend,
      paneId: "t6",
      reply: desktopSend,
      request: ["terminal.send", { terminal: "t6", text: "ls -la" }],
    },
    {
      kind: "TUI",
      makeBackend: makeTuiBackend,
      paneId: "w7:p1",
      reply: tuiOk,
      request: ["pane.send_input", { pane_id: "w7:p1", text: "ls -la", keys: ["enter"] }],
    },
  ])("types a line and presses Enter on the $kind", async ({ makeBackend, paneId, reply, request }) => {
    const client = makeClient(reply);

    await makeBackend(client).sendLine(paneId, "ls -la");

    expect(client.request).toHaveBeenCalledWith(...request);
  });
});

describe("pressKey", () => {
  it.each([
    {
      kind: "desktop app",
      makeBackend: makeDesktopBackend,
      paneId: "t6",
      reply: desktopKeys,
      request: ["terminal.keys", { terminal: "t6", keys: ["ctrl+c"] }],
    },
    {
      kind: "TUI",
      makeBackend: makeTuiBackend,
      paneId: "w7:p1",
      reply: tuiOk,
      request: ["pane.send_keys", { pane_id: "w7:p1", keys: ["ctrl+c"] }],
    },
  ])("presses a key on the $kind", async ({ makeBackend, paneId, reply, request }) => {
    const client = makeClient(reply);

    await makeBackend(client).pressKey(paneId, "ctrl+c");

    expect(client.request).toHaveBeenCalledWith(...request);
  });
});
