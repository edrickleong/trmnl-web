// TRMNL API Service
// Handles communication with the TRMNL API

const HOSTS = {
  development: "http://localhost:3000",
  production: "https://usetrmnl.com",
};

const DEFAULT_REFRESH_RATE = 30; // seconds

export type Environment = "development" | "production";

export interface Device {
  id: string;
  name: string;
  api_key: string;
  friendly_id?: string;
  [key: string]: unknown;
}

export interface CurrentImage {
  url: string; // base64 data URL
  originalUrl: string; // CDN URL from API
  filename: string;
  timestamp: number;
}

export interface TrmnlState {
  environment: Environment;
  devices: Device[];
  selectedDevice: Device | null;
  currentImage: CurrentImage | null;
  lastFetch: number | null;
  nextFetch: number | null;
  refreshRate: number;
  retryCount: number;
  retryAfter: number | null;
}

// Storage keys
const STORAGE_KEYS = {
  environment: "trmnl_environment",
  devices: "trmnl_devices",
  selectedDevice: "trmnl_selectedDevice",
  currentImage: "trmnl_currentImage",
  lastFetch: "trmnl_lastFetch",
  nextFetch: "trmnl_nextFetch",
  refreshRate: "trmnl_refreshRate",
  retryCount: "trmnl_retryCount",
  retryAfter: "trmnl_retryAfter",
  firstSetupComplete: "trmnl_firstSetupComplete",
};

// Helper functions for localStorage
function getStorageItem<T>(key: string, defaultValue: T): T {
  try {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : defaultValue;
  } catch {
    return defaultValue;
  }
}

function setStorageItem<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.error(`Failed to save ${key} to localStorage:`, error);
  }
}

// Get the current state from localStorage
export function getState(): TrmnlState {
  return {
    environment: getStorageItem<Environment>(
      STORAGE_KEYS.environment,
      "production"
    ),
    devices: getStorageItem<Device[]>(STORAGE_KEYS.devices, []),
    selectedDevice: getStorageItem<Device | null>(
      STORAGE_KEYS.selectedDevice,
      null
    ),
    currentImage: getStorageItem<CurrentImage | null>(
      STORAGE_KEYS.currentImage,
      null
    ),
    lastFetch: getStorageItem<number | null>(STORAGE_KEYS.lastFetch, null),
    nextFetch: getStorageItem<number | null>(STORAGE_KEYS.nextFetch, null),
    refreshRate: getStorageItem<number>(
      STORAGE_KEYS.refreshRate,
      DEFAULT_REFRESH_RATE
    ),
    retryCount: getStorageItem<number>(STORAGE_KEYS.retryCount, 0),
    retryAfter: getStorageItem<number | null>(STORAGE_KEYS.retryAfter, null),
  };
}

// Update state in localStorage
export function updateState(updates: Partial<TrmnlState>): TrmnlState {
  if (updates.environment !== undefined) {
    setStorageItem(STORAGE_KEYS.environment, updates.environment);
  }
  if (updates.devices !== undefined) {
    setStorageItem(STORAGE_KEYS.devices, updates.devices);
  }
  if (updates.selectedDevice !== undefined) {
    setStorageItem(STORAGE_KEYS.selectedDevice, updates.selectedDevice);
  }
  if (updates.currentImage !== undefined) {
    setStorageItem(STORAGE_KEYS.currentImage, updates.currentImage);
  }
  if (updates.lastFetch !== undefined) {
    setStorageItem(STORAGE_KEYS.lastFetch, updates.lastFetch);
  }
  if (updates.nextFetch !== undefined) {
    setStorageItem(STORAGE_KEYS.nextFetch, updates.nextFetch);
  }
  if (updates.refreshRate !== undefined) {
    setStorageItem(STORAGE_KEYS.refreshRate, updates.refreshRate);
  }
  if (updates.retryCount !== undefined) {
    setStorageItem(STORAGE_KEYS.retryCount, updates.retryCount);
  }
  if (updates.retryAfter !== undefined) {
    setStorageItem(STORAGE_KEYS.retryAfter, updates.retryAfter);
  }
  return getState();
}

// Clear all stored data
export function clearState(): void {
  Object.values(STORAGE_KEYS).forEach((key) => {
    localStorage.removeItem(key);
  });
}

// URL construction
function getBaseUrl(environment: Environment): string {
  return HOSTS[environment] || HOSTS.production;
}

export function getDevicesUrl(environment: Environment): string {
  return `${getBaseUrl(environment)}/devices.json`;
}

export function getApiUrl(environment: Environment): string {
  return `${getBaseUrl(environment)}/api/current_screen`;
}

export function getLoginUrl(environment: Environment): string {
  return `${getBaseUrl(environment)}/login`;
}

