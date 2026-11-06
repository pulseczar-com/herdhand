import { MaterialIcons } from "@expo/vector-icons";
import { useTheme } from "expo-router";
import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import type { BadgeTone } from "@/herdr/badges";
import type { ConnectionStatus } from "@/machines/useMachineConnection";

import { StateDot } from "./StatePill";

const ICON_SIZE = 20;
const HIT_SLOP = 8;

/** A machine's state: its connection's phase when it is the open machine, or idle. */
type MachineState = ConnectionStatus["phase"] | "idle";

const MACHINE_STATES: Record<MachineState, { label: string; tone: BadgeTone }> = {
  idle: { label: "Not connected", tone: "neutral" },
  connecting: { label: "Connecting", tone: "neutral" },
  trust: { label: "Check the host key", tone: "attention" },
  disconnected: { label: "Disconnected", tone: "neutral" },
  connected: { label: "Connected", tone: "success" },
  failed: { label: "Not connected", tone: "danger" },
};

type MachineHeaderProps = {
  name: string;
  state: MachineState;
  isExpanded: boolean;
  onPress: () => void;
  onMore: () => void;
  /** A hairline above the header, to part it from the machine before it. */
  hasDivider: boolean;
  /** Shown last: the drag handle. */
  children?: ReactNode;
};

/** A machine's header on the page: its name and state. A tap folds or opens it; ⋮ opens its sheet. */
export function MachineHeader({ name, state, isExpanded, onPress, onMore, hasDivider, children }: MachineHeaderProps) {
  const { colors } = useTheme();
  const { label, tone } = MACHINE_STATES[state];
  const chevronName = isExpanded ? "expand-more" : "chevron-right";

  // The fold and ⋮ are side by side, not one inside the other, so a screen reader reaches both.
  return (
    <View style={[styles.header, hasDivider && styles.divider, { backgroundColor: colors.background, borderColor: colors.border }]}>
      <Pressable
        style={styles.fold}
        accessibilityRole="button"
        accessibilityState={{ expanded: isExpanded }}
        onPress={onPress}
        android_ripple={{ color: colors.border }}
      >
        <MaterialIcons name="dns" size={ICON_SIZE} color={colors.text} style={styles.dimmed} />
        <Text numberOfLines={1} style={[styles.name, { color: colors.text }]}>
          {name}
        </Text>
        <StateDot tone={tone} />
        <Text style={[styles.state, { color: colors.text }]}>{label}</Text>
        <MaterialIcons name={chevronName} size={ICON_SIZE} color={colors.text} style={styles.dimmed} />
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={`${name} actions`} hitSlop={HIT_SLOP} onPress={onMore}>
        <MaterialIcons name="more-vert" size={ICON_SIZE} color={colors.text} style={styles.dimmed} />
      </Pressable>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", gap: 10, paddingRight: 16 },
  divider: { borderTopWidth: StyleSheet.hairlineWidth },
  fold: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10, minHeight: 48, paddingLeft: 16 },
  name: { flex: 1, fontSize: 15, fontWeight: "500" },
  state: { fontSize: 12, opacity: 0.7 },
  dimmed: { opacity: 0.6 },
});
