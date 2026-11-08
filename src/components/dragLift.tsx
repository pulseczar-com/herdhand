import { useTheme } from "expo-router";
import { type ReactNode, useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { Gesture } from "react-native-gesture-handler";
import { useIsActive } from "react-native-reorderable-list";

/** How long a hold on a row lasts before it counts as a long press. Rows pass it as `delayLongPress`. */
export const LONG_PRESS_MS = 500;
// The list's pan waits longer than the row's long press, so a swipe before that scrolls or
// refreshes the list, and the margin keeps the press ahead of the pan when the JavaScript thread is busy.
const PAN_DELAY_MS = LONG_PRESS_MS + 100;
const LIFT_SCALE = 1.03;
const LIFT_ELEVATION = 8;

/** The list's drag pan, held back until a row's long press has started its drag. */
export function useDragPan() {
  return useMemo(() => Gesture.Pan().activateAfterLongPress(PAN_DELAY_MS), []);
}

/** A list item that grows and casts a shadow while it is dragged. The list needs `shouldUpdateActiveItem`. */
export function LiftOnDrag({ children }: { children: ReactNode }) {
  const { colors } = useTheme();
  const isActive = useIsActive();

  return <View style={isActive ? [styles.lifted, { backgroundColor: colors.background }] : undefined}>{children}</View>;
}

const styles = StyleSheet.create({
  lifted: { transform: [{ scale: LIFT_SCALE }], elevation: LIFT_ELEVATION },
});