// Fetch devices from TRMNL API
// Note: This requires the user to be logged in to usetrmnl.com in the same browser
// for cookie-based authentication to work
export async function fetchDevices(
  environment: Environment
): Promise<Device[] | null> {
  const url = getDevicesUrl(environment);
  const storedDevices = getStorageItem<Device[]>(STORAGE_KEYS.devices, []);

  try {
    const response = await fetch(url, {
      credentials: "include", // Include cookies for authentication
    });

    if (response.status === 401 || response.status === 403) {
      console.log("Unauthorized - user needs to log in");
      if (storedDevices.length > 0) {
        console.log("Using cached devices");
        return storedDevices;
      }
      return null;
    }

    if (!response.ok) {
      if (storedDevices.length > 0) {
        console.log("Fetch error, using cached devices");
        return storedDevices;
      }
      throw new Error(`HTTP error: ${response.status}`);
    }

    const devices: Device[] = await response.json();

    // Store the devices
    updateState({ devices });

    // Auto-select first device if none selected
    const state = getState();
    if (!state.selectedDevice && devices.length > 0) {
      updateState({ selectedDevice: devices[0] });
    }

    return devices;
  } catch (error) {
    console.error("Error fetching devices:", error);
    if (storedDevices.length > 0) {
      return storedDevices;
    }
    return null;
  }
}

// Convert blob to data URL
async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// Fetch the next screen image (triggers screen update on device)
export async function fetchNextScreen(): Promise<string | null> {
  const state = getState();
  const { environment, selectedDevice, retryAfter, retryCount } = state;

  // Check if we're in a retry backoff period
  if (retryAfter && Date.now() < retryAfter) {
    console.log("In retry backoff period, skipping fetch");
    return null;
  }

  // Get API key from selected device
  const apiKey = selectedDevice?.api_key;
  if (!apiKey) {
    console.log("No API key available");
    return null;
  }

  const API_URL = `${getBaseUrl(environment)}/api/display`;

  try {
    // Fetch the next screen
    const response = await fetch(API_URL, {
      headers: {
        "Access-Token": apiKey,
        "Cache-Control": "no-cache",
      },
    });

    if (response.status === 401 || response.status === 403) {
      console.log("API key unauthorized");
      updateState({ retryCount: 0, retryAfter: null });
      return null;
    }

    if (response.status === 429) {
      const newRetryCount = retryCount + 1;
      const backoffMs = Math.min(1000 * Math.pow(2, newRetryCount), 300000);
      const retryAfterTime = Date.now() + backoffMs;

      console.log(`Rate limited, backing off for ${backoffMs}ms`);
      updateState({
        retryCount: newRetryCount,
        retryAfter: retryAfterTime,
      });
      return null;
    }

    if (!response.ok) {
      throw new Error(`HTTP error: ${response.status}`);
    }

    const data = await response.json();
    const imageUrl = data.image_url;
    const filename = data.filename || "display.jpg";
    const refreshRate = data.refresh_rate || DEFAULT_REFRESH_RATE;
    const currentTime = Date.now();

    // Fetch the actual image
    const imageResponse = await fetch(imageUrl);
    if (!imageResponse.ok) {
      throw new Error(`Failed to fetch image: ${imageResponse.status}`);
    }

    const imageBlob = await imageResponse.blob();
    const imageDataUrl = await blobToDataUrl(imageBlob);

    // Calculate next fetch time
    const nextFetch = currentTime + refreshRate * 1000;

    // Store the image and metadata
    updateState({
      currentImage: {
        url: imageDataUrl,
        originalUrl: imageUrl,
        filename,
        timestamp: currentTime,
      },
      lastFetch: currentTime,
      nextFetch,
      refreshRate,
      retryCount: 0,
      retryAfter: null,
    });

    return imageDataUrl;
  } catch (error) {
    console.error("Error fetching next screen:", error);

    const newRetryCount = retryCount + 1;
    const backoffMs = Math.min(1000 * Math.pow(2, newRetryCount), 300000);
    const retryAfterTime = Date.now() + backoffMs;

    updateState({
      retryCount: newRetryCount,
      retryAfter: retryAfterTime,
    });
    return null;
  }
}

// Trigger special function (e.g., previous screen)
export async function triggerSpecialFunction(): Promise<boolean> {
  const state = getState();
  const { environment, selectedDevice } = state;

  // Get API key from selected device
  const apiKey = selectedDevice?.api_key;
  if (!apiKey) {
    console.log("No API key available");
    return false;
  }

  const API_URL = `${getBaseUrl(environment)}/api/display`;

  try {
    const response = await fetch(API_URL, {
      headers: {
        "Access-Token": apiKey,
        "Special-Function": "true",
        "Cache-Control": "no-cache",
      },
    });

    if (response.status === 401 || response.status === 403) {
      console.log("API key unauthorized");
      return false;
    }

    if (!response.ok) {
      throw new Error(`HTTP error: ${response.status}`);
    }

    console.log("Special function triggered successfully");
    return true;
  } catch (error) {
    console.error("Error triggering special function:", error);
    return false;
  }
}

