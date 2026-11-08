import { useTheme } from "expo-router";
import { type ReactNode, useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { Gesture } from "react-native-gesture-handler";
import { useIsActive } from "react-native-reorderable-list";

// A row starts its drag on the long press of a Pressable, which lasts 500 ms. The list's pan
// waits a little longer, so a swipe before that scrolls or refreshes the list instead.
const PAN_DELAY_MS = 520;
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
