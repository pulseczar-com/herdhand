import { CHANGE_WINDOW_MS, HEARTBEAT_TIMEOUT_MS, RESTART_DELAY_MS, startEvents } from "./events";

type Listener = (event: never) => void;

// An in-memory stand-in for the native SSH module. Its `log` records the streams the app started.
function mockBuildSsh() {
  const listeners = new Map<string, Set<Listener>>();
  const state = { log: [] as string[], failExec: false };
  function emit(name: string, event: object) {
    for (const listener of [...(listeners.get(name) ?? [])]) listener(event as never);
  }
  const module = {
    addListener: (name: string, listener: Listener) => {
      listeners.set(name, (listeners.get(name) ?? new Set()).add(listener));
      return { remove: () => listeners.get(name)?.delete(listener) };
    },
    exec: async (id: string, command: string) => {
      state.log.push(`exec ${id} ${command.includes("remote-api-bridge") ? "tui" : "desktop"}`);
      if (state.failExec) throw new Error("channel refused");
    },
    write: async (id: string, text: string) => {
      state.log.push(`write ${id} ${text.trim().slice(0, 40)}`);
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

const heartbeat = `${JSON.stringify({ jsonrpc: "2.0", method: "heartbeat", params: { seq: 1 } })}\n`;
const desktopEvent = `${JSON.stringify({ jsonrpc: "2.0", method: "event", params: { seq: 2 } })}\n`;
const tuiEvent = `${JSON.stringify({ event: "tab_created", data: {} })}\n`;

const send = (text: string, id = "events") => mockSsh.emit("onData", { id, text });
const close = (reason = "ended", id = "events") => mockSsh.emit("onClosed", { id, reason });
const flush = () => jest.advanceTimersByTimeAsync(0);

beforeEach(() => {
  jest.useFakeTimers();
  mockSsh.state.log = [];
  mockSsh.state.failExec = false;
});

afterEach(() => {
  jest.useRealTimers();
});

describe("startEvents", () => {
  it("starts the kind's command on its own stream and sends the one subscribe line", async () => {
    const events = startEvents("tui", jest.fn());
    await flush();

    expect(mockSsh.state.log).toEqual(["exec events tui", expect.stringMatching(/^write events \{"id":"events","method":"events\.sub/)]);
    events.stop();
  });

  it("starts the desktop app's connect command for the desktop kind", async () => {
    const events = startEvents("desktop", jest.fn());
    await flush();

    expect(mockSsh.state.log[0]).toBe("exec events desktop");
    expect(mockSsh.state.log[1]).toContain("write events");
    events.stop();
  });

  it("tells one change for a burst of events, and another for the next burst", async () => {
    const events = startEvents("desktop", jest.fn());
    const onChange = jest.fn();
    events.onChange(onChange);
    await flush();

    send(desktopEvent + desktopEvent);
    send(desktopEvent);
    await jest.advanceTimersByTimeAsync(CHANGE_WINDOW_MS - 1);
    expect(onChange).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(1);
    expect(onChange).toHaveBeenCalledTimes(1);

    send(desktopEvent);
    await jest.advanceTimersByTimeAsync(CHANGE_WINDOW_MS);
    expect(onChange).toHaveBeenCalledTimes(2);
    events.stop();
  });

  it("still tells a change while events keep coming", async () => {
    const events = startEvents("desktop", jest.fn());
    const onChange = jest.fn();
    events.onChange(onChange);
    await flush();

    for (let second = 0; second < 5; second++) {
      send(desktopEvent);
      await jest.advanceTimersByTimeAsync(300);
    }

    expect(onChange).toHaveBeenCalled();
    events.stop();
  });

  it("reads an event line that arrives in pieces", async () => {
    const events = startEvents("tui", jest.fn());
    const onChange = jest.fn();
    events.onChange(onChange);
    await flush();

    send(tuiEvent.slice(0, 10));
    send(tuiEvent.slice(10));
    await jest.advanceTimersByTimeAsync(CHANGE_WINDOW_MS);

    expect(onChange).toHaveBeenCalledTimes(1);
    events.stop();
  });

  it("tells no change for a heartbeat, the subscribe reply or the bridge's own output", async () => {
    const events = startEvents("desktop", jest.fn());
    const onChange = jest.fn();
    events.onChange(onChange);
    await flush();

    send(heartbeat);
    send(`${JSON.stringify({ jsonrpc: "2.0", id: 1, result: { seq: 1, terminals: [] } })}\n`);
    send(desktopEvent, "bridge");
    await jest.advanceTimersByTimeAsync(CHANGE_WINDOW_MS * 2);

    expect(onChange).not.toHaveBeenCalled();
    events.stop();
  });

  it("stops telling a listener that unsubscribed", async () => {
    const events = startEvents("desktop", jest.fn());
    const onChange = jest.fn();
    const unsubscribe = events.onChange(onChange);
    await flush();

    unsubscribe();
    send(desktopEvent);
    await jest.advanceTimersByTimeAsync(CHANGE_WINDOW_MS);

    expect(onChange).not.toHaveBeenCalled();
    events.stop();
  });

  it("on the desktop, calls the link dead when no heartbeat arrives in time", async () => {
    const onDead = jest.fn();
    const events = startEvents("desktop", onDead);
    await flush();

    await jest.advanceTimersByTimeAsync(HEARTBEAT_TIMEOUT_MS - 1);
    expect(onDead).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(1);

    expect(onDead).toHaveBeenCalledWith("no heartbeat");
    events.stop();
  });

  it("on the desktop, keeps the link alive while heartbeats arrive", async () => {
    const onDead = jest.fn();
    const events = startEvents("desktop", onDead);
    await flush();

    for (let beat = 0; beat < 6; beat++) {
      await jest.advanceTimersByTimeAsync(15_000);
      send(heartbeat);
    }

    expect(onDead).not.toHaveBeenCalled();
    events.stop();
  });

  it("on the TUI, which sends no heartbeat, never calls the link dead for silence", async () => {
    const onDead = jest.fn();
    const events = startEvents("tui", onDead);
    await flush();

    await jest.advanceTimersByTimeAsync(HEARTBEAT_TIMEOUT_MS * 3);

    expect(onDead).not.toHaveBeenCalled();
    events.stop();
  });

  it("starts the stream again with the same id after it closes, and asks for a fresh list", async () => {
    const events = startEvents("tui", jest.fn());
    const onChange = jest.fn();
    events.onChange(onChange);
    await flush();
    send(tuiEvent);
    await jest.advanceTimersByTimeAsync(CHANGE_WINDOW_MS);
    mockSsh.state.log = [];
    onChange.mockClear();

    close("ended");
    await jest.advanceTimersByTimeAsync(RESTART_DELAY_MS);

    expect(mockSsh.state.log[0]).toBe("exec events tui");
    expect(mockSsh.state.log[1]).toContain("write events");
    await jest.advanceTimersByTimeAsync(CHANGE_WINDOW_MS);
    expect(onChange).toHaveBeenCalledTimes(1);
    events.stop();
  });

  it("gives up after three closes in a row with no line between them", async () => {
    const events = startEvents("tui", jest.fn());
    await flush();

    for (let closes = 0; closes < 3; closes++) {
      close("ended");
      await jest.advanceTimersByTimeAsync(RESTART_DELAY_MS);
    }

    expect(mockSsh.state.log.filter((entry) => entry.startsWith("exec"))).toHaveLength(3);
    await jest.advanceTimersByTimeAsync(RESTART_DELAY_MS * 5);
    expect(mockSsh.state.log.filter((entry) => entry.startsWith("exec"))).toHaveLength(3);
    events.stop();
  });

  it("counts a stream that cannot start as a close, and gives up on it too", async () => {
    mockSsh.state.failExec = true;
    const events = startEvents("tui", jest.fn());

    await jest.advanceTimersByTimeAsync(RESTART_DELAY_MS * 10);

    expect(mockSsh.state.log.filter((entry) => entry.startsWith("exec"))).toHaveLength(3);
    events.stop();
  });

  it("starts counting again once a line arrives", async () => {
    const events = startEvents("tui", jest.fn());
    await flush();

    for (let closes = 0; closes < 5; closes++) {
      send(tuiEvent);
      close("ended");
      await jest.advanceTimersByTimeAsync(RESTART_DELAY_MS);
    }

    expect(mockSsh.state.log.filter((entry) => entry.startsWith("exec"))).toHaveLength(6);
    events.stop();
  });

  it("starts nothing and tells nothing after stop, and leaves no listener behind", async () => {
    const events = startEvents("desktop", jest.fn());
    const onChange = jest.fn();
    events.onChange(onChange);
    await flush();
    send(desktopEvent);
    close("ended");

    events.stop();
    await jest.advanceTimersByTimeAsync(HEARTBEAT_TIMEOUT_MS * 2);

    expect(onChange).not.toHaveBeenCalled();
    expect(mockSsh.state.log.filter((entry) => entry.startsWith("exec"))).toHaveLength(1);
    expect(mockSsh.listenerCount()).toBe(0);
  });
});
