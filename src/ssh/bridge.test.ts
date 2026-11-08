import { closeOpenBridge, DISCONNECT_REQUESTED, getOpenBridge, openBridge } from "./bridge";
import { CHANGE_WINDOW_MS, HEARTBEAT_TIMEOUT_MS } from "./events";
import { ConnectError } from "./errors";

type Listener = (event: never) => void;

// An in-memory stand-in for the native SSH module, which holds one connection at a time.
// Its `log` records each call, so a test can check the order the app used it in.
function mockBuildSsh() {
  const listeners = new Map<string, Set<Listener>>();
  const state = {
    log: [] as string[],
    connect: (_host: string): Promise<void> => Promise.resolve(),
    detectOutput: "herdr-api-bridge-v1\n",
    answersPing: true,
    failBridgeExec: false,
    detectHangs: false,
    runResult: { output: "", exitCode: 0 },
    /** The calls for the events stream, kept apart from `log`. */
    events: [] as string[],
  };
  /** Sends the event as the stream `id` gives it: the bridge's, unless the test says another. */
  function emit(name: string, event: object, id = "bridge") {
    for (const listener of [...(listeners.get(name) ?? [])]) listener({ id, ...event } as never);
  }
  const module = {
    addListener: (name: string, listener: Listener) => {
      listeners.set(name, (listeners.get(name) ?? new Set()).add(listener));
      return { remove: () => listeners.get(name)?.delete(listener) };
    },
    connect: ({ host, label }: { host: string; label: string }) => {
      state.log.push(`connect ${host} as ${label}`);
      return state.connect(host);
    },
    exec: async (id: string, command: string) => {
      if (id === "events") {
        state.events.push(`exec ${command.includes("remote-api-bridge") ? "tui" : "desktop"}`);
        return;
      }
      state.log.push(command.includes("--check") ? "exec detect" : "exec bridge");
      if (!command.includes("--check") && state.failBridgeExec) throw new Error("session failed");
      if (command.includes("--check") && !state.detectHangs) {
        setTimeout(() => {
          emit("onData", { text: state.detectOutput });
          emit("onClosed", { reason: "exit 0" });
        });
      }
    },
    run: async (command: string) => {
      state.log.push(`run ${command}`);
      return state.runResult;
    },
    write: async (streamId: string, text: string) => {
      if (streamId === "events") {
        state.events.push("write");
        return;
      }
      if (!state.answersPing) return;
      const { id } = JSON.parse(text);
      const reply = { jsonrpc: "2.0", id, result: { version: "1.2.3" } };
      setTimeout(() => emit("onData", { text: `${JSON.stringify(reply)}\n` }));
    },
    close: async () => {
      state.log.push("close");
    },
  };
  return {
    __esModule: true,
    default: module,
    state,
    emit,
    listenerCount: () => [...listeners.values()].reduce((sum, set) => sum + set.size, 0),
  };
}

jest.mock("../../modules/ssh", () => mockBuildSsh());

const mockSsh = jest.requireMock("../../modules/ssh") as ReturnType<typeof mockBuildSsh>;

const machine = (host: string) => ({ id: host, name: host, host, port: 22, user: "test-user" });
const open = (host: string) => openBridge({ machine: machine(host), password: "secret", trustedFingerprint: null });

beforeEach(() => {
  mockSsh.state.log = [];
  mockSsh.state.connect = () => Promise.resolve();
  mockSsh.state.detectOutput = "herdr-api-bridge-v1\n";
  mockSsh.state.answersPing = true;
  mockSsh.state.failBridgeExec = false;
  mockSsh.state.detectHangs = false;
  mockSsh.state.runResult = { output: "", exitCode: 0 };
  mockSsh.state.events = [];
});

