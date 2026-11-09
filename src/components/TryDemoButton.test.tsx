import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { router } from "expo-router";
import { Alert } from "react-native";

import { TryDemoButton } from "./TryDemoButton";

const mockStartDemo = jest.fn();

jest.mock("expo-router", () => ({ router: { navigate: jest.fn() } }));
jest.mock("@/machines/MachineConnection", () => ({ useMachines: () => ({ startDemo: mockStartDemo }) }));

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Alert, "alert").mockImplementation(() => {});
});

describe("TryDemoButton", () => {
  it("opens the demo and goes to the machine list", async () => {
    mockStartDemo.mockResolvedValue(undefined);
    render(<TryDemoButton />);

    fireEvent.press(screen.getByText("Try the demo"));

    await waitFor(() => expect(router.navigate).toHaveBeenCalledWith("/"));
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it("shows the error and stays on the screen when the demo cannot open", async () => {
    mockStartDemo.mockRejectedValue(new Error("storage is full"));
    render(<TryDemoButton />);

    fireEvent.press(screen.getByText("Try the demo"));

    await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith("Could not open the demo", "storage is full"));
    expect(router.navigate).not.toHaveBeenCalled();
  });
});
