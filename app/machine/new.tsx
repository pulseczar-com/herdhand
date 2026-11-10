import { router, Stack, useLocalSearchParams, useTheme } from "expo-router";
import { useContext, useEffect, useRef, useState } from "react";
import { KeyboardAvoidingView, Linking, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View } from "react-native";

import { getErrorMessage } from "@/errorMessage";
import { fillFormFromCode, type MachineFormValues, type ParsedMachine, parseMachineForm } from "@/machines/form";
import { MachineConnectionContext, useMachines } from "@/machines/MachineConnection";
import { addMachine, addPairedMachine, getMachine, getSignInPassword, type NewMachine, updateMachine } from "@/machines/store";
import { getAccentInk } from "@/navigationTheme";
import { type PairingCode } from "@/pairing/code";
import { PAIR_COMMAND, PAIR_SCRIPT_URL } from "@/pairing/command";
import { PairingScanner } from "@/pairing/PairingScanner";
import { ConnectError, describePairingError } from "@/ssh/errors";
import { pairMachine } from "@/ssh/pairing";

const DEFAULT_SSH_PORT = "22";
const EMPTY_FORM: MachineFormValues = { name: "", host: "", port: "", user: "", password: "" };

type SignInMode = "code" | "password";

type SetField = (field: keyof MachineFormValues) => (text: string) => void;

type FieldProps = {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  hint?: string;
  placeholder?: string;
  secure?: boolean;
  numeric?: boolean;
};

/**
 * The "Add a machine" form: the host and name, then a choice. Pair with a code shows the
 * command to run on the machine and the scan button; Use a password shows the user and password.
 * A scanned code fills the name, host and port the person did not type, and replaces the password with the
 * phone key. Saving goes back to the page with the machine open, to connect.
 * With an `id` param it edits that machine instead: the form starts with its details, Save
 * updates it in place, and the open machine reconnects with them.
 */
export default function NewMachineScreen() {
  const { id: editId } = useLocalSearchParams<{ id?: string }>();
  const isEditing = editId !== undefined;
  const { colors } = useTheme();
  const { values, setValues, setField } = useFormValues(editId);
  const [mode, setMode] = useState<SignInMode>("code");
  const [code, setCode] = useState<PairingCode | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const lastScanned = useRef<PairingCode | null>(null);
  const { save, error, clearError, isPairing } = useSaveMachine(editId, code);

  function fillFromCode(scanned: PairingCode) {
    const previous = lastScanned.current;
    lastScanned.current = scanned;
    setCode(scanned);
    clearError();
    setValues((current) => fillFormFromCode(current, scanned, previous));
  }

  function chooseMode(chosen: SignInMode) {
    if (chosen === mode) return;
    setMode(chosen);
    setCode(null);
    clearError();
    setValues((current) => ({ ...current, password: chosen === "password" ? "" : null }));
  }

  // Before a code is scanned, pairing has nothing to save: the scan button is the next step.
  const hasCredentials = isEditing || mode === "password" || code !== null;
  const actionLabel = getActionLabel(isEditing, code !== null, isPairing);

  return (
    <KeyboardAvoidingView style={styles.screen} behavior="height">
      {isEditing ? <Stack.Screen options={{ title: "Edit machine" }} /> : null}
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={[styles.intro, { color: colors.text }]}>
          Connect to any machine that runs Herdr: a server, a VPS or a Mac you can reach over SSH.
        </Text>
        <Field label="Host" value={values.host} onChangeText={setField("host")} hint="Name or IP address this phone can reach" />
        <Field label="Name" value={values.name} onChangeText={setField("name")} hint="Optional. The host is used if empty." />
        <Field label="Port" value={values.port} onChangeText={setField("port")} placeholder={DEFAULT_SSH_PORT} numeric />
        {isEditing ? null : <SignInChoice mode={mode} onChoose={chooseMode} />}
        {isEditing || mode === "password" ? null : (
          <CodeSteps hasCode={code !== null} onScan={() => setIsScanning(true)} />
        )}
        {hasCredentials ? <CredentialFields values={values} setField={setField} /> : null}
        {error ? <Text style={[styles.error, { color: colors.notification }]}>{error}</Text> : null}
        {hasCredentials ? <ActionButton label={actionLabel} onPress={() => void save(values)} /> : null}
      </ScrollView>
      <PairingScanner visible={isScanning} onScanned={fillFromCode} onClose={() => setIsScanning(false)} />
    </KeyboardAvoidingView>
  );
}

