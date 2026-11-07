import { act, renderHook, waitFor } from "@testing-library/react-native";
import { PermissionsAndroid } from "react-native";

import type { Backend } from "@/herdr/backend";
import { getNotificationPermissionAsked, saveNotificationPermissionAsked } from "@/settings/store";
import { type Bridge, closeOpenBridge, DISCONNECT_REQUESTED, getOpenBridge, openBridge } from "@/ssh/bridge";
import { type ConnectAttempt, ConnectError } from "@/ssh/errors";

import { getMachine, getPassword, getTrustedFingerprint, saveMachineKind } from "./store";
import { type ConnectionStatus, PROBE_TIMEOUT_MS, useMachineConnection } from "./useMachineConnection";

jest.mock("@/ssh/bridge", () => ({
  openBridge: jest.fn(),
  getOpenBridge: jest.fn(),
  closeOpenBridge: jest.fn(),
  DISCONNECT_REQUESTED: "disconnect requested",
}));
jest.mock("@/settings/store", () => ({
  getNotificationPermissionAsked: jest.fn(),
  saveNotificationPermissionAsked: jest.fn(),
}));
jest.mock("./store", () => ({
  getMachine: jest.fn(),
  getPassword: jest.fn(),
  getTrustedFingerprint: jest.fn(),
  saveMachineKind: jest.fn(),
  saveTrustedFingerprint: jest.fn(),
}));

const machine = { id: "m1", name: "test-box", host: "test-box.example.com", port: 22, user: "test-user" };

function makeBackend(): jest.Mocked<Backend> {
  return {
    getVersion: jest.fn().mockResolvedValue("1.2.3"),
    listSpaces: jest.fn().mockResolvedValue([]),
    readPane: jest.fn(),
    sendLine: jest.fn().mockResolvedValue(undefined),
    pressKey: jest.fn(),
  };
}

/** A bridge whose `drop` ends it the way a dropped link does. */
type TestBridge = { -readonly [K in keyof Bridge]: Bridge[K] } & { drop(reason: string): void; settle(reason: string): void };

function makeBridge(backend: Backend): TestBridge {
  let settle: (reason: string) => void = () => {};
  const closed = new Promise<string>((resolve) => (settle = resolve));
  const bridge: TestBridge = {
    machineId: "m1",
    kind: "tui",
    availableKinds: ["tui"],
    version: "1.2.3",
    backend,
    closed,
    endReason: null,
    close: jest.fn().mockResolvedValue(undefined),
    drop: (reason) => {
      bridge.endReason = reason;
      settle(reason);
    },
    settle,
  };
  return bridge;
}

/** Opens each bridge in turn, then fails as if the network were down. */
function mockBridges(...bridges: Bridge[]) {
  jest.mocked(openBridge).mockImplementation(() => {
    const next = bridges.shift();
    return next ? Promise.resolve(next) : Promise.reject(new ConnectError("unreachable", "down"));
  });
}

function renderConnection(isForeground = true) {
  return renderHook(({ foreground }: { foreground: boolean }) => useMachineConnection("m1", foreground), {
    initialProps: { foreground: isForeground },
  });
}

