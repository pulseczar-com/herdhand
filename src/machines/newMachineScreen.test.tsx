import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { router, useLocalSearchParams } from "expo-router";

import NewMachineScreen from "../../app/machine/new";

import { PAIR_COMMAND } from "@/pairing/command";
import { ConnectError } from "@/ssh/errors";
import { pairMachine } from "@/ssh/pairing";

import { MachineConnectionContext } from "./MachineConnection";
import { addMachine, addPairedMachine, getMachine, getSignInPassword, type Machine, updateMachine } from "./store";

jest.mock("expo-router", () => ({
  router: { back: jest.fn() },
  Stack: { Screen: () => null },
  useLocalSearchParams: jest.fn(() => ({})),
  useTheme: () => ({ colors: { text: "#000", border: "#000", primary: "#000", background: "#fff", notification: "#f00" } }),
}));
jest.mock("@/navigationTheme", () => ({ getAccentInk: () => "#fff" }));
jest.mock("./store", () => ({
  addMachine: jest.fn(),
  addPairedMachine: jest.fn(),
  getMachine: jest.fn(),
  getSignInPassword: jest.fn(),
  updateMachine: jest.fn(),
}));
jest.mock("@/ssh/pairing", () => ({ pairMachine: jest.fn() }));
const mockCode = {
  name: "test-box",
  user: "test-user",
  host: "test-box.example.com",
  port: 2222,
  hostKeyFingerprints: ["SHA256:a"],
  oneTimeKeySeed: "seed",
};
// The camera cannot run in a test, so a button stands in for a scan.
jest.mock("@/pairing/PairingScanner", () => {
  const { Pressable, Text } = jest.requireActual("react-native");
  return {
    PairingScanner: ({ visible, onScanned }: { visible: boolean; onScanned: (code: typeof mockCode) => void }) =>
      visible ? (
        <Pressable onPress={() => onScanned(mockScannedCode())}>
          <Text>Simulate scan</Text>
        </Pressable>
      ) : null,
  };
});
let mockScannedCode = () => mockCode;
const mockMachines = { reload: jest.fn().mockResolvedValue(undefined), openMachine: jest.fn() };
jest.mock("./MachineConnection", () => {
  const { createContext } = jest.requireActual("react");
  return { useMachines: () => mockMachines, MachineConnectionContext: createContext(null) };
});

function fillIn() {
  fireEvent.press(screen.getByText("Use a password"));
  fireEvent.changeText(screen.getByLabelText("Address"), "test-box.example.com");
  fireEvent.changeText(screen.getByLabelText("User"), "test-user");
  fireEvent.changeText(screen.getByLabelText("Password"), "secret");
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(useLocalSearchParams).mockReturnValue({});
  mockScannedCode = () => mockCode;
});

function scan() {
  fireEvent.press(screen.getByText("Scan pairing code"));
  fireEvent.press(screen.getByText("Simulate scan"));
}

