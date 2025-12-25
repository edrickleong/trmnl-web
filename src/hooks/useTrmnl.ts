import { useState, useEffect, useCallback, useRef } from "react";
import {
  getState,
  fetchDevices,
  fetchImage,
  selectDevice,
  setEnvironment,
  formatTimeRemaining,
  getLoginUrl,
  updateState,
  type TrmnlState,
  type Device,
  type Environment,
} from "../lib/trmnl-api";

// Event system for state updates
const stateListeners = new Set<() => void>();

function notifyStateChange() {
  stateListeners.forEach((listener) => listener());
}

// Wrap update functions to notify listeners
function wrappedSelectDevice(device: Device) {
  selectDevice(device);
  notifyStateChange();
}

function wrappedSetEnvironment(environment: Environment) {
  setEnvironment(environment);
  notifyStateChange();
}

export function useTrmnl() {
  const [state, setState] = useState<TrmnlState>(getState);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const refreshTimeoutRef = useRef<number | null>(null);
  const countdownIntervalRef = useRef<number | null>(null);
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

  // Load devices
  const loadDevices = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const devices = await fetchDevices(state.environment);
      if (!devices || devices.length === 0) {
        setError("No devices found. Please enter your API key manually.");
      }
      refreshState();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load devices");
    } finally {
      setIsLoading(false);
    }
  }, [state.environment, refreshState]);

  // Load image
  const loadImage = useCallback(
    async (forceRefresh = false) => {
      if (fetchInProgressRef.current) {
        console.log("Fetch already in progress, skipping");
        return;
      }

      fetchInProgressRef.current = true;
      setIsLoading(true);
      setError(null);

      try {
        const imageUrl = await fetchImage(forceRefresh);
        if (!imageUrl) {
          setError("Failed to load image. Please check your API key.");
        }
        refreshState();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load image");
      } finally {
        setIsLoading(false);
        // Add small delay before allowing next fetch
        setTimeout(() => {
          fetchInProgressRef.current = false;
        }, 1000);
      }
    },
    [refreshState]
  );

  // Force refresh
  const forceRefresh = useCallback(async () => {
    await loadImage(true);
  }, [loadImage]);

  // Update countdown display
  const updateCountdown = useCallback(() => {
    const currentState = getState();
    setCountdown(formatTimeRemaining(currentState.nextFetch));
  }, []);

  // Setup refresh timer
  const setupRefreshTimer = useCallback(() => {
    // Clear existing timers
    if (refreshTimeoutRef.current) {
      clearTimeout(refreshTimeoutRef.current);
      refreshTimeoutRef.current = null;
    }
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }

    const currentState = getState();
    if (!currentState.nextFetch) {
      setCountdown("Unknown");
      return;
    }

    const timeToRefresh = currentState.nextFetch - Date.now();

    if (timeToRefresh <= 0) {
      // Time to refresh now
      loadImage();
      return;
    }

    // Start countdown interval
    updateCountdown();
    countdownIntervalRef.current = window.setInterval(updateCountdown, 1000);

    // Set timeout for next refresh
    refreshTimeoutRef.current = window.setTimeout(() => {
      loadImage();
    }, timeToRefresh);
  }, [loadImage, updateCountdown]);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
      }
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
      }
    };
  }, []);

  // Setup refresh timer when state changes
  useEffect(() => {
    if (state.nextFetch) {
      setupRefreshTimer();
    }
  }, [state.nextFetch, setupRefreshTimer]);

  // Change selected device
  const changeDevice = useCallback((device: Device) => {
    wrappedSelectDevice(device);
  }, []);

  // Change environment
  const changeEnvironment = useCallback((environment: Environment) => {
    wrappedSetEnvironment(environment);
  }, []);

  // Save manual API key
  const saveManualApiKey = useCallback(
    async (apiKey: string) => {
      // Create a manual device entry with the API key
      const manualDevice: Device = {
        id: "manual",
        name: "Manual Device",
        api_key: apiKey,
      };

      updateState({
        devices: [manualDevice],
        selectedDevice: manualDevice,
        retryCount: 0,
        retryAfter: null,
      });

      notifyStateChange();

      // Immediately try to fetch the image
      setIsLoading(true);
      setError(null);

      try {
        const imageUrl = await fetchImage(true);
        if (!imageUrl) {
          setError("Failed to load image. Please check your API key.");
        }
        refreshState();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load image");
      } finally {
        setIsLoading(false);
        fetchInProgressRef.current = false;
      }
    },
    [refreshState]
  );

  // Open login page
  const openLogin = useCallback(() => {
    const loginUrl = getLoginUrl(state.environment);
    window.open(loginUrl, "_blank");
  }, [state.environment]);

  // Initialize - load devices and image on first mount
  useEffect(() => {
    const init = async () => {
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
    loadDevices,
    loadImage,
    forceRefresh,
    changeDevice,
    changeEnvironment,
    saveManualApiKey,
    openLogin,
    refreshState,
  };
}
