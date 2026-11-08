import { router, useTheme } from "expo-router";
import { type ReactElement, type ReactNode, useContext, useState } from "react";
import { ActivityIndicator, Alert, Button, ScrollView, StyleSheet, Text, View } from "react-native";
import ReorderableList, { useReorderableDrag } from "react-native-reorderable-list";

import { LiftOnDrag, useDragPan } from "@/components/dragLift";
import { MachineHeader } from "@/components/MachineHeader";
import { MachineSheet } from "@/components/MachineSheet";
import { NeedsYouCards, SpaceList } from "@/components/SpaceList";
import type { HerdrKind } from "@/herdr/kinds";
import { useNoScreenLockNotice } from "@/lock/useNoScreenLockNotice";
import { type MachineConnection, MachineConnectionContext, useMachines } from "@/machines/MachineConnection";
import { NO_MACHINE } from "@/machines/openMachine";
import { openPane } from "@/machines/openPane";
import { type Machine, removeMachine } from "@/machines/store";
import type { ConnectionStatus } from "@/machines/useMachineConnection";
import { type SpaceOrderState, useSpaceOrder } from "@/spaceOrder/useSpaceOrder";

// A machine that is not open has no connection; its sheet offers Reconnect, which opens it.
const NOT_OPEN_STATUS: ConnectionStatus = { phase: "disconnected" };

/** The Spaces tab: the one page of machines, or how to add the first one. */
export default function SpacesScreen() {
  const { colors } = useTheme();
  const { machines } = useMachines();
  const showLockNotice = useNoScreenLockNotice();

  return (
    <View style={styles.screen}>
      {showLockNotice ? (
        <Text style={[styles.notice, { color: colors.text }]}>Set a screen lock on this phone to lock Herdhand.</Text>
      ) : null}
      {machines.length > 0 ? (
        <MachinesPage />
      ) : (
        <Text style={[styles.empty, { color: colors.text }]}>
          Tap + to add a machine that runs Herdr: a server, a VPS or a Mac you can reach over SSH.
        </Text>
      )}
    </View>
  );
}

/** The machines, and the sheet of the machine whose ⋮ was tapped: Edit, Reconnect, Remove, the Herdr kind. */
function MachinesPage() {
  const { machines } = useMachines();
  const [sheetMachineId, setSheetMachineId] = useState<string | null>(null);
  const confirmRemove = useConfirmRemove();
  const sheetMachine = machines.find((machine) => machine.id === sheetMachineId);

  return (
    <>
      <MachineList onMore={setSheetMachineId} />
      <SheetForMachine machine={sheetMachine} onClose={() => setSheetMachineId(null)} onRemove={confirmRemove} />
    </>
  );
}

/**
 * Every machine as a header with its state. The open machine is the one connected: under its
 * header, its spaces, a host key to trust, or the error. Its Needs you cards sit at the top. A tap
 * on a header folds it or opens that machine. While a machine is open its spaces are the list,
 * so the machines drag only when every machine is folded. The connection is null while no
 * machine is open, as after a Remove of the open machine.
 */
function MachineList({ onMore }: { onMore: (machineId: string) => void }) {
  const connection = useContext(MachineConnectionContext);
  const { machines, open, toggle } = useMachines();
  const id = connection?.id ?? NO_MACHINE;
  const status = connection?.status ?? NOT_OPEN_STATUS;
  const spaces = connection?.list.spaces ?? null;
  const spaceOrder = useSpaceOrder(id, status.phase === "connected" ? status.kind : null, spaces);
  const isPageFolded = open?.isFolded === true;

  /** A machine's header. Where the machines drag, a hold on it starts the drag. */
  function renderHeader(machine: Machine, onLongPress: () => void) {
    const isOpenMachine = machine.id === id;
    return (
      <MachineHeader
        key={machine.id}
        name={machine.name}
        state={isOpenMachine ? status.phase : "idle"}
        isExpanded={isOpenMachine && !isPageFolded}
        hasDivider={machine.id !== machines[0]?.id}
        onPress={() => toggle(machine.id)}
        onMore={() => onMore(machine.id)}
        onLongPress={onLongPress}
      />
    );
  }

  // These headers are outside the list, so a hold cannot drag them. It folds the page, as a tap on
  // the open machine's header does, so that letting go never opens another machine.
  function renderHeaders(machinesToShow: Machine[]) {
    return <View>{machinesToShow.map((machine) => renderHeader(machine, () => toggle(id)))}</View>;
  }

  if (!connection || isPageFolded) {
    const cards = <NeedsYouCards spaces={spaces ?? []} onOpenPane={(pane) => openPane(id, pane)} />;
    return <FoldedMachines cards={cards} renderHeader={renderHeader} />;
  }
  const openIndex = machines.findIndex((machine) => machine.id === id);
  const above = renderHeaders(machines.slice(0, openIndex + 1));
  const below = renderHeaders(machines.slice(openIndex + 1));
  return <OpenMachinePage connection={connection} spaceOrder={spaceOrder} header={above} footer={below} />;
}

