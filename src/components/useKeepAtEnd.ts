import { useRef } from "react";
import type { NativeScrollEvent, NativeSyntheticEvent, ScrollView } from "react-native";

// How close to the end, in points, still counts as at the end.
const END_SLACK = 24;

/**
 * Keeps a scroll view at its end while the person is there, as on a terminal or a chat: new
 * content moves the view to the end only when the person was already at it.
 */
export function useKeepAtEnd() {
  const scrollRef = useRef<ScrollView>(null);
  // Starts true so the view opens at its end. Only the person's own scrolls change it: a scroll
  // the app made can land short of the end while content is mounting.
  const isAtEnd = useRef(true);

  /** For the start of a drag or a fling: content that grows during either must not pull the view back. */
  function stopFollowing() {
    isAtEnd.current = false;
  }

  /** For the end of a drag or a fling: notes whether the person stopped at the end. */
  function trackEnd({ nativeEvent }: NativeSyntheticEvent<NativeScrollEvent>) {
    const { contentOffset, contentSize, layoutMeasurement } = nativeEvent;
    const distanceToEnd = contentSize.height - layoutMeasurement.height - contentOffset.y;
    isAtEnd.current = distanceToEnd <= END_SLACK;
  }

  /** For a change of size: scrolls to the end a frame later, once the new content is mounted. */
  function keepAtEnd() {
    requestAnimationFrame(() => {
      if (isAtEnd.current) scrollRef.current?.scrollToEnd({ animated: false });
    });
  }

  return { scrollRef, stopFollowing, trackEnd, keepAtEnd };
}
