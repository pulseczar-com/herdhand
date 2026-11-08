import { router, Tabs, useTheme } from "expo-router";
import { type ReactElement, type ReactNode, useCallback, useContext, useState } from "react";
import { ActivityIndicator, Alert, Button, ScrollView, StyleSheet, Text, View } from "react-native";
import ReorderableList from "react-native-reorderable-list";
import { scheduleOnRN } from "react-native-worklets";

import { DragHandle, HandleButton } from "@/components/DragHandle";
import { HeaderActions, ReorderButton } from "@/components/HeaderActions";
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

/**
 * The Spaces tab: the one page of machines, or how to add the first one. Reorder in the header
 * shows the drag handles until Done.
 */
export default function SpacesScreen() {
  const { colors } = useTheme();
  const { machines } = useMachines();
  const showLockNotice = useNoScreenLockNotice();
  const [isReordering, setIsReordering] = useState(false);
  const hasMachines = machines.length > 0;
  const reorderButton = hasMachines ? <ReorderButton isReordering={isReordering} onPress={() => setIsReordering(!isReordering)} /> : null;

  return (
    <View style={styles.screen}>
      <Tabs.Screen options={{ headerRight: () => <HeaderActions>{reorderButton}</HeaderActions> }} />
      {showLockNotice ? (
        <Text style={[styles.notice, { color: colors.text }]}>Set a screen lock on this phone to lock Herdhand.</Text>
      ) : null}
      {hasMachines ? (
        <MachinesPage isReordering={isReordering} />
      ) : (
        <Text style={[styles.empty, { color: colors.text }]}>
          Tap + to add a machine that runs Herdr: a server, a VPS or a Mac you can reach over SSH.
        </Text>
      )}
    </View>
  );
}

/** The machines, and the sheet of the machine whose ⋮ was tapped: Edit, Reconnect, Remove, the Herdr kind. */
function MachinesPage({ isReordering }: { isReordering: boolean }) {
  const { machines } = useMachines();
  const [sheetMachineId, setSheetMachineId] = useState<string | null>(null);
  const confirmRemove = useConfirmRemove();
  const sheetMachine = machines.find((machine) => machine.id === sheetMachineId);

  return (
    <>
      <MachineList isReordering={isReordering} onMore={setSheetMachineId} />
      <SheetForMachine machine={sheetMachine} onClose={() => setSheetMachineId(null)} onRemove={confirmRemove} />
    </>
  );
}

/**
 * Every machine as a header with its state. The open machine is the one connected: under its
 * header, its spaces, a host key to trust, or the error. Its Needs you cards sit at the top. A tap
 * on a header folds it or opens that machine. In reorder mode a handle on every header drags the
 * machine to reorder it; every machine folds while it is dragged. The connection is null while no
 * machine is open, as after a Remove of the open machine.
 */
function MachineList({ isReordering, onMore }: { isReordering: boolean; onMore: (machineId: string) => void }) {
  const connection = useContext(MachineConnectionContext);
  const { machines, open, toggle } = useMachines();
  const id = connection?.id ?? NO_MACHINE;
  const status = connection?.status ?? NOT_OPEN_STATUS;
  const spaces = connection?.list.spaces ?? null;
  const spaceOrder = useSpaceOrder(id, status.phase === "connected" ? status.kind : null, spaces);
  // Set by a hold on a handle in the open machine's page: every machine shows folded until the drop.
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const isPageFolded = draggedId !== null || open?.isFolded === true;

  // The drop brings the open machine back.
  const endDrag = useCallback(() => setDraggedId(null), []);

  // A hold on a handle that never became a drag leaves the page folded; a tap on a header brings it back.
  function pressHeader(machineId: string) {
    if (draggedId === null) toggle(machineId);
    else setDraggedId(null);
  }

  /** A machine's header, with its drag handle in reorder mode. */
  function renderHeader(machine: Machine, handle: ReactNode) {
    const isOpenMachine = machine.id === id;
    return (
      <MachineHeader
        key={machine.id}
        name={machine.name}
        state={isOpenMachine ? status.phase : "idle"}
        isExpanded={isOpenMachine && !isPageFolded}
        hasDivider={machine.id !== machines[0]?.id}
        onPress={() => pressHeader(machine.id)}
        onMore={() => onMore(machine.id)}
      >
        {isReordering ? handle : null}
      </MachineHeader>
    );
  }

  /** Headers outside the reorderable list: a short hold on the handle folds the page and starts the drag there. */
  function renderHeaders(machinesToShow: Machine[]) {
    return (
      <View>
        {machinesToShow.map((machine) =>
          renderHeader(machine, <HandleButton name={machine.name} onLongPress={() => setDraggedId(machine.id)} />),
        )}
      </View>
    );
  }

  if (!connection || isPageFolded) {
    const cards = <NeedsYouCards spaces={spaces ?? []} onOpenPane={(pane) => openPane(id, pane)} />;
    return <FoldedMachines cards={cards} draggedId={draggedId} onDragEnd={endDrag} renderHeader={renderHeader} />;
  }
  const openIndex = machines.findIndex((machine) => machine.id === id);
  const above = renderHeaders(machines.slice(0, openIndex + 1));
  const below = renderHeaders(machines.slice(openIndex + 1));
  return <OpenMachinePage connection={connection} spaceOrder={spaceOrder} header={above} footer={below} isReordering={isReordering} />;
}

type FoldedMachinesProps = {
  cards: ReactNode;
  /** The machine whose drag began on a handle outside this list: it starts here at once. */
  draggedId: string | null;
  onDragEnd: () => void;
  renderHeader: (machine: Machine, handle: ReactNode) => ReactNode;
};

/**
 * Every machine folded: the headers are the list's items, so they drag to reorder. The list drags
 * the items of one list, and while a machine is open its spaces are that list. So a drag from the
 * open machine's page shows this list and starts the drag here; the open machine unfolds at the drop.
 */
function FoldedMachines({ cards, draggedId, onDragEnd, renderHeader }: FoldedMachinesProps) {
  const { machines, move } = useMachines();
  // The list calls its drag events on the UI thread.
  const onDragEndOnUi = useCallback(() => {
    "worklet";
    scheduleOnRN(onDragEnd);
  }, [onDragEnd]);

  return (
    <ReorderableList
      style={styles.screen}
      data={machines}
      keyExtractor={(machine) => machine.id}
      onReorder={({ from, to }) => move(from, to)}
      onDragEnd={onDragEndOnUi}
      ListHeaderComponent={<View style={styles.foldedHeader}>{cards}</View>}
      renderItem={({ item }) => <>{renderHeader(item, <DragHandle name={item.name} startNow={item.id === draggedId} />)}</>}
    />
  );
}

type OpenMachinePageProps = {
  connection: MachineConnection;
  spaceOrder: SpaceOrderState;
  /** The headers down to the open machine's. */
  header: ReactElement;
  /** The headers of the machines after it. */
  footer: ReactElement;
  isReordering: boolean;
};

/** The open machine unfolded between the other headers: its spaces once connected, else its connection's state. */
function OpenMachinePage({ connection, spaceOrder, header, footer, isReordering }: OpenMachinePageProps) {
  const { id, status, list, reconnect, trust } = connection;
  if (status.phase === "connected") {
    return (
      <SpaceList
        machineId={id}
        list={list}
        spaceOrder={spaceOrder}
        header={header}
        footer={footer}
        isReordering={isReordering}
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
