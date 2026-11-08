import { useMemo } from "react";
import { Gesture } from "react-native-gesture-handler";

/** How long a hold on a row lasts before it counts as a long press. Rows pass it as `delayLongPress`. */
export const LONG_PRESS_MS = 500;
// The library's own margin: the pan waits just longer than the row's long press, so a swipe before
// that scrolls or refreshes the list, and a hold that lifts the row can go straight on to a drag.
const PAN_MARGIN_MS = 20;

/** The list's drag pan, held back until a row's long press has started its drag. */
export function useDragPan() {
  return useMemo(() => Gesture.Pan().activateAfterLongPress(LONG_PRESS_MS + PAN_MARGIN_MS), []);
}
