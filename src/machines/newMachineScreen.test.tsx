import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { router, useLocalSearchParams } from "expo-router";

import NewMachineScreen from "../../app/machine/new";

import { MachineConnectionContext } from "./MachineConnection";
import { addMachine, getMachine, getPassword, updateMachine } from "./store";

jest.mock("expo-router", () => ({
  router: { back: jest.fn() },
  Stack: { Screen: () => null },
  useLocalSearchParams: jest.fn(() => ({})),
  useTheme: () => ({ colors: { text: "#000", border: "#000", primary: "#000", background: "#fff", notification: "#f00" } }),
}));
jest.mock("@/navigationTheme", () => ({ getAccentInk: () => "#fff" }));
jest.mock("./store", () => ({ addMachine: jest.fn(), getMachine: jest.fn(), getPassword: jest.fn(), updateMachine: jest.fn() }));
const mockMachines = { reload: jest.fn().mockResolvedValue(undefined), openMachine: jest.fn() };
jest.mock("./MachineConnection", () => {
  const { createContext } = jest.requireActual("react");
  return { useMachines: () => mockMachines, MachineConnectionContext: createContext(null) };
});

function fillIn() {
  fireEvent.changeText(screen.getByLabelText("Address"), "test-box.example.com");
  fireEvent.changeText(screen.getByLabelText("User"), "test-user");
  fireEvent.changeText(screen.getByLabelText("Password"), "secret");
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(useLocalSearchParams).mockReturnValue({});
});

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

  describe("in edit mode", () => {
    const saved = { id: "m3", name: "test-box", host: "test-box.example.com", port: 2222, user: "test-user" };
    const reconnect = jest.fn();

    function renderEdit(openId: string | null) {
      jest.mocked(useLocalSearchParams).mockReturnValue({ id: "m3" });
      jest.mocked(getMachine).mockResolvedValue(saved);
      jest.mocked(getPassword).mockResolvedValue("old-secret");
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