function SignInChoice({ mode, onChoose }: { mode: SignInMode; onChoose: (mode: SignInMode) => void }) {
  return (
    <View style={styles.choice}>
      <ChoiceButton label="Pair with a code" detail="Recommended" isSelected={mode === "code"} onPress={() => onChoose("code")} />
      <ChoiceButton label="Use a password" isSelected={mode === "password"} onPress={() => onChoose("password")} />
    </View>
  );
}

function ChoiceButton({ label, detail, isSelected, onPress }: { label: string; detail?: string; isSelected: boolean; onPress: () => void }) {
  const { colors } = useTheme();

  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected: isSelected }}
      onPress={onPress}
      style={[styles.choiceButton, { borderColor: isSelected ? colors.primary : colors.border, backgroundColor: colors.card }]}
    >
      <Text style={[styles.choiceLabel, { color: colors.text }]}>{label}</Text>
      {detail ? <Text style={[styles.hint, { color: colors.text }]}>{detail}</Text> : null}
    </Pressable>
  );
}

/** The command to run on the machine, and the button that opens the camera for the code it shows. */
function CodeSteps({ hasCode, onScan }: { hasCode: boolean; onScan: () => void }) {
  const { colors } = useTheme();

  return (
    <View style={styles.pairing}>
      <Text style={[styles.body, { color: colors.text }]}>
        {hasCode
          ? "From the pairing code. Herdhand logs in with this phone's key. Check the details, then pair."
          : "Log in with this phone's key instead of a password. On the machine, run this command in a terminal, then scan the code it shows:"}
      </Text>
      {hasCode ? null : <CommandBlock />}
      <ActionButton label={hasCode ? "Scan another code" : "Scan pairing code"} onPress={onScan} />
    </View>
  );
}

/** The command as text that can be selected and copied, a Share button and a link to the script. */
function CommandBlock() {
  const { colors } = useTheme();

  return (
    <View style={styles.pairing}>
      <View style={styles.commandRow}>
        <Text selectable style={[styles.command, { color: colors.text, borderColor: colors.border, backgroundColor: colors.card }]}>
          {PAIR_COMMAND}
        </Text>
        <Pressable accessibilityRole="button" onPress={() => void Share.share({ message: PAIR_COMMAND })}>
          <Text style={[styles.link, { color: colors.primary }]}>Share</Text>
        </Pressable>
      </View>
      <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(PAIR_SCRIPT_URL)}>
        <Text style={[styles.link, { color: colors.primary }]}>View the script on GitHub</Text>
      </Pressable>
    </View>
  );
}

function ActionButton({ label, onPress }: { label: string; onPress: () => void }) {
  const theme = useTheme();
  const { colors } = theme;
  const accentInk = getAccentInk(theme);

  return (
    <Pressable style={[styles.connect, { backgroundColor: colors.primary }]} accessibilityRole="button" onPress={onPress}>
      <Text style={[styles.connectLabel, { color: accentInk }]}>{label}</Text>
    </Pressable>
  );
}

function getActionLabel(isEditing: boolean, hasCode: boolean, isPairing: boolean): string {
  if (isEditing) return "Save";
  if (!hasCode) return "Connect";
  if (isPairing) return "Pairing…";
  return "Pair and connect";
}

