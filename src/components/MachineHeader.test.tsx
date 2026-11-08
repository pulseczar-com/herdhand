import { render, screen, userEvent } from "@testing-library/react-native";

import { MachineHeader } from "./MachineHeader";

jest.mock("expo-router", () => ({
  useTheme: () => ({ dark: false, colors: { text: "#000", border: "#000", background: "#fff" } }),
}));

describe("MachineHeader", () => {
  beforeEach(() => jest.useFakeTimers());

  afterEach(() => jest.useRealTimers());

  function renderHeader(onLongPress?: () => void) {
    const onPress = jest.fn();
    render(
      <MachineHeader
        name="test-box"
        state="idle"
        isExpanded={false}
        hasDivider={false}
        onPress={onPress}
        onMore={jest.fn()}
        onLongPress={onLongPress}
      />,
    );
    return onPress;
  }

  it("folds or opens on a tap and starts no drag", async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    const onLongPress = jest.fn();
    const onPress = renderHeader(onLongPress);

    await user.press(screen.getByText("test-box"));

    expect(onPress).toHaveBeenCalledTimes(1);
    expect(onLongPress).not.toHaveBeenCalled();
  });

  it("starts the drag on a long press and does not fold or open", async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    const onLongPress = jest.fn();
    const onPress = renderHeader(onLongPress);

    await user.longPress(screen.getByText("test-box"), { duration: 600 });

    expect(onLongPress).toHaveBeenCalledTimes(1);
    expect(onPress).not.toHaveBeenCalled();
  });
});
