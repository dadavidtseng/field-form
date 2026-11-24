import NetInfo from '@react-native-community/netinfo';

type Listener = () => void;

const listeners = new Set<Listener>();
let wasConnected: boolean | null = null;
let unsubscribe: (() => void) | null = null;

/**
 * Calls `listener` whenever the device goes from offline to connected, so sockets can retry
 * at once instead of waiting out their backoff. "Connected" rather than "internet reachable":
 * a job-site network may reach the sync server without reaching the internet.
 * One NetInfo subscription is shared by every socket. Returns an unsubscribe function.
 */
export function onNetworkBack(listener: Listener): () => void {
  listeners.add(listener);
  if (!unsubscribe) {
    unsubscribe = NetInfo.addEventListener((state) => {
      const connected = state.isConnected === true;
      if (connected && wasConnected === false) for (const l of listeners) l();
      wasConnected = connected;
    });
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && unsubscribe) {
      unsubscribe();
      unsubscribe = null;
      wasConnected = null;
    }
  };
}
