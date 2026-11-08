import Ssh from "../../modules/ssh";

/** The stream of the Herdr bridge, which also runs the detection command before it. */
export const BRIDGE_STREAM = "bridge";
/** The stream of the Herdr events, beside the bridge on the same connection. */
export const EVENTS_STREAM = "events";

/** Listens to one stream's output and end. Returns the function that stops listening. */
export function listenToStream(id: string, onData: (text: string) => void, onEnd: (reason: string) => void): () => void {
  const dataListener = Ssh.addListener("onData", (event) => {
    if (event.id === id) onData(event.text);
  });
  const closedListener = Ssh.addListener("onClosed", (event) => {
    // An empty id is the native module's disconnect with no stream open; it ends every listener.
    if (event.id === id || event.id === "") onEnd(event.reason);
  });
  return () => {
    dataListener.remove();
    closedListener.remove();
  };
}