describe("the Add a machine screen", () => {
  it("saves the machine once when Connect is tapped twice", async () => {
    let finishSave: (machine: { id: string }) => void = () => {};
    jest.mocked(addMachine).mockReturnValue(new Promise((resolve) => (finishSave = resolve)) as never);
    render(<NewMachineScreen />);
    fillIn();

    fireEvent.press(screen.getByText("Connect"));
    fireEvent.press(screen.getByText("Connect"));
    finishSave({ id: "m1" });

    await waitFor(() => expect(addMachine).toHaveBeenCalledTimes(1));
  });

  it("goes back to the page with the new machine open, so it connects", async () => {
    jest.mocked(addMachine).mockResolvedValue({ id: "m2", name: "test-box", host: "test-box.example.com", port: 22, user: "test-user" });
    render(<NewMachineScreen />);
    fillIn();

    fireEvent.press(screen.getByText("Connect"));

    await waitFor(() => expect(router.back).toHaveBeenCalled());
    expect(mockMachines.reload).toHaveBeenCalled();
    expect(mockMachines.openMachine).toHaveBeenCalledWith("m2");
  });

  it("shows why a save failed and stays on the form", async () => {
    jest.mocked(addMachine).mockRejectedValue(new Error("Secure storage is not available"));
    render(<NewMachineScreen />);
    fillIn();

    fireEvent.press(screen.getByText("Connect"));

    expect(await screen.findByText("Could not save the machine: Secure storage is not available")).toBeTruthy();
    expect(router.back).not.toHaveBeenCalled();
  });

  describe("the two ways to add a machine", () => {
    it("starts with the address, then the name, and pairing with a code chosen", () => {
      render(<NewMachineScreen />);

      const labels = screen.getAllByLabelText(/^(Address|Name)$/).map((field) => field.props.accessibilityLabel);
      expect(labels).toEqual(["Address", "Name"]);
      expect(screen.getByText("Pair with a code")).toBeTruthy();
      expect(screen.getByText("Use a password")).toBeTruthy();
      expect(screen.getByText(PAIR_COMMAND)).toBeTruthy();
      expect(screen.getByText("Scan pairing code")).toBeTruthy();
      expect(screen.queryByLabelText("User")).toBeNull();
      expect(screen.queryByLabelText("Password")).toBeNull();
    });

    it("shows the user and password fields, and no scan button, when Use a password is chosen", () => {
      render(<NewMachineScreen />);

      fireEvent.press(screen.getByText("Use a password"));

      expect(screen.getByLabelText("User")).toBeTruthy();
      expect(screen.getByLabelText("Password")).toBeTruthy();
      expect(screen.queryByText("Scan pairing code")).toBeNull();
      expect(screen.queryByText(PAIR_COMMAND)).toBeNull();
    });

    it("keeps the typed address and name when a code is scanned, and fills the rest", () => {
      render(<NewMachineScreen />);
      fireEvent.changeText(screen.getByLabelText("Address"), "192.0.2.10");

      scan();

      expect(screen.getByLabelText("Address").props.value).toBe("192.0.2.10");
      expect(screen.getByLabelText("Name").props.value).toBe("test-box");
      expect(screen.getByLabelText("User").props.value).toBe("test-user");
      expect(screen.getByLabelText("Port").props.value).toBe("2222");
    });

    it("has nothing to save until a code is scanned", () => {
      render(<NewMachineScreen />);

      expect(screen.queryByText("Pair and connect")).toBeNull();
      expect(screen.queryByText("Connect")).toBeNull();
    });
  });

  describe("pairing by code", () => {
    it("fills the form from the code, with no password field", () => {
      render(<NewMachineScreen />);

      scan();

      expect(screen.getByLabelText("Address").props.value).toBe("test-box.example.com");
      expect(screen.getByLabelText("Port").props.value).toBe("2222");
      expect(screen.getByLabelText("User").props.value).toBe("test-user");
      expect(screen.queryByLabelText("Password")).toBeNull();
    });

    it("pairs with the details in the form, saves the machine and opens it", async () => {
      jest.mocked(pairMachine).mockResolvedValue("SHA256:a");
      jest.mocked(addPairedMachine).mockResolvedValue({ id: "m4", ...mockCode, signIn: "phoneKey" });
      render(<NewMachineScreen />);
      scan();
      fireEvent.changeText(screen.getByLabelText("Address"), "192.0.2.10");

      fireEvent.press(screen.getByText("Pair and connect"));

      await waitFor(() => expect(router.back).toHaveBeenCalled());
      const machine = { name: "test-box", host: "192.0.2.10", port: 2222, user: "test-user" };
      expect(pairMachine).toHaveBeenCalledWith(mockCode, machine);
      expect(addPairedMachine).toHaveBeenCalledWith(machine, "SHA256:a");
      expect(mockMachines.openMachine).toHaveBeenCalledWith("m4");
    });

    it("shows why pairing failed and saves nothing", async () => {
      jest.mocked(pairMachine).mockRejectedValue(new ConnectError("pairingNotFinished", "late"));
      render(<NewMachineScreen />);
      scan();

      fireEvent.press(screen.getByText("Pair and connect"));

      expect(await screen.findByText("Pairing did not finish. Run the command again.")).toBeTruthy();
      expect(addPairedMachine).not.toHaveBeenCalled();
      expect(router.back).not.toHaveBeenCalled();
    });

    it("takes the port from a new scan after pairing failed, and keeps the address", async () => {
      jest.mocked(pairMachine).mockRejectedValue(new ConnectError("pairingNotFinished", "late"));
      render(<NewMachineScreen />);
      scan();
      fireEvent.press(screen.getByText("Pair and connect"));
      expect(await screen.findByText("Pairing did not finish. Run the command again.")).toBeTruthy();
      mockScannedCode = () => ({ ...mockCode, host: "other-box.example.com", port: 22 });

      fireEvent.press(screen.getByText("Scan another code"));
      fireEvent.press(screen.getByText("Simulate scan"));

      // The address and name are kept once filled; the port comes from the new code.
      expect(screen.getByLabelText("Address").props.value).toBe("test-box.example.com");
      expect(screen.getByLabelText("Port").props.value).toBe("22");
      expect(screen.queryByText("Pairing did not finish. Run the command again.")).toBeNull();
    });
  });

  describe("in edit mode", () => {
    const saved: Machine = { id: "m3", name: "test-box", host: "test-box.example.com", port: 2222, user: "test-user" };
    const reconnect = jest.fn();

    function renderEdit(openId: string | null, machine: Machine = saved, password: string | null = "old-secret") {
      jest.mocked(useLocalSearchParams).mockReturnValue({ id: "m3" });
      jest.mocked(getMachine).mockResolvedValue(machine);
      jest.mocked(getSignInPassword).mockResolvedValue(password);
      jest.mocked(updateMachine).mockResolvedValue();
      const connection = openId ? ({ id: openId, reconnect } as never) : null;
      render(
        <MachineConnectionContext.Provider value={connection}>
          <NewMachineScreen />
        </MachineConnectionContext.Provider>,
      );
    }

    it("fills the form with the machine's details and password", async () => {
      renderEdit(null);

      await waitFor(() => expect(screen.getByLabelText("Address").props.value).toBe("test-box.example.com"));
      expect(screen.getByLabelText("Name").props.value).toBe("test-box");
      expect(screen.getByLabelText("Port").props.value).toBe("2222");
      expect(screen.getByLabelText("User").props.value).toBe("test-user");
      expect(screen.getByLabelText("Password").props.value).toBe("old-secret");
    });

    it("keeps a machine paired by code without a password field", async () => {
      renderEdit(null, { ...saved, signIn: "phoneKey" }, null);
      await waitFor(() => expect(screen.getByLabelText("Address").props.value).toBe("test-box.example.com"));

      fireEvent.press(screen.getByText("Save"));

      await waitFor(() => expect(router.back).toHaveBeenCalled());
      expect(screen.queryByLabelText("Password")).toBeNull();
      expect(updateMachine).toHaveBeenCalledWith("m3", expect.objectContaining({ port: 2222 }), null);
    });

    it("updates the machine in place and goes back, without adding one", async () => {
      renderEdit(null);
      await waitFor(() => expect(screen.getByLabelText("Address").props.value).toBe("test-box.example.com"));

      fireEvent.changeText(screen.getByLabelText("Name"), "renamed");
      fireEvent.press(screen.getByText("Save"));

      await waitFor(() => expect(router.back).toHaveBeenCalled());
      expect(updateMachine).toHaveBeenCalledWith("m3", expect.objectContaining({ name: "renamed", port: 2222 }), "old-secret");
      expect(addMachine).not.toHaveBeenCalled();
      expect(mockMachines.reload).toHaveBeenCalled();
    });

    it("reconnects the machine when it is the open one", async () => {
      renderEdit("m3");
      await waitFor(() => expect(screen.getByLabelText("Address").props.value).toBe("test-box.example.com"));

      fireEvent.press(screen.getByText("Save"));

      await waitFor(() => expect(reconnect).toHaveBeenCalled());
    });

    it("does not reconnect when another machine is open", async () => {
      renderEdit("m9");
      await waitFor(() => expect(screen.getByLabelText("Address").props.value).toBe("test-box.example.com"));

      fireEvent.press(screen.getByText("Save"));

      await waitFor(() => expect(router.back).toHaveBeenCalled());
      expect(reconnect).not.toHaveBeenCalled();
    });
  });
});
