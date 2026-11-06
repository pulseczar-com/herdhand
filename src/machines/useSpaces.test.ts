import { act, renderHook, waitFor } from "@testing-library/react-native";

import type { Backend, Space } from "@/herdr/backend";

import { useSpaces } from "./useSpaces";

const space = (name: string): Space => ({ id: name, name, tabs: [] });

function makeBackend(...replies: (Space[] | Error)[]): Backend {
  const listSpaces = jest.fn();
  for (const reply of replies) {
    if (reply instanceof Error) listSpaces.mockRejectedValueOnce(reply);
    else listSpaces.mockResolvedValueOnce(reply);
  }
  return { getVersion: jest.fn(), listSpaces, readPane: jest.fn(), sendLine: jest.fn(), pressKey: jest.fn() };
}

describe("useSpaces", () => {
  it("loads the spaces once connected", async () => {
    const backend = makeBackend([space("api")]);
    const { result } = renderHook(() => useSpaces(backend));
    expect(result.current.spaces).toBeNull();
    await waitFor(() => expect(result.current.spaces).toEqual([space("api")]));
    expect(result.current.error).toBeNull();
  });

  it("replaces the list on refresh", async () => {
    const backend = makeBackend([space("api")], [space("api"), space("docs")]);
    const { result } = renderHook(() => useSpaces(backend));
    await waitFor(() => expect(result.current.spaces).toHaveLength(1));

    await act(() => result.current.refresh());

    expect(result.current.spaces).toEqual([space("api"), space("docs")]);
    expect(result.current.refreshing).toBe(false);
  });

  it("keeps the last list and shows the error when a refresh fails", async () => {
    const backend = makeBackend([space("api")], new Error("Connection closed"), [space("docs")]);
    const { result } = renderHook(() => useSpaces(backend));
    await waitFor(() => expect(result.current.spaces).toHaveLength(1));

    await act(() => result.current.refresh());

    expect(result.current.spaces).toEqual([space("api")]);
    expect(result.current.error).toBe("Could not load the list: Connection closed");

    await act(() => result.current.refresh());

    expect(result.current.spaces).toEqual([space("docs")]);
    expect(result.current.error).toBeNull();
  });

  it("loads nothing while not connected", () => {
    const { result } = renderHook(() => useSpaces(null));

    expect(result.current.spaces).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it("starts from an empty list on a new connection", async () => {
    const first = makeBackend([space("api")]);
    const second = { ...makeBackend(), listSpaces: jest.fn(() => new Promise<Space[]>(() => {})) };
    const { result, rerender } = renderHook(({ backend }: { backend: Backend }) => useSpaces(backend), {
      initialProps: { backend: first },
    });
    await waitFor(() => expect(result.current.spaces).toHaveLength(1));

    rerender({ backend: second });

    expect(result.current.spaces).toBeNull();
  });
});
