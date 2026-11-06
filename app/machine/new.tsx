import { router, Stack, useLocalSearchParams, useTheme } from "expo-router";
import { useContext, useEffect, useRef, useState } from "react";
import { KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { getErrorMessage } from "@/errorMessage";
import { type MachineFormValues, type ParsedMachine, parseMachineForm } from "@/machines/form";
import { MachineConnectionContext, useMachines } from "@/machines/MachineConnection";
import { addMachine, getMachine, getPassword, updateMachine } from "@/machines/store";
import { getAccentInk } from "@/navigationTheme";

const DEFAULT_SSH_PORT = "22";
const EMPTY_FORM: MachineFormValues = { name: "", host: "", port: DEFAULT_SSH_PORT, user: "", password: "" };

type SetField = (field: keyof MachineFormValues) => (text: string) => void;

type FieldProps = {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  hint?: string;
  secure?: boolean;
  numeric?: boolean;
};

/**
 * The "Add a machine" form. Saves the machine, then goes back to the page with it open, to
 * connect. With an `id` param it edits that machine instead: the form starts with its details,
 * Save updates it in place, and the open machine reconnects with them.
 */
export default function NewMachineScreen() {
  const { id: editId } = useLocalSearchParams<{ id?: string }>();
  const isEditing = editId !== undefined;
  const theme = useTheme();
  const { colors } = theme;
  const accentInk = getAccentInk(theme);
  const { values, setField } = useFormValues(editId);
  const { save, error } = useSaveMachine(editId);

  return (
    <KeyboardAvoidingView style={styles.screen} behavior="height">
      {isEditing ? <Stack.Screen options={{ title: "Edit machine" }} /> : null}
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={[styles.intro, { color: colors.text }]}>
          Connect to any machine that runs Herdr: a server, a VPS or a Mac you can reach over SSH.
        </Text>
        <MachineFields values={values} setField={setField} />
        {error ? <Text style={[styles.error, { color: colors.notification }]}>{error}</Text> : null}
        <Pressable
          style={[styles.connect, { backgroundColor: colors.primary }]}
          accessibilityRole="button"
          onPress={() => void save(values)}
        >
          <Text style={[styles.connectLabel, { color: accentInk }]}>{isEditing ? "Save" : "Connect"}</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/** The form's values: empty for a new machine, or the edited machine's details once they load. */
function useFormValues(editId: string | undefined) {
  const [values, setValues] = useState<MachineFormValues>(EMPTY_FORM);

  useEffect(() => {
    if (editId === undefined) return;
    void Promise.all([getMachine(editId), getPassword(editId)]).then(([machine, password]) => {
      if (!machine) return;
      setValues({ name: machine.name, host: machine.host, port: String(machine.port), user: machine.user, password: password ?? "" });
    });
  }, [editId]);

  const setField: SetField = (field) => (text) => setValues((current) => ({ ...current, [field]: text }));

  return { values, setField };
}

/**
 * Checks and saves the form, then goes back. A new machine is added and opened; an edited one is
 * updated, and reconnects when it is the open machine. A second tap while saving does nothing.
 */
function useSaveMachine(editId: string | undefined) {
  const connection = useContext(MachineConnectionContext);
  const { reload, openMachine } = useMachines();
  const [error, setError] = useState<string | null>(null);
  const isSaving = useRef(false);

  async function save(values: MachineFormValues) {
    const parsed = parseMachineForm(values);
    if ("error" in parsed) {
      setError(parsed.error);
      return;
    }
    if (isSaving.current) return;
    isSaving.current = true;
    try {
      if (editId === undefined) await saveNew(parsed);
      else await saveEdit(editId, parsed);
      router.back();
    } catch (failure) {
      setError(`Could not save the machine: ${getErrorMessage(failure)}`);
    } finally {
      isSaving.current = false;
    }
  }

  async function saveNew(parsed: ParsedMachine) {
    const machine = await addMachine(parsed.machine, parsed.password);
    await reload();
    openMachine(machine.id);
  }

  async function saveEdit(id: string, parsed: ParsedMachine) {
    await updateMachine(id, parsed.machine, parsed.password);
    await reload();
    if (connection?.id === id) void connection.reconnect();
  }

  return { save, error };
}

function MachineFields({ values, setField }: { values: MachineFormValues; setField: SetField }) {
  return (
    <>
      <Field label="Name" value={values.name} onChangeText={setField("name")} hint="Optional. The address is used if empty." />
      <Field label="Address" value={values.host} onChangeText={setField("host")} />
      <Field label="Port" value={values.port} onChangeText={setField("port")} numeric />
      <Field label="User" value={values.user} onChangeText={setField("user")} />
      <Field
        label="Password"
        value={values.password}
        onChangeText={setField("password")}
        secure
        hint="Saved on this phone only. The first time you connect, the app shows the machine's fingerprint for you to check."
      />
    </>
  );
}

function Field({ label, value, onChangeText, hint, secure = false, numeric = false }: FieldProps) {
  const { colors } = useTheme();

  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: colors.text }]}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChangeText}
        secureTextEntry={secure}
        keyboardType={numeric ? "number-pad" : "default"}
        autoCapitalize="none"
        autoCorrect={false}
        style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.card }]}
      />
      {hint ? <Text style={[styles.hint, { color: colors.text }]}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: 16, gap: 16 },
  intro: { fontSize: 15, opacity: 0.8 },
  field: { gap: 6 },
  label: { fontSize: 13, fontWeight: "500" },
  input: { height: 46, borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, fontSize: 15 },
  hint: { fontSize: 13, opacity: 0.7 },
  error: { fontSize: 14 },
  connect: { height: 50, borderRadius: 12, alignItems: "center", justifyContent: "center", marginTop: 8 },
  connectLabel: { fontSize: 16, fontWeight: "600" },
});