type FoldedMachinesProps = {
  cards: ReactNode;
  renderHeader: (machine: Machine, onLongPress: () => void) => ReactNode;
};

/**
 * Every machine folded: the headers are the list's items, so a hold drags one to reorder it. The
 * list drags the items of one list, and while a machine is open its spaces are that list.
 */
function FoldedMachines({ cards, renderHeader }: FoldedMachinesProps) {
  const { machines, move } = useMachines();
  const dragPan = useDragPan();

  return (
    <ReorderableList
      style={styles.screen}
      panGesture={dragPan}
      shouldUpdateActiveItem
      data={machines}
      keyExtractor={(machine) => machine.id}
      onReorder={({ from, to }) => move(from, to)}
      ListHeaderComponent={<View style={styles.foldedHeader}>{cards}</View>}
      renderItem={({ item }) => <DraggableHeader machine={item} renderHeader={renderHeader} />}
    />
  );
}

/** A machine's header in the folded list: it lifts while dragged. */
function DraggableHeader({ machine, renderHeader }: { machine: Machine; renderHeader: FoldedMachinesProps["renderHeader"] }) {
  const drag = useReorderableDrag();
  return <LiftOnDrag>{renderHeader(machine, drag)}</LiftOnDrag>;
}

type OpenMachinePageProps = {
  connection: MachineConnection;
  spaceOrder: SpaceOrderState;
  /** The headers down to the open machine's. */
  header: ReactElement;
  /** The headers of the machines after it. */
  footer: ReactElement;
};

/** The open machine unfolded between the other headers: its spaces once connected, else its connection's state. */
function OpenMachinePage({ connection, spaceOrder, header, footer }: OpenMachinePageProps) {
  const { id, status, list, reconnect, trust } = connection;
  if (status.phase === "connected") {
    return (
      <SpaceList
        machineId={id}
        list={list}
        spaceOrder={spaceOrder}
        header={header}
        footer={footer}
        onOpenPane={(pane) => openPane(id, pane)}
      />
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.statusContent}>
      {header}
      <StatusView status={status} onTrust={trust} onReconnect={() => void reconnect()} />
      {footer}
    </ScrollView>
  );
}

/** Asks before a machine is removed. Removing the open machine closes its connection first. */
function useConfirmRemove() {
  const connection = useContext(MachineConnectionContext);
  const { reload, closeOpen } = useMachines();

  async function removeOne(machine: Machine) {
    if (connection && machine.id === connection.id) {
      await connection.disconnect();
      closeOpen();
    }
    await removeMachine(machine.id);
    await reload();
  }

  return function confirmRemove(machine: Machine) {
    Alert.alert(`Remove ${machine.name}?`, "Its password and host key are deleted from this phone.", [
      { text: "Cancel", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: () => void removeOne(machine) },
    ]);
  };
}

type SheetForMachineProps = {
  machine: Machine | undefined;
  onClose: () => void;
  onRemove: (machine: Machine) => void;
};

