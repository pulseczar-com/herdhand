// The standard Jest mocks of the native drag packages, from their own docs.
import "react-native-gesture-handler/jestSetup";
import { setUpTests } from "react-native-reanimated";

jest.mock("react-native-worklets", () => jest.requireActual("react-native-worklets/src/mock"));

setUpTests();
