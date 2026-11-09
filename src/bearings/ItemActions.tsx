import { Feather } from "@expo/vector-icons";
import { useTheme } from "expo-router";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { getPillBackground, useToneColor } from "@/components/StatePill";
import { getAccentColor } from "@/navigationTheme";

import { ACTIONS, type ActionId } from "./actions";

const BUTTON_SIZE = 40;
const ICON_SIZE = 20;

type ItemActionsProps = {
  actions: ActionId[];
  /** The item's title, for the question that Drop and Stop ask first. */
  itemTitle: string;
  /** "Firstmate (crew)", for the spoken label of Discuss. */
  firstmateName: string;
  isDisabled: boolean;
  onDiscuss: () => void;
  onAction: (action: ActionId) => void;
};

/**
 * The item's actions as icon buttons with a short name under each, since a phone has no
 * tooltip: Discuss first, then the actions its row allows. Drop and Stop ask first.
 */
export function ItemActions({ actions, itemTitle, firstmateName, isDisabled, onDiscuss, onAction }: ItemActionsProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  function press(action: ActionId) {
    const { label, confirm } = ACTIONS[action];
    if (!confirm) return onAction(action);
    Alert.alert(`${label} ${itemTitle}?`, undefined, [
      { text: "Cancel", style: "cancel" },
      { text: label, style: "destructive", onPress: () => onAction(action) },
    ]);
  }

  return (
    <View style={[styles.bar, { borderTopColor: colors.border, paddingBottom: 8 + insets.bottom }]}>
      <ActionButton icon="message-square" label="Discuss" spokenLabel={`Discuss with ${firstmateName}`} isAccent isDisabled={isDisabled} onPress={onDiscuss} />
      {actions.map((action) => (
        <ActionButton key={action} icon={ACTIONS[action].icon} label={ACTIONS[action].label} isDisabled={isDisabled} onPress={() => press(action)} />
      ))}
    </View>
  );
}

type ActionButtonProps = {
  icon: React.ComponentProps<typeof Feather>["name"];
  label: string;
  /** What a screen reader says, when it differs from the visible label. */
  spokenLabel?: string;
  isAccent?: boolean;
  isDisabled: boolean;
  onPress: () => void;
};

function ActionButton({ icon, label, spokenLabel, isAccent, isDisabled, onPress }: ActionButtonProps) {
  const theme = useTheme();
  const { colors } = theme;
  const muted = useToneColor("neutral");
  const color = isAccent ? colors.primary : muted;

  return (
    <Pressable style={[styles.action, isDisabled && styles.disabled]} accessibilityRole="button" accessibilityLabel={spokenLabel ?? label} disabled={isDisabled} onPress={onPress}>
      <View style={[styles.icon, isAccent && { backgroundColor: getPillBackground(getAccentColor(theme)) }]}>
        <Feather name={icon} size={ICON_SIZE} color={color} />
      </View>
      <Text style={[styles.name, { color }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: "row", gap: 8, paddingTop: 8, paddingHorizontal: 12, borderTopWidth: StyleSheet.hairlineWidth },
  action: { alignItems: "center", gap: 2, minWidth: 56 },
  icon: { width: BUTTON_SIZE, height: BUTTON_SIZE, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  name: { fontSize: 10, fontWeight: "600" },
  disabled: { opacity: 0.5 },
});
