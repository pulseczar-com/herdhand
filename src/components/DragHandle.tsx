import { MaterialIcons } from "@expo/vector-icons";
import { useTheme } from "expo-router";
import { useEffect } from "react";
import { Pressable, StyleSheet } from "react-native";
import { useReorderableDrag } from "react-native-reorderable-list";

const ICON_SIZE = 20;
const HIT_SLOP = 8;
// A tap on the handle must not start a drag: the library's gesture can end before a drag from a press starts, and the list stays stuck.
const DRAG_DELAY_MS = 150;

/** The handle's look and its label, for a list item or for a header outside any list. A short hold starts the drag. */
export function HandleButton({
  name,
  onLongPress,
}: {
  name: string;
  onLongPress: () => void;
}) {
  const { colors } = useTheme();

  return (
    <Pressable
      accessibilityLabel={`Drag ${name}`}
      onLongPress={onLongPress}
      delayLongPress={DRAG_DELAY_MS}
      hitSlop={HIT_SLOP}
    >
      <MaterialIcons
        name="drag-indicator"
        size={ICON_SIZE}
        color={colors.text}
        style={styles.dimmed}
      />
    </Pressable>
  );
}

/**
 * The handle of a row in a reorderable list: a short hold on it starts the row's drag, so a tap or
 * a scroll that starts elsewhere on the row still works. It works only inside a list item. With `startNow`
 * the row's drag starts when the handle first shows, for a touch that began on a handle outside the list.
 */
export function DragHandle({
  name,
  startNow = false,
}: {
  name: string;
  startNow?: boolean;
}) {
  const drag = useReorderableDrag();

  useEffect(() => {
    if (startNow) drag();
    // Only when the handle first shows: the touch that began the drag is still down.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <HandleButton name={name} onLongPress={drag} />;
}

const styles = StyleSheet.create({
  dimmed: { opacity: 0.6 },
});
