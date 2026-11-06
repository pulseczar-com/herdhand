import { MaterialIcons } from "@expo/vector-icons";
import { useTheme } from "expo-router";
import { useEffect } from "react";
import { Pressable, StyleSheet } from "react-native";
import { useReorderableDrag } from "react-native-reorderable-list";

const ICON_SIZE = 20;
const HIT_SLOP = 8;

/** The handle's look and its label, for a list item or for a header outside any list. */
export function HandleButton({ name, onPressIn }: { name: string; onPressIn: () => void }) {
  const { colors } = useTheme();

  return (
    <Pressable accessibilityLabel={`Drag ${name}`} onPressIn={onPressIn} hitSlop={HIT_SLOP}>
      <MaterialIcons name="drag-indicator" size={ICON_SIZE} color={colors.text} style={styles.dimmed} />
    </Pressable>
  );
}

/**
 * The handle of a row in a reorderable list: a touch on it starts the row's drag, so a scroll that
 * starts elsewhere on the row still scrolls. It works only inside a list item. With `startNow`
 * the row's drag starts when the handle first shows, for a touch that began on a handle outside the list.
 */
export function DragHandle({ name, startNow = false }: { name: string; startNow?: boolean }) {
  const drag = useReorderableDrag();

  useEffect(() => {
    if (startNow) drag();
    // Only when the handle first shows: the touch that began the drag is still down.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <HandleButton name={name} onPressIn={drag} />;
}

const styles = StyleSheet.create({
  dimmed: { opacity: 0.6 },
});
