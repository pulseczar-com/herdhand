import { MaterialIcons } from "@expo/vector-icons";
import { useTheme } from "expo-router";
import type { ComponentProps } from "react";
import { type ColorValue, Modal, Pressable, StyleSheet, Text, View } from "react-native";

import { isDemoMachine } from "@/demo/demoMachine";
import { HERDR_KINDS, type HerdrKind, KIND_LABELS } from "@/herdr/kinds";
import type { Machine } from "@/machines/store";
import type { ConnectionStatus } from "@/machines/useMachineConnection";

import { useToneColor } from "./StatePill";

// Dims the screen behind the sheet.
const SCRIM_COLOR = "rgba(0,0,0,0.4)";
const ICON_SIZE = 22;

type MachineSheetProps = {
  /** The sheet shows while there is a machine. */
  machine: Machine | undefined;
  status: ConnectionStatus;
  onClose: () => void;
  actions: { edit: () => void; reconnect: () => void; remove: () => void; switchKind: (kind: HerdrKind) => void };
};

/**
 * The machine's details and actions, in a sheet that slides up from the bottom: its address,
 * the Herdr kind and version, the kind choice when it runs both, Edit, Reconnect and Remove (Leave the demo for the demo machine, which has no Edit).
 * A tap outside or the back button closes it.
 */
export function MachineSheet({ machine, status, onClose, actions }: MachineSheetProps) {
  const { colors } = useTheme();
  const destructiveColor = useToneColor("danger");
  const kinds = getKinds(status);
  const canSwitchKind = kinds !== null && kinds.available.length > 1;
  const canReconnect = status.phase !== "connecting";
  // The demo machine has no address to edit; removing it leaves the demo.
  const isDemo = isDemoMachine(machine);
  const removeLabel = isDemo ? "Leave the demo" : "Remove machine";

  function closeThenRun(action: () => void) {
    onClose();
    action();
  }

  return (
    <Modal visible={machine !== undefined} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.scrim} accessibilityLabel="Close" onPress={onClose} />
      <View style={[styles.sheet, { backgroundColor: colors.card }]}>
        <View style={[styles.handle, { backgroundColor: colors.border }]} />
        <Text style={[styles.title, { color: colors.text }]}>{machine?.name}</Text>
        <Text style={[styles.detail, { color: colors.text }]}>{describeMachine(machine, status)}</Text>
        {canSwitchKind ? (
          <KindToggle selected={kinds.selected} onSelect={(kind) => closeThenRun(() => actions.switchKind(kind))} />
        ) : null}
        {isDemo ? null : <SheetAction icon="edit" label="Edit" color={colors.text} onPress={() => closeThenRun(actions.edit)} />}
        {canReconnect ? (
          <SheetAction icon="refresh" label="Reconnect" color={colors.text} onPress={() => closeThenRun(actions.reconnect)} />
        ) : null}
        <SheetAction icon="delete-outline" label={removeLabel} color={destructiveColor} onPress={() => closeThenRun(actions.remove)} />
      </View>
    </Modal>
  );
}

/** "test-user@test-box.example.com · Herdr App 0.1.17", or the address alone before the connection. */
function describeMachine(machine: Machine | undefined, status: ConnectionStatus): string {
  if (!machine) return "";
  const address = `${machine.user}@${machine.host}`;
  if (status.phase !== "connected") return address;
  return `${address} · ${KIND_LABELS[status.kind]} ${status.version}`;
}

/** The kind in use and the kinds the machine offers, once they are known. */
function getKinds(status: ConnectionStatus): { selected: HerdrKind; available: HerdrKind[] } | null {
  if (status.phase === "connected") return { selected: status.kind, available: status.availableKinds };
  if (status.phase === "failed" && status.attempt) return { selected: status.attempt.kind, available: status.attempt.availableKinds };
  return null;
}

type SheetActionProps = {
  icon: ComponentProps<typeof MaterialIcons>["name"];
  label: string;
  color: ColorValue;
  onPress: () => void;
};

/** One action of the sheet: an icon and a label in one color. */
function SheetAction({ icon, label, color, onPress }: SheetActionProps) {
  const { colors } = useTheme();

  return (
    <Pressable style={styles.action} accessibilityRole="button" onPress={onPress} android_ripple={{ color: colors.border }}>
      <MaterialIcons name={icon} size={ICON_SIZE} color={color} />
      <Text style={[styles.actionLabel, { color }]}>{label}</Text>
    </Pressable>
  );
}

/** Shown when the machine runs both Herdr App and Herdr TUI. */
function KindToggle({ selected, onSelect }: { selected: HerdrKind; onSelect: (kind: HerdrKind) => void }) {
  const { colors } = useTheme();

  return (
    <View style={[styles.toggle, { borderColor: colors.border }]} accessibilityRole="radiogroup">
      {HERDR_KINDS.map((kind) => {
        const isSelected = kind === selected;
        const labelColor = isSelected ? colors.background : colors.text;
        return (
          <Pressable
            key={kind}
            accessibilityRole="radio"
            accessibilityState={{ selected: isSelected }}
            disabled={isSelected}
            onPress={() => onSelect(kind)}
            style={[styles.toggleOption, isSelected && { backgroundColor: colors.primary }]}
          >
            <Text style={{ color: labelColor }}>{KIND_LABELS[kind]}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: SCRIM_COLOR },
  sheet: { borderTopLeftRadius: 18, borderTopRightRadius: 18, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 24, gap: 8 },
  handle: { alignSelf: "center", width: 32, height: 4, borderRadius: 2, marginBottom: 8 },
  title: { fontSize: 18, fontWeight: "600" },
  detail: { fontSize: 14, opacity: 0.7, marginBottom: 8 },
  action: { flexDirection: "row", alignItems: "center", gap: 16, minHeight: 48 },
  actionLabel: { fontSize: 16 },
  toggle: { flexDirection: "row", borderWidth: 1, borderRadius: 999, overflow: "hidden", alignSelf: "flex-start", marginBottom: 8 },
  toggleOption: { paddingHorizontal: 16, paddingVertical: 8 },
});