/** The sheet of the machine whose ⋮ was tapped: the open machine's connection, or Reconnect to open another. */
function SheetForMachine({ machine, onClose, onRemove }: SheetForMachineProps) {
  const connection = useContext(MachineConnectionContext);
  const { toggle } = useMachines();
  const openConnection = connection && machine?.id === connection.id ? connection : null;
  const status = openConnection?.status ?? NOT_OPEN_STATUS;

  function reconnect() {
    if (openConnection) void openConnection.reconnect();
    else if (machine) toggle(machine.id);
  }

  const actions = {
    edit: () => machine && router.push({ pathname: "/machine/new", params: { id: machine.id } }),
    reconnect,
    remove: () => machine && onRemove(machine),
    switchKind: (kind: HerdrKind) => void connection?.switchKind(kind),
  };
  return <MachineSheet machine={machine} status={status} onClose={onClose} actions={actions} />;
}

type StatusViewProps = {
  status: Exclude<ConnectionStatus, { phase: "connected" }>;
  onTrust: (fingerprint: string) => void;
  onReconnect: () => void;
};

/** The open machine's connection while it is not connected. */
function StatusView({ status, onTrust, onReconnect }: StatusViewProps) {
  switch (status.phase) {
    case "connecting":
      return <ActivityIndicator size="large" />;
    case "trust":
      return <TrustPrompt fingerprint={status.fingerprint} onTrust={onTrust} />;
    case "disconnected":
      return <Disconnected onReconnect={onReconnect} />;
    case "failed":
      return <Failed status={status} onReconnect={onReconnect} />;
  }
}

function TrustPrompt({ fingerprint, onTrust }: { fingerprint: string; onTrust: (fingerprint: string) => void }) {
  const { colors } = useTheme();

  return (
    <View style={styles.block}>
      <Text style={[styles.heading, { color: colors.text }]}>Check the host key</Text>
      <Text style={[styles.body, { color: colors.text }]}>
        This is the first connection to this machine. Check that the fingerprint matches the machine's own:
      </Text>
      <Text selectable style={[styles.fingerprint, { color: colors.text }]}>
        {fingerprint}
      </Text>
      <Text style={[styles.hint, { color: colors.text }]}>On the machine: ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub</Text>
      <Button title="Trust and connect" onPress={() => onTrust(fingerprint)} />
    </View>
  );
}

function Disconnected({ onReconnect }: { onReconnect: () => void }) {
  const { colors } = useTheme();

  return (
    <View style={styles.block}>
      <Text style={[styles.heading, { color: colors.text }]}>Disconnected</Text>
      <Button title="Reconnect" onPress={onReconnect} />
    </View>
  );
}

/** The error, and both keys when the machine shows a key other than the trusted one. */
function Failed({ status, onReconnect }: { status: Extract<ConnectionStatus, { phase: "failed" }>; onReconnect: () => void }) {
  const { colors } = useTheme();

  return (
    <View style={styles.block}>
      <Text style={[styles.heading, { color: colors.text }]}>{status.message}</Text>
      {status.presentedFingerprint ? (
        <>
          <Text style={[styles.body, { color: colors.text }]}>Trusted key:</Text>
          <Text selectable style={[styles.fingerprint, { color: colors.text }]}>
            {status.savedFingerprint}
          </Text>
          <Text style={[styles.body, { color: colors.text }]}>Key the machine shows now:</Text>
          <Text selectable style={[styles.fingerprint, { color: colors.text }]}>
            {status.presentedFingerprint}
          </Text>
          <Text style={[styles.hint, { color: colors.text }]}>
            If the machine was set up again, tap ⋮ on the machine above, remove it and add it again.
          </Text>
        </>
      ) : null}
      <Button title="Reconnect" onPress={onReconnect} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  notice: { paddingHorizontal: 16, paddingVertical: 12, opacity: 0.8 },
  empty: { padding: 16, fontSize: 16, opacity: 0.8 },
  statusContent: { paddingVertical: 8, gap: 16 },
  foldedHeader: { paddingTop: 8 },
  block: { gap: 12, paddingHorizontal: 16 },
  heading: { fontSize: 18 },
  body: { fontSize: 15 },
  hint: { fontSize: 13, opacity: 0.7 },
  fingerprint: { fontFamily: "monospace", fontSize: 14 },
});
