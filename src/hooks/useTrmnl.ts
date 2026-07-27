import { useState, useEffect, useCallback, useRef } from "react";
import {
  getState,
  fetchImage,
  fetchNextScreen,
  triggerSpecialFunction,
  setAdvancePlaylist,
  setRefreshOverride,
  getEffectiveRefreshRate,
  formatCountdown,
  updateState,
  type TrmnlState,
  type Device,
} from "@/lib/trmnl-api";

// Event system for state updates
const stateListeners = new Set<() => void>();

function notifyStateChange() {
  stateListeners.forEach((listener) => listener());
}

// Wrap update functions to notify listeners
function wrappedSetAdvancePlaylist(advancePlaylist: boolean) {
  setAdvancePlaylist(advancePlaylist);
  notifyStateChange();
}

// When the next scheduled fetch is allowed to run: normally the server's
// refresh_rate, pushed out further while we're in an error backoff.
function getDueTime(state: TrmnlState): number | null {
  const { nextFetch, retryAfter } = state;
  if (retryAfter && (!nextFetch || retryAfter > nextFetch)) {
    return retryAfter;
  }
  return nextFetch;
}

export function useTrmnl() {
  const [state, setState] = useState<TrmnlState>(getState);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<string>("--:--");
  const fetchInProgressRef = useRef(false);

  // Subscribe to state changes
  useEffect(() => {
    const handleStateChange = () => {
      setState(getState());
    };
    stateListeners.add(handleStateChange);
    return () => {
      stateListeners.delete(handleStateChange);
    };
  }, []);

  // Refresh state from localStorage
  const refreshState = useCallback(() => {
    setState(getState());
  }, []);

  // Load image. `force` re-downloads even if the screen hasn't changed;
  // `ignoreSchedule` skips the "not due yet" guard, which the timer needs
  // because it is the thing deciding that the fetch is due.
  const runFetch = useCallback(
    async ({
      force = false,
      ignoreSchedule,
      advance,
    }: {
      force?: boolean;
      ignoreSchedule?: boolean;
      // Overrides the current mode — the Next button advances even while
      // mirroring.
      advance?: boolean;
    } = {}) => {
      if (fetchInProgressRef.current) {
        console.log("Fetch already in progress, skipping");
        return;
      }

      if (!(ignoreSchedule ?? force)) {
        const due = getDueTime(getState());
        if (due && Date.now() < due) {
          console.log("Next fetch not due yet, skipping premature fetch");
          return;
        }
      }

      fetchInProgressRef.current = true;
      setIsLoading(true);
      setError(null);

      try {
        // Mirror mode reads the current screen; advance mode pulls the next one
        // and consumes a playlist position, the way a real device does.
        // Failures are reported through state.lastError, which distinguishes a
        // bad key from a backoff from a dead connection.
        if (advance ?? getState().advancePlaylist) {
          await fetchNextScreen();
        } else {
          await fetchImage(force);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load image");
      } finally {
        // Backstop: any path that returned without moving nextFetch forward
        // (401, an aborted fetch) would otherwise leave the timer permanently
        // due and retrying every tick.
        const after = getState();
        if (!after.nextFetch || after.nextFetch <= Date.now()) {
          updateState({
            nextFetch:
              Date.now() + getEffectiveRefreshRate(after.refreshRate) * 1000,
          });
        }
        refreshState();
        setIsLoading(false);
        // Add small delay before allowing next fetch
        setTimeout(() => {
          fetchInProgressRef.current = false;
        }, 1000);
      }
    },
    [refreshState]
  );

  const loadImage = useCallback(
    (forceRefresh = false) => runFetch({ force: forceRefresh }),
    [runFetch]
  );

  // Re-read the current screen. Explicitly non-advancing in both modes: left to
  // fall through to `advancePlaylist` this would advance the playlist in
  // virtual-device mode, making Refresh a duplicate of Next.
  const forceRefresh = useCallback(async () => {
    await runFetch({ force: true, advance: false });
  }, [runFetch]);

  // Advance the device to its next screen, whichever mode we're in
  const nextScreen = useCallback(async () => {
    await runFetch({ advance: true, ignoreSchedule: true });
  }, [runFetch]);

  // Go to previous screen (special function)
  const previousScreen = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const success = await triggerSpecialFunction();
      if (!success) {
        setError(
          "Failed to trigger previous screen. Ensure special function is configured."
        );
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to trigger previous screen"
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  // A single tick drives both the countdown and the scheduled fetch. Polling
  // for "is it due yet?" instead of arming a one-shot timeout means a skipped
  // or failed fetch can't leave the refresh loop dead.
  useEffect(() => {
    const tick = () => {
      const currentState = getState();
      const due = getDueTime(currentState);
      setCountdown(formatCountdown(due));

      if (!due || !currentState.selectedDevice) return;
      if (fetchInProgressRef.current) return;
      if (Date.now() >= due) {
        runFetch({ ignoreSchedule: true });
      }
    };

    tick();
    const intervalId = window.setInterval(tick, 1000);
    return () => window.clearInterval(intervalId);
  }, [runFetch]);

  // Toggle whether the refresh timer advances the playlist
  const changeAdvancePlaylist = useCallback((advancePlaylist: boolean) => {
    wrappedSetAdvancePlaylist(advancePlaylist);
  }, []);

  // Pin the refresh interval (or 0/null to follow the server). Rebases the
  // pending fetch off the last one so the countdown reflects the new interval
  // straight away instead of after the next refresh.
  const changeRefreshOverride = useCallback((seconds: number | null) => {
    setRefreshOverride(seconds);
    const current = getState();
    const base = current.lastFetch ?? Date.now();
    updateState({ nextFetch: base + getEffectiveRefreshRate() * 1000 });
    notifyStateChange();
  }, []);

  // Save manual API key
  const saveManualApiKey = useCallback(
    async (apiKey: string) => {
      // The id is derived from the key so that pasting a different key is
      // treated as a different device. The name is unused — a device
      // Access-Token can't read the real one.
      const manualDevice: Device = {
        id: `manual-${apiKey.slice(-6)}`,
        name: "TRMNL device",
        api_key: apiKey,
      };

      updateState({
        devices: [manualDevice],
        selectedDevice: manualDevice,
        // A different key is a different device, so don't keep showing the old
        // one's screen while the new one loads.
        currentImage: null,
        lastFetch: null,
        nextFetch: null,
        noScreenRendered: false,
        retryCount: 0,
        retryAfter: null,
      });

      notifyStateChange();

      // Immediately try to fetch the image
      await runFetch({ force: true });
    },
    [runFetch]
  );

  // Initialize - load the current screen on first mount
  useEffect(() => {
    const init = async () => {
      // A failure from a previous session says nothing about this one, and
      // showing it before we've tried anything is misleading.
      updateState({ lastError: null });
      refreshState();

      // If we already have a selected device, load the image
      const currentState = getState();
      if (currentState.selectedDevice) {
        await loadImage();
      }
    };

    init();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    // State
    state,
    isLoading,
    error,
    countdown,

    // Actions
    loadImage,
    forceRefresh,
    nextScreen,
    previousScreen,
    changeAdvancePlaylist,
    changeRefreshOverride,
    saveManualApiKey,
    refreshState,
  };
}