// Fetch the current screen image
export async function fetchImage(forceRefresh = false): Promise<string | null> {
  const state = getState();
  const { environment, selectedDevice, currentImage, retryAfter, retryCount } =
    state;

  // Check if we're in a retry backoff period
  if (retryAfter && Date.now() < retryAfter && !forceRefresh) {
    console.log("In retry backoff period, skipping fetch");
    return currentImage?.url || null;
  }

  // Get API key from selected device
  const apiKey = selectedDevice?.api_key;
  if (!apiKey) {
    console.log("No API key available");
    return null;
  }

  const deviceId = selectedDevice?.id || "unknown";
  const isFirstSetup = !hasCompletedFirstSetup(deviceId);

  // Use /api/display for first-time setup to generate screen, otherwise use /api/current_screen
  const API_URL = isFirstSetup
    ? `${getBaseUrl(environment)}/api/display`
    : getApiUrl(environment);

  console.log(
    `Fetching image for device ${deviceId} (first setup: ${isFirstSetup})`
  );

  try {
    // Fetch the current screen metadata
    const response = await fetch(API_URL, {
      headers: {
        "access-token": apiKey,
        "Cache-Control": "no-cache",
      },
    });

    if (response.status === 401 || response.status === 403) {
      console.log("API key unauthorized");
      // Reset retry state
      updateState({ retryCount: 0, retryAfter: null });
      return null;
    }

    if (response.status === 429) {
      // Rate limited - implement exponential backoff
      const newRetryCount = retryCount + 1;
      const backoffMs = Math.min(1000 * Math.pow(2, newRetryCount), 300000); // Max 5 minutes
      const retryAfterTime = Date.now() + backoffMs;

      console.log(`Rate limited, backing off for ${backoffMs}ms`);
      updateState({
        retryCount: newRetryCount,
        retryAfter: retryAfterTime,
      });

      return currentImage?.url || null;
    }

    if (!response.ok) {
      throw new Error(`HTTP error: ${response.status}`);
    }

    const data = await response.json();
    const imageUrl = data.image_url;
    const filename = data.filename || "display.jpg";
    const refreshRate = data.refresh_rate || DEFAULT_REFRESH_RATE;
    const currentTime = Date.now();

    // Check if image URL has changed (optimization to skip re-download)
    if (
      !forceRefresh &&
      currentImage &&
      currentImage.originalUrl === imageUrl
    ) {
      console.log("Image unchanged, updating timestamps only");
      const nextFetch = currentTime + refreshRate * 1000;
      updateState({
        refreshRate,
        lastFetch: currentTime,
        nextFetch,
        retryCount: 0,
        retryAfter: null,
      });
      return currentImage.url;
    }

    // Fetch the actual image
    const imageResponse = await fetch(imageUrl);
    if (!imageResponse.ok) {
      throw new Error(`Failed to fetch image: ${imageResponse.status}`);
    }

    const imageBlob = await imageResponse.blob();
    const imageDataUrl = await blobToDataUrl(imageBlob);

    // Calculate next fetch time
    const nextFetch = currentTime + refreshRate * 1000;

    // Store the image and metadata
    updateState({
      currentImage: {
        url: imageDataUrl,
        originalUrl: imageUrl,
        filename,
        timestamp: currentTime,
      },
      lastFetch: currentTime,
      nextFetch,
      refreshRate,
      retryCount: 0,
      retryAfter: null,
    });

    // Mark first setup as complete after successful fetch
    if (isFirstSetup) {
      markFirstSetupComplete(deviceId);
      console.log(`First setup completed for device ${deviceId}`);
    }

    return imageDataUrl;
  } catch (error) {
    console.error("Error fetching image:", error);

    // Increment retry count on error
    const newRetryCount = retryCount + 1;
    const backoffMs = Math.min(1000 * Math.pow(2, newRetryCount), 300000);
    const retryAfterTime = Date.now() + backoffMs;

    updateState({
      retryCount: newRetryCount,
      retryAfter: retryAfterTime,
    });

    return currentImage?.url || null;
  }
}

// Select a device
export function selectDevice(device: Device): void {
  updateState({
    selectedDevice: device,
    retryCount: 0,
    retryAfter: null,
  });
}

// Set the environment
export function setEnvironment(environment: Environment): void {
  updateState({ environment });
}

// Check if device has completed first setup
function hasCompletedFirstSetup(deviceId: string): boolean {
  const firstSetupMap = getStorageItem<Record<string, boolean>>(
    STORAGE_KEYS.firstSetupComplete,
    {}
  );
  return firstSetupMap[deviceId] === true;
}

// Mark device as having completed first setup
function markFirstSetupComplete(deviceId: string): void {
  const firstSetupMap = getStorageItem<Record<string, boolean>>(
    STORAGE_KEYS.firstSetupComplete,
    {}
  );
  firstSetupMap[deviceId] = true;
  setStorageItem(STORAGE_KEYS.firstSetupComplete, firstSetupMap);
}

// Format time remaining for countdown display
export function formatTimeRemaining(nextFetch: number | null): string {
  if (!nextFetch) return "Unknown";

  const remaining = Math.max(0, nextFetch - Date.now());
  const totalSeconds = Math.floor(remaining / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const pad = (n: number) => n.toString().padStart(2, "0");

  if (hours > 0) {
    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  }
  return `${pad(minutes)}:${pad(seconds)}`;
}
