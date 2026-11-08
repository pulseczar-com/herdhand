import { render, screen, userEvent } from "@testing-library/react-native";

import { DragHandle, HandleButton } from "./DragHandle";

const mockDrag = jest.fn();

jest.mock("expo-router", () => ({
  useTheme: () => ({
    dark: false,
    colors: {
      text: "#000",
      border: "#000",
      background: "#fff",
      card: "#fff",
      primary: "#00f",
    },
  }),
}));

// The library's drag runs on the native UI thread: only whether the handle starts it is checked here.
jest.mock("react-native-reorderable-list", () => ({
  useReorderableDrag: () => mockDrag,
}));

describe("DragHandle", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockDrag.mockClear();
  });

  afterEach(() => jest.useRealTimers());

  // A drag that starts on a touch can start after the library's gesture ended, which leaves the list
  // stuck in a drag and unable to scroll. A tap must not start a drag; a hold must.
  it.each([
    { touch: "tap", hold: false, starts: 0 },
    { touch: "hold", hold: true, starts: 1 },
  ])("starts $starts drags on a $touch", async ({ hold, starts }) => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    render(<DragHandle name="api" />);
    const handle = screen.getByLabelText("Drag api");

    if (hold) await user.longPress(handle, { duration: 300 });
    else await user.press(handle);

    expect(mockDrag).toHaveBeenCalledTimes(starts);
  });

  it.each([
    { touch: "tap", hold: false, starts: 0 },
    { touch: "hold", hold: true, starts: 1 },
  ])(
    "starts $starts drags from a handle outside a list on a $touch",
    async ({ hold, starts }) => {
      const onLongPress = jest.fn();
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      render(<HandleButton name="test-box" onLongPress={onLongPress} />);
      const handle = screen.getByLabelText("Drag test-box");

      if (hold) await user.longPress(handle, { duration: 300 });
      else await user.press(handle);

      expect(onLongPress).toHaveBeenCalledTimes(starts);
    },
  );
});
