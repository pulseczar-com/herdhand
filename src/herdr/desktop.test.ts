import { type HerdrClient, RequestTimeoutError } from "@/rpc/client";

import { makeDesktopBackend, makeDesktopClient } from "./desktop";

function makeClientWithSentLines() {
  const sent: { id: number; method: string }[] = [];
  const client = makeDesktopClient((line) => sent.push(JSON.parse(line)));
  return { client, sent };
}

describe("desktop client", () => {
  afterEach(() => jest.useRealTimers());

  it("resolves a JSON-RPC reply", async () => {
    const { client, sent } = makeClientWithSentLines();
    const hello = client.request("hello", { generation: 1 });

    client.receive({ jsonrpc: "2.0", id: sent[0].id, result: { version: "0.1.18" } });

    await expect(hello).resolves.toEqual({ version: "0.1.18" });
  });

  it("tells a timeout apart from an error that Herdr returns", async () => {
    jest.useFakeTimers();
    const { client, sent } = makeClientWithSentLines();
    const timedOut = client.request("hello");
    const refused = client.request("hello");

    client.receive({
      jsonrpc: "2.0",
      id: sent[1].id,
      error: { code: -32000, message: "unsupported_generation" },
    });
    jest.advanceTimersByTime(15_000);

    await expect(timedOut).rejects.toBeInstanceOf(RequestTimeoutError);
    await expect(refused).rejects.not.toBeInstanceOf(RequestTimeoutError);
    await expect(refused).rejects.toThrow("unsupported_generation");
  });

  it("rejects every waiting request on close", async () => {
    const { client } = makeClientWithSentLines();
    const hello = client.request("hello");

    client.rejectAll("Connection closed");

    await expect(hello).rejects.toThrow("Connection closed");
  });
});

describe("desktop backend: one pane and its files", () => {
  function makeBackend(reply: (method: string) => Promise<unknown>) {
    const request = jest.fn((method: string) => reply(method));
    const client = { request, receive: jest.fn(), rejectAll: jest.fn() } as HerdrClient;
    return { backend: makeDesktopBackend(client), request };
  }

  it("reads one pane with its process id and the agent's message", async () => {
    const terminal = {
      address: "t11",
      title: "Fix the build",
      foreground: { pid: 100 },
      status: { app: "claude-code", state: "blocked", msg: "approve Bash: npm test" },
    };
    const { backend, request } = makeBackend(() => Promise.resolve(terminal));

    const pane = await backend.getPane?.("t11");

    expect(request).toHaveBeenCalledWith("terminal.get", { terminal: "t11" });
    expect(pane).toMatchObject({ id: "t11", agent: "claude-code", state: "blocked", pid: 100, message: "approve Bash: npm test" });
  });

  // `argv` is the shell the terminal started; `foreground` is what holds the terminal now.
  it.each([
    { name: "the shell is in the foreground", foreground: { name: "bash", argv: ["-bash"] }, expected: true },
    { name: "another program is in the foreground", foreground: { name: "ssh", argv: ["ssh", "test-box.example.com"] }, expected: false },
    { name: "Herdr gives no foreground", foreground: undefined, expected: undefined },
  ])("tells whether a shell pane has the shell in the foreground: $name", async ({ foreground, expected }) => {
    const terminal = { address: "t10", argv: ["/bin/bash"], foreground, title: "~" };
    const { backend } = makeBackend(() => Promise.resolve(terminal));

    const pane = await backend.getPane?.("t10");

    expect(pane?.isShellForeground).toBe(expected);
  });

  // The `kind` field of the terminal's status record, as hc 0.1.18's schema has it.
  it.each([
    { kind: "permission", expected: "permission" },
    { kind: "question", expected: "question" },
    { kind: "auth", expected: "auth" },
    { kind: null, expected: undefined },
    { kind: "something-new", expected: undefined },
  ])("reads what a blocked agent waits for: $kind", async ({ kind, expected }) => {
    const terminal = { address: "t12", title: "Review", status: { app: "codex", state: "blocked", kind, msg: "Pick one" } };
    const { backend } = makeBackend(() => Promise.resolve(terminal));

    const pane = await backend.getPane?.("t12");

    expect(pane?.blockedKind).toBe(expected);
  });
});