describe("useMachineConnection", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(getMachine).mockResolvedValue(machine);
    jest.mocked(getPassword).mockResolvedValue("secret");
    jest.mocked(getTrustedFingerprint).mockResolvedValue("SHA256:abc");
    jest.mocked(saveMachineKind).mockResolvedValue(undefined);
    jest.mocked(getOpenBridge).mockReturnValue(null);
    jest.mocked(closeOpenBridge).mockResolvedValue(undefined);
    jest.mocked(getNotificationPermissionAsked).mockResolvedValue(false);
    jest.mocked(saveNotificationPermissionAsked).mockResolvedValue(undefined);
    jest.spyOn(PermissionsAndroid, "request").mockResolvedValue("granted");
  });

  it.each([
    { signIn: undefined, password: "secret" },
    { signIn: "password", password: "secret" },
    { signIn: "phoneKey", password: null },
  ] as const)("logs in to a machine with sign-in $signIn using password $password", async ({ signIn, password }) => {
    jest.mocked(getMachine).mockResolvedValue({ ...machine, signIn });
    mockBridges(makeBridge(makeBackend()));

    renderConnection();

    await waitFor(() => expect(openBridge).toHaveBeenCalledWith(expect.objectContaining({ password })));
  });

  it("lets the person switch kind after the first kind failed, and connects with the other", async () => {
    const attempt: ConnectAttempt = { kind: "desktop", availableKinds: ["desktop", "tui"] };
    jest.mocked(openBridge).mockRejectedValueOnce(new ConnectError("noReply", "none", undefined, attempt));
    const { result } = renderConnection();
    await waitFor(() => expect(result.current.status).toMatchObject({ phase: "failed", attempt }));
    jest.mocked(openBridge).mockResolvedValueOnce({
      kind: "tui",
      availableKinds: ["desktop", "tui"],
      version: "1.2.3",
      backend: { getVersion: jest.fn(), listSpaces: jest.fn().mockResolvedValue([]), readPane: jest.fn(), sendLine: jest.fn(), pressKey: jest.fn() },
      machineId: "m1",
      closed: new Promise(() => {}),
      endReason: null,
      close: jest.fn().mockResolvedValue(undefined),
    });

    await act(() => result.current.switchKind("tui"));

    expect(saveMachineKind).toHaveBeenCalledWith("m1", "tui");
    await waitFor(() => expect(result.current.status).toMatchObject({ phase: "connected", kind: "tui" }));
  });

  it("gives no attempt when the failure came before detection", async () => {
    jest.mocked(openBridge).mockRejectedValueOnce(new ConnectError("loginFailed", "bad"));

    const { result } = renderConnection();

    await waitFor(() => expect(result.current.status).toMatchObject({ phase: "failed", attempt: undefined }));
  });

  // The page keeps one connection and moves it to the machine the person opens.
  describe("on a switch to another machine", () => {
    const other = { ...machine, id: "m2", name: "home-server" };

    function renderSwitchable() {
      jest.mocked(getMachine).mockImplementation(async (id) => (id === other.id ? other : machine));
      return renderHook(({ id }: { id: string }) => useMachineConnection(id, true), { initialProps: { id: "m1" } });
    }

    it("shows the new machine as connecting, not the last machine's connection", async () => {
      mockBridges(makeBridge(makeBackend()));
      const { result, rerender } = renderSwitchable();
      await waitFor(() => expect(result.current.status).toMatchObject({ phase: "connected" }));
      jest.mocked(openBridge).mockReturnValue(new Promise(() => {}));

      rerender({ id: "m2" });

      expect(result.current.status).toEqual({ phase: "connecting" });
      await waitFor(() => expect(openBridge).toHaveBeenLastCalledWith(expect.objectContaining({ machine: other })));
    });

    it("drops a connection to the last machine that opens after the switch", async () => {
      let openFirst: (bridge: Bridge) => void = () => {};
      jest.mocked(openBridge).mockReturnValueOnce(new Promise((resolve) => (openFirst = resolve)));
      jest.mocked(openBridge).mockReturnValueOnce(new Promise(() => {}));
      const { result, rerender } = renderSwitchable();
      await waitFor(() => expect(openBridge).toHaveBeenCalledTimes(1));

      rerender({ id: "m2" });
      await waitFor(() => expect(openBridge).toHaveBeenCalledTimes(2));
      await act(async () => openFirst(makeBridge(makeBackend())));

      expect(result.current.status).toEqual({ phase: "connecting" });
    });

    it("does not log in to a machine that was removed mid-connect", async () => {
      let givePassword: (password: string) => void = () => {};
      jest.mocked(getPassword).mockReturnValue(new Promise((resolve) => (givePassword = resolve)));
      const { result, rerender } = renderSwitchable();
      await waitFor(() => expect(getPassword).toHaveBeenCalled());

      await act(() => result.current.disconnect());
      // The page opens no machine after a remove; its id is then empty.
      rerender({ id: "" });
      await act(async () => givePassword("secret"));

      expect(openBridge).not.toHaveBeenCalled();
    });
  });

  describe("across screens", () => {
    it("keeps the connection open when the screen leaves", async () => {
      const bridge = makeBridge(makeBackend());
      mockBridges(bridge);
      const { result, unmount } = renderConnection();
      await waitFor(() => expect(result.current.status).toMatchObject({ phase: "connected" }));

      unmount();

      expect(bridge.close).not.toHaveBeenCalled();
    });

    it("shows the machine's open connection when its screen opens again, and checks it answers", async () => {
      const backend = makeBackend();
      jest.mocked(getOpenBridge).mockReturnValue(makeBridge(backend));

      const { result } = renderConnection();

      await waitFor(() => expect(result.current.status).toMatchObject({ phase: "connected", backend }));
      expect(getOpenBridge).toHaveBeenCalledWith("m1");
      expect(openBridge).not.toHaveBeenCalled();
      expect(backend.getVersion).toHaveBeenCalledTimes(1);
    });

    it("connects again when the open connection no longer answers", async () => {
      const silent = makeBackend();
      silent.getVersion.mockRejectedValue(new Error("link down"));
      jest.mocked(getOpenBridge).mockReturnValue(makeBridge(silent));
      const fresh = makeBackend();
      mockBridges(makeBridge(fresh));

      const { result } = renderConnection();

      await waitFor(() => expect(result.current.status).toMatchObject({ phase: "connected", backend: fresh }));
    });

    it("shows a drop of the open connection on the screen that opened it again", async () => {
      const kept = makeBridge(makeBackend());
      jest.mocked(getOpenBridge).mockReturnValue(kept);
      const { result } = renderConnection();
      await waitFor(() => expect(result.current.status).toMatchObject({ phase: "connected" }));

      await act(async () => kept.drop("connection lost"));

      expect(result.current.status).toMatchObject({ phase: "failed" });
    });

    it("closes the machine's connection on disconnect, also one still opening, for example before a remove", async () => {
      mockBridges(makeBridge(makeBackend()));
      const { result } = renderConnection();
      await waitFor(() => expect(result.current.status).toMatchObject({ phase: "connected" }));

      await act(() => result.current.disconnect());

      expect(closeOpenBridge).toHaveBeenCalledWith("m1");
    });

    it("asks to show the notice that holds the connection on the first connect only", async () => {
      jest.mocked(getNotificationPermissionAsked).mockResolvedValueOnce(false).mockResolvedValue(true);
      mockBridges(makeBridge(makeBackend()), makeBridge(makeBackend()));
      const { result } = renderConnection();
      await waitFor(() => expect(result.current.status).toMatchObject({ phase: "connected" }));
      await waitFor(() => expect(PermissionsAndroid.request).toHaveBeenCalledTimes(1));
      expect(PermissionsAndroid.request).toHaveBeenCalledWith(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
      expect(saveNotificationPermissionAsked).toHaveBeenCalledTimes(1);

      await act(() => result.current.reconnect());
      await waitFor(() => expect(getNotificationPermissionAsked).toHaveBeenCalledTimes(2));

      expect(PermissionsAndroid.request).toHaveBeenCalledTimes(1);
    });
  });

  describe("on return to the app", () => {
    it("reconnects when the link dropped while the app was away", async () => {
      const first = makeBackend();
      const second = makeBackend();
      const dropped = makeBridge(first);
      mockBridges(dropped, makeBridge(second));
      const { result, rerender } = renderConnection();
      await waitFor(() => expect(result.current.status).toMatchObject({ phase: "connected", backend: first }));

      rerender({ foreground: false });
      await act(async () => dropped.drop("connection lost"));
      expect(result.current.status).toMatchObject({ phase: "failed" });
      rerender({ foreground: true });

      await waitFor(() => expect(result.current.status).toMatchObject({ phase: "connected", backend: second }));
      expect(openBridge).toHaveBeenCalledTimes(2);
    });

    it("stays disconnected on return when the person disconnected from the notice", async () => {
      const disconnected = makeBridge(makeBackend());
      mockBridges(disconnected, makeBridge(makeBackend()));
      const { result, rerender } = renderConnection();
      await waitFor(() => expect(result.current.status).toMatchObject({ phase: "connected" }));

      rerender({ foreground: false });
      await act(async () => disconnected.drop(DISCONNECT_REQUESTED));
      expect(result.current.status).toEqual({ phase: "disconnected" });
      rerender({ foreground: true });
      await act(async () => {});

      expect(openBridge).toHaveBeenCalledTimes(1);
      expect(result.current.status).toEqual({ phase: "disconnected" });
    });

    it("does not reconnect when the person disconnects while the return probe waits for a reply", async () => {
      const kept = makeBridge(makeBackend());
      let failProbe: (error: Error) => void = () => {};
      kept.backend.getVersion = jest.fn(() => new Promise<string>((_resolve, reject) => (failProbe = reject)));
      jest.mocked(getOpenBridge).mockReturnValue(kept);
      mockBridges(makeBridge(makeBackend()));
      const { result } = renderConnection();
      await waitFor(() => expect(result.current.status).toMatchObject({ phase: "connected" }));

      await act(async () => {
        kept.endReason = DISCONNECT_REQUESTED;
        failProbe(new Error("Connection closed"));
      });
      await act(async () => kept.drop(DISCONNECT_REQUESTED));

      expect(openBridge).not.toHaveBeenCalled();
      expect(result.current.status).toEqual({ phase: "disconnected" });
    });

    it("shows a disconnect the person asked for while a connect is still opening as disconnected", async () => {
      jest.mocked(openBridge).mockRejectedValueOnce(new ConnectError("closed", DISCONNECT_REQUESTED));

      const { result } = renderConnection();

      await waitFor(() => expect(result.current.status).toEqual({ phase: "disconnected" }));
    });

    it("waits for the app to be in use again, for example unlocked, before it reconnects", async () => {
      const dropped = makeBridge(makeBackend());
      mockBridges(dropped, makeBridge(makeBackend()));
      const { result, rerender } = renderConnection();
      await waitFor(() => expect(result.current.status).toMatchObject({ phase: "connected" }));

      rerender({ foreground: false });
      await act(async () => dropped.drop("connection lost"));
      await act(async () => {});

      expect(openBridge).toHaveBeenCalledTimes(1);
    });

    it("reconnects when the link looks open but the probe gets no reply in time", async () => {
      jest.useFakeTimers();
      try {
        const first = makeBackend();
        const second = makeBackend();
        mockBridges(makeBridge(first), makeBridge(second));
        const { result, rerender } = renderConnection();
        await waitFor(() => expect(result.current.status).toMatchObject({ phase: "connected", backend: first }));
        first.getVersion.mockReturnValue(new Promise(() => {}));

        rerender({ foreground: false });
        rerender({ foreground: true });
        await act(async () => {
          jest.advanceTimersByTime(PROBE_TIMEOUT_MS);
        });

        await waitFor(() => expect(result.current.status).toMatchObject({ phase: "connected", backend: second }));
      } finally {
        jest.useRealTimers();
      }
    });

    it("keeps a live link and its screen as they are", async () => {
      const first = makeBackend();
      mockBridges(makeBridge(first), makeBridge(makeBackend()));
      const { result, rerender } = renderConnection();
      await waitFor(() => expect(result.current.status).toMatchObject({ phase: "connected", backend: first }));

      rerender({ foreground: false });
      rerender({ foreground: true });
      await act(async () => {});

      expect(first.getVersion).toHaveBeenCalledTimes(1);
      expect(openBridge).toHaveBeenCalledTimes(1);
      expect(result.current.status).toMatchObject({ phase: "connected", backend: first });
    });

    it("tries again on the next return when a reconnect after a drop found no network", async () => {
      const dropped = makeBridge(makeBackend());
      mockBridges(dropped);
      const { result, rerender } = renderConnection();
      await waitFor(() => expect(result.current.status).toMatchObject({ phase: "connected" }));

      rerender({ foreground: false });
      await act(async () => dropped.drop("connection lost"));
      rerender({ foreground: true });
      await waitFor(() => expect(result.current.status).toMatchObject({ phase: "failed" }));
      expect(openBridge).toHaveBeenCalledTimes(2);

      const second = makeBackend();
      mockBridges(makeBridge(second));
      rerender({ foreground: false });
      rerender({ foreground: true });

      await waitFor(() => expect(result.current.status).toMatchObject({ phase: "connected", backend: second }));
    });

    it("tries again on the next return when a reconnect after a silent link found no network", async () => {
      jest.useFakeTimers();
      try {
        const first = makeBackend();
        mockBridges(makeBridge(first));
        const { result, rerender } = renderConnection();
        await waitFor(() => expect(result.current.status).toMatchObject({ phase: "connected", backend: first }));
        first.getVersion.mockReturnValue(new Promise(() => {}));

        rerender({ foreground: false });
        rerender({ foreground: true });
        await act(async () => {
          jest.advanceTimersByTime(PROBE_TIMEOUT_MS);
        });
        await waitFor(() => expect(result.current.status).toMatchObject({ phase: "failed" }));
        expect(openBridge).toHaveBeenCalledTimes(2);

        const second = makeBackend();
        mockBridges(makeBridge(second));
        rerender({ foreground: false });
        rerender({ foreground: true });

        await waitFor(() => expect(result.current.status).toMatchObject({ phase: "connected", backend: second }));
      } finally {
        jest.useRealTimers();
      }
    });

    it("does not retry on return after a reconnect that failed on the login", async () => {
      const dropped = makeBridge(makeBackend());
      mockBridges(dropped);
      const { result, rerender } = renderConnection();
      await waitFor(() => expect(result.current.status).toMatchObject({ phase: "connected" }));
      jest.mocked(openBridge).mockRejectedValueOnce(new ConnectError("loginFailed", "bad"));

      rerender({ foreground: false });
      await act(async () => dropped.drop("connection lost"));
      rerender({ foreground: true });
      await waitFor(() => expect(result.current.status).toMatchObject({ phase: "failed" }));
      rerender({ foreground: false });
      rerender({ foreground: true });
      await act(async () => {});

      expect(openBridge).toHaveBeenCalledTimes(2);
    });

    it("leaves a login failure for the person to fix", async () => {
      jest.mocked(openBridge).mockRejectedValue(new ConnectError("loginFailed", "bad"));
      const { result, rerender } = renderConnection();
      await waitFor(() => expect(result.current.status).toMatchObject({ phase: "failed" }));

      rerender({ foreground: false });
      rerender({ foreground: true });
      await act(async () => {});

      expect(openBridge).toHaveBeenCalledTimes(1);
    });

    it("never sends again a line that failed while the link was down", async () => {
      const first = makeBackend();
      const second = makeBackend();
      const dropped = makeBridge(first);
      mockBridges(dropped, makeBridge(second));
      const { result, rerender } = renderConnection();
      await waitFor(() => expect(result.current.status).toMatchObject({ phase: "connected", backend: first }));
      const exposed = (result.current.status as Extract<ConnectionStatus, { phase: "connected" }>).backend;

      rerender({ foreground: false });
      await act(async () => dropped.drop("connection lost"));
      first.sendLine.mockRejectedValueOnce(new Error("link down"));
      await expect(exposed.sendLine("p1", "make test")).rejects.toThrow("link down");
      rerender({ foreground: true });
      await waitFor(() => expect(result.current.status).toMatchObject({ phase: "connected", backend: second }));

      expect(first.sendLine).toHaveBeenCalledTimes(1);
      expect(second.sendLine).not.toHaveBeenCalled();
      expect(second.pressKey).not.toHaveBeenCalled();
    });
  });
});