/** The form's values: empty for a new machine, or the edited machine's details once they load. */
function useFormValues(editId: string | undefined) {
  const [values, setValues] = useState<MachineFormValues>(EMPTY_FORM);

  useEffect(() => {
    if (editId === undefined) return;
    void getMachine(editId).then(async (machine) => {
      if (!machine) return;
      const password = await getSignInPassword(machine);
      setValues({ name: machine.name, host: machine.host, port: String(machine.port), user: machine.user, password });
    });
  }, [editId]);

  const setField: SetField = (field) => (text) => setValues((current) => ({ ...current, [field]: text }));

  return { values, setValues, setField };
}

/**
 * Checks and saves the form, then goes back. A new machine is added and opened; an edited one is
 * updated, and reconnects when it is the open machine. With a pairing code, the machine is saved
 * only once the phone key logs in. A second tap while saving does nothing.
 */
function useSaveMachine(editId: string | undefined, code: PairingCode | null) {
  const connection = useContext(MachineConnectionContext);
  const { reload, openMachine } = useMachines();
  const [error, setError] = useState<string | null>(null);
  const [isPairing, setIsPairing] = useState(false);
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
      if (code) {
        const pairingFailure = await savePaired(code, parsed.machine);
        if (pairingFailure) {
          setError(pairingFailure);
          return;
        }
      } else if (editId === undefined) await saveNew(parsed);
      else await saveEdit(editId, parsed);
      router.back();
    } catch (failure) {
      setError(`Could not save the machine: ${getErrorMessage(failure)}`);
    } finally {
      isSaving.current = false;
    }
  }

  async function saveNew(parsed: ParsedMachine) {
    // Only a pairing code removes the password field, and a code saves through savePaired.
    const machine = await addMachine(parsed.machine, parsed.password ?? "");
    await reload();
    openMachine(machine.id);
  }

  async function saveEdit(id: string, parsed: ParsedMachine) {
    await updateMachine(id, parsed.machine, parsed.password);
    await reload();
    if (connection?.id === id) void connection.reconnect();
  }

  /** Pairs, then saves and opens the machine. Resolves with why pairing failed, or null. */
  async function savePaired(pairingCode: PairingCode, machine: NewMachine): Promise<string | null> {
    setIsPairing(true);
    try {
      const fingerprint = await pairMachine(pairingCode, machine);
      const saved = await addPairedMachine(machine, fingerprint);
      await reload();
      openMachine(saved.id);
      return null;
    } catch (failure) {
      if (failure instanceof ConnectError) return describePairingError(failure, machine);
      throw failure;
    } finally {
      setIsPairing(false);
    }
  }

  return { save, error, clearError: () => setError(null), isPairing };
}

function CredentialFields({ values, setField }: { values: MachineFormValues; setField: SetField }) {
  return (
    <>
      <Field label="User" value={values.user} onChangeText={setField("user")} />
      {values.password === null ? null : (
        <Field
          label="Password"
          value={values.password}
          onChangeText={setField("password")}
          secure
          hint="Saved on this phone only. The first time you connect, the app shows the machine's fingerprint for you to check."
        />
      )}
    </>
  );
}

function Field({ label, value, onChangeText, hint, placeholder, secure = false, numeric = false }: FieldProps) {
  const { colors } = useTheme();

  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: colors.text }]}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholder={placeholder}
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
  body: { fontSize: 15 },
  commandRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  pairing: { gap: 8 },
  choice: { gap: 8 },
  choiceButton: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12 },
  choiceLabel: { fontSize: 16, fontWeight: "500" },
  command: { flex: 1, fontFamily: "monospace", fontSize: 13, borderWidth: 1, borderRadius: 10, padding: 12 },
  link: { fontSize: 16, paddingVertical: 4 },
  error: { fontSize: 14 },
  connect: { height: 50, borderRadius: 12, alignItems: "center", justifyContent: "center", marginTop: 8 },
  connectLabel: { fontSize: 16, fontWeight: "600" },
});
