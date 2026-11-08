import { act, renderHook } from "@testing-library/react-native";
import type { NativeScrollEvent, NativeSyntheticEvent, ScrollView } from "react-native";

import { useKeepAtEnd } from "./useKeepAtEnd";

/** A drag or fling that stopped this far from the end of a 1000-point list in a 400-point view. */
function stoppedAt(distanceToEnd: number) {
  const nativeEvent = { contentOffset: { y: 600 - distanceToEnd }, contentSize: { height: 1000 }, layoutMeasurement: { height: 400 } };
  return { nativeEvent } as NativeSyntheticEvent<NativeScrollEvent>;
}

function renderKeepAtEnd() {
  const { result } = renderHook(() => useKeepAtEnd());
  const scrollToEnd = jest.fn();
  // The test stands in for the mounted scroll view.
  (result.current.scrollRef as { current: unknown }).current = { scrollToEnd } as Partial<ScrollView>;
  return { keep: result.current, scrollToEnd };
}

function changeSize(keepAtEnd: () => void) {
  act(() => {
    keepAtEnd();
    jest.runOnlyPendingTimers();
  });
}

describe("useKeepAtEnd", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("follows new content while the person is at the end", () => {
    const { keep, scrollToEnd } = renderKeepAtEnd();

    changeSize(keep.keepAtEnd);

    expect(scrollToEnd).toHaveBeenCalledTimes(1);
  });

  it("stops following new content once a drag begins, so new output during the drag does not pull the view back", () => {
    const { keep, scrollToEnd } = renderKeepAtEnd();

    keep.stopFollowing();
    changeSize(keep.keepAtEnd);

    expect(scrollToEnd).not.toHaveBeenCalled();
  });

  it.each([
    { distanceToEnd: 0, follows: true },
    { distanceToEnd: 500, follows: false },
  ])("after a drag that stops $distanceToEnd points from the end, follows new content: $follows", ({ distanceToEnd, follows }) => {
    const { keep, scrollToEnd } = renderKeepAtEnd();

    keep.stopFollowing();
    keep.trackEnd(stoppedAt(distanceToEnd));
    changeSize(keep.keepAtEnd);

    expect(scrollToEnd).toHaveBeenCalledTimes(follows ? 1 : 0);
  });
});
