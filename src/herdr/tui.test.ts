import { RequestTimeoutError } from "@/rpc/client";

import { makeTuiClient } from "./tui";

function makeClientWithSentLines() {
  const sent: object[] = [];
  const client = makeTuiClient((line) => sent.push(JSON.parse(line)));
  return { client, sent };
}

describe("TUI client", () => {
  afterEach(() => jest.useRealTimers());

  it("sends one line per request with its own id", () => {
    const { client, sent } = makeClientWithSentLines();

    client.request("ping").catch(() => {});
    client.request("workspace.list", { limit: 1 }).catch(() => {});

    expect(sent).toEqual([
      { id: "1", method: "ping", params: {} },
      { id: "2", method: "workspace.list", params: { limit: 1 } },
    ]);
    client.rejectAll("done");
  });

  it("matches a reply to its request by id", async () => {
    const { client } = makeClientWithSentLines();
    const ping = client.request("ping");
    const list = client.request("workspace.list");

    client.receive({ id: "2", result: { workspaces: [] } });
    client.receive({ id: "1", result: { type: "pong", version: "0.9.3" } });

    await expect(ping).resolves.toEqual({ type: "pong", version: "0.9.3" });
    await expect(list).resolves.toEqual({ workspaces: [] });
  });

  it("rejects on an error reply", async () => {
    const { client } = makeClientWithSentLines();
    const ping = client.request("ping");

    client.receive({ id: "1", error: { code: "bad_request", message: "unknown method" } });

    await expect(ping).rejects.toThrow("unknown method");
  });

  it("ignores a reply with an unknown id", async () => {
    const { client } = makeClientWithSentLines();
    const ping = client.request("ping");

    client.receive({ id: "99", result: {} });
    client.receive({ id: "1", result: "ok" });

    await expect(ping).resolves.toBe("ok");
  });

  it("rejects every waiting request on close", async () => {
    const { client } = makeClientWithSentLines();
    const ping = client.request("ping");
    const list = client.request("workspace.list");

    client.rejectAll("Connection closed");

    await expect(ping).rejects.toThrow("Connection closed");
    await expect(list).rejects.toThrow("Connection closed");
  });

  it("rejects with a timeout error when no reply comes", async () => {
    jest.useFakeTimers();
    const { client } = makeClientWithSentLines();
    const ping = client.request("ping");

    jest.advanceTimersByTime(15_000);

    await expect(ping).rejects.toBeInstanceOf(RequestTimeoutError);
  });
});