describe("openBridge", () => {
  it("opens the TUI bridge and reads its version", async () => {
    const bridge = await open("a.example.com");

    expect(bridge).toMatchObject({ kind: "tui", availableKinds: ["tui"], version: "1.2.3" });
    expect(mockSsh.state.log).toEqual(["connect a.example.com as a.example.com", "exec detect", "exec bridge"]);
    await bridge.close();
  });

  it("reads the machine's files through the one-shot channel, and leaves the bridge's command alone", async () => {
    const bridge = await open("a.example.com");
    mockSsh.state.log = [];
    mockSsh.state.runResult = { output: "2\nfirst\nsecond\n", exitCode: 0 };

    const read = await bridge.host.readFile("notes.txt", { offset: 1, limit: 2 });

    expect(read).toEqual({ text: "first\nsecond\n", first: 1, last: 2, lines: 2 });
    expect(mockSsh.state.log).toHaveLength(1);
    expect(mockSsh.state.log[0]).toMatch(/^run sh -c '.*' sh 'notes.txt' '1' '2' /);
    await bridge.close();
  });

  it("lets a new attempt start only after an abandoned one has failed and closed", async () => {
    let failFirst: (error: Error) => void = () => {};
    mockSsh.state.connect = (host) =>
      host === "a.example.com" ? new Promise((_resolve, reject) => (failFirst = reject)) : Promise.resolve();
    const first = open("a.example.com");
    const firstFailure = first.catch((error: unknown) => error);
    const second = open("b.example.com");
    await new Promise((resolve) => setTimeout(resolve));
    expect(mockSsh.state.log).toEqual(["connect a.example.com as a.example.com"]);

    failFirst(new Error("timeout"));

    expect(await firstFailure).toBeInstanceOf(ConnectError);
    const bridge = await second;
    expect(mockSsh.state.log).toEqual(["connect a.example.com as a.example.com", "close", "connect b.example.com as b.example.com", "exec detect", "exec bridge"]);
    await bridge.close();
  });

  it("closes the bridge an earlier attempt left open, and keeps the new one open when the old one closes late", async () => {
    const first = await open("a.example.com");
    const second = await open("b.example.com");
    mockSsh.state.log = [];

    await first.close();

    expect(mockSsh.state.log).toEqual([]);
    await second.close();
    expect(mockSsh.state.log).toEqual(["close"]);
    expect(mockSsh.listenerCount()).toBe(0);
  });

  it("on a drop, closes the connection, tells the reason and is no longer the open bridge", async () => {
    const bridge = await open("a.example.com");
    mockSsh.state.log = [];

    mockSsh.emit("onClosed", { reason: "connection lost" });

    expect(await bridge.closed).toBe("connection lost");
    expect(mockSsh.state.log).toEqual(["close"]);
    expect(getOpenBridge("a.example.com")).toBeNull();
    expect(mockSsh.listenerCount()).toBe(0);
  });

  it("tells a disconnect the person asked for by its own reason, and closes the connection", async () => {
    const bridge = await open("a.example.com");
    mockSsh.state.log = [];

    mockSsh.emit("onClosed", { reason: DISCONNECT_REQUESTED });

    expect(await bridge.closed).toBe(DISCONNECT_REQUESTED);
    expect(mockSsh.state.log).toEqual(["close"]);
    expect(getOpenBridge("a.example.com")).toBeNull();
  });

  it("on a disconnect the person asked for while it opens, rejects as that disconnect and leaves nothing open", async () => {
    mockSsh.state.answersPing = false;
    const failure = open("a.example.com").catch((error: unknown) => error);
    for (let tick = 0; tick < 20 && !mockSsh.state.log.includes("exec bridge"); tick++) {
      await new Promise((resolve) => setTimeout(resolve));
    }

    mockSsh.emit("onClosed", { reason: DISCONNECT_REQUESTED });

    expect(await failure).toMatchObject({ reason: "closed", message: DISCONNECT_REQUESTED });
    expect(getOpenBridge("a.example.com")).toBeNull();
    expect(mockSsh.listenerCount()).toBe(0);
  });

  it("ends the bridge on a disconnect the native module reports for no stream in particular", async () => {
    const bridge = await open("a.example.com");

    mockSsh.emit("onClosed", { reason: DISCONNECT_REQUESTED }, "");

    expect(await bridge.closed).toBe(DISCONNECT_REQUESTED);
    expect(mockSsh.listenerCount()).toBe(0);
  });

  it("knows why the bridge ended the moment the end arrives", async () => {
    const bridge = await open("a.example.com");
    expect(bridge.endReason).toBeNull();

    mockSsh.emit("onClosed", { reason: DISCONNECT_REQUESTED });

    expect(bridge.endReason).toBe(DISCONNECT_REQUESTED);
    await bridge.closed;
  });

  it("closes a bridge that is still opening when its machine is closed", async () => {
    let finishConnect: () => void = () => {};
    mockSsh.state.connect = () => new Promise<void>((resolve) => (finishConnect = resolve));
    const opening = open("a.example.com");

    const closing = closeOpenBridge("a.example.com");
    await new Promise((resolve) => setTimeout(resolve));
    expect(mockSsh.state.log).toContain("connect a.example.com as a.example.com");
    finishConnect();
    await opening;
    await closing;

    expect(getOpenBridge("a.example.com")).toBeNull();
    expect(mockSsh.state.log.at(-1)).toBe("close");
    expect(mockSsh.listenerCount()).toBe(0);
  });

  it("leaves another machine's bridge open when it closes a machine's bridge", async () => {
    const bridge = await open("a.example.com");

    await closeOpenBridge("b.example.com");

    expect(getOpenBridge("a.example.com")).toBe(bridge);
    await bridge.close();
  });

  it("gives the open bridge to its own machine only, until it closes", async () => {
    const bridge = await open("a.example.com");

    expect(getOpenBridge("a.example.com")).toBe(bridge);
    expect(getOpenBridge("b.example.com")).toBeNull();

    await bridge.close();
    expect(getOpenBridge("a.example.com")).toBeNull();
  });

  it("closes the connection once when close is called twice", async () => {
    const bridge = await open("a.example.com");
    mockSsh.state.log = [];

    await Promise.all([bridge.close(), bridge.close()]);

    expect(mockSsh.state.log).toEqual(["close"]);
  });

  it.each([
    { name: "no reply to the version request", detectOutput: "herdr-api-bridge-v1\n", reason: "noReply" },
    { name: "no Herdr", detectOutput: "", reason: "herdrNotFound" },
  ])("on $name, rejects with $reason and leaves nothing open", async ({ detectOutput, reason }) => {
    jest.useFakeTimers();
    mockSsh.state.detectOutput = detectOutput;
    mockSsh.state.answersPing = false;
    const failure = open("a.example.com").catch((error: unknown) => error);

    await jest.advanceTimersByTimeAsync(20_000);
    jest.useRealTimers();

    expect(await failure).toMatchObject({ reason });
    expect(mockSsh.state.log.at(-1)).toBe("close");
    expect(mockSsh.listenerCount()).toBe(0);
  });

  it("gives up on a detection that never ends, so a later close does not wait for it", async () => {
    jest.useFakeTimers();
    mockSsh.state.detectHangs = true;
    const failure = open("a.example.com").catch((error: unknown) => error);
    const closed = closeOpenBridge("a.example.com");

    await jest.advanceTimersByTimeAsync(20_000);
    jest.useRealTimers();

    expect(await failure).toMatchObject({ reason: "noReply" });
    await closed;
    expect(mockSsh.state.log.at(-1)).toBe("close");
    expect(mockSsh.listenerCount()).toBe(0);
  });

  it("tells which kinds the machine offers when the bridge fails after detection", async () => {
    jest.useFakeTimers();
    mockSsh.state.detectOutput = "hc\nherdr-api-bridge-v1\n";
    mockSsh.state.answersPing = false;
    const failure = open("a.example.com").catch((error: unknown) => error);

    await jest.advanceTimersByTimeAsync(20_000);
    jest.useRealTimers();

    expect(await failure).toMatchObject({ reason: "noReply", attempt: { kind: "desktop", availableKinds: ["desktop", "tui"] } });
  });

  it("leaves no listener behind when the bridge command cannot start", async () => {
    mockSsh.state.failBridgeExec = true;

    const failure = await open("a.example.com").catch((error: unknown) => error);

    expect(failure).toMatchObject({ reason: "other", message: "session failed" });
    expect(mockSsh.listenerCount()).toBe(0);
  });

  it("gives no attempt when the login fails before detection", async () => {
    mockSsh.state.connect = () => Promise.reject(Object.assign(new Error("bad"), { code: "AUTH_FAILED" }));

    const failure = await open("a.example.com").catch((error: unknown) => error);

    expect(failure).toMatchObject({ reason: "loginFailed", attempt: undefined });
  });

  describe("live events", () => {
    afterEach(() => {
      jest.useRealTimers();
    });

    /** Opens the bridge with fake timers on, since the mock answers on a timer. */
    async function openWithFakeTimers(host: string) {
      jest.useFakeTimers();
      const opening = open(host);
      await jest.advanceTimersByTimeAsync(10);
      return opening;
    }

    it("starts the events stream once the version is read, and tells the backend's listeners of a change", async () => {
      const bridge = await openWithFakeTimers("a.example.com");
      await jest.advanceTimersByTimeAsync(0);
      const onChange = jest.fn();
      bridge.backend.onChange?.(onChange);

      expect(mockSsh.state.events).toEqual(["exec tui", "write"]);
      mockSsh.emit("onData", { text: `${JSON.stringify({ event: "tab_created", data: {} })}\n` }, "events");
      await jest.advanceTimersByTimeAsync(CHANGE_WINDOW_MS);

      expect(onChange).toHaveBeenCalledTimes(1);
      await bridge.close();
    });

    it("keeps the events out of the bridge's replies, and the bridge's replies out of the events", async () => {
      const bridge = await openWithFakeTimers("a.example.com");
      const onChange = jest.fn();
      bridge.backend.onChange?.(onChange);

      mockSsh.emit("onData", { text: `${JSON.stringify({ event: "tab_created", data: {} })}\n` });
      await jest.advanceTimersByTimeAsync(CHANGE_WINDOW_MS);

      expect(onChange).not.toHaveBeenCalled();
      await bridge.close();
    });

    it("ends the bridge as a drop when the desktop app's heartbeat stops, and closes the connection", async () => {
      mockSsh.state.detectOutput = "hc\n";
      const bridge = await openWithFakeTimers("a.example.com");
      mockSsh.state.log = [];

      await jest.advanceTimersByTimeAsync(HEARTBEAT_TIMEOUT_MS);

      expect(bridge.endReason).toBe("no heartbeat");
      expect(await bridge.closed).toBe("no heartbeat");
      expect(mockSsh.state.log).toEqual(["close"]);
      expect(getOpenBridge("a.example.com")).toBeNull();
      expect(mockSsh.listenerCount()).toBe(0);
    });

    it("leaves no events listener or timer behind when the bridge closes", async () => {
      mockSsh.state.detectOutput = "hc\n";
      const bridge = await openWithFakeTimers("a.example.com");

      await bridge.close();
      await jest.advanceTimersByTimeAsync(HEARTBEAT_TIMEOUT_MS * 2);

      expect(bridge.endReason).toBeNull();
      expect(mockSsh.listenerCount()).toBe(0);
    });

    it("does not start the events stream again when the link drops", async () => {
      const bridge = await openWithFakeTimers("a.example.com");
      await jest.advanceTimersByTimeAsync(0);
      mockSsh.state.events = [];

      mockSsh.emit("onClosed", { reason: "connection lost" }, "events");
      mockSsh.emit("onClosed", { reason: "connection lost" });
      await bridge.closed;
      await jest.advanceTimersByTimeAsync(10_000);

      expect(mockSsh.state.events).toEqual([]);
    });
  });
});
