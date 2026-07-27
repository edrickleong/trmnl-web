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
  timestamp: number; // when we fetched it
  renderedAt: number | null; // when the server rendered it, if it told us
}

// Why the last fetch failed. These need different responses from the user, so
// they're kept distinct rather than collapsed into one message.
export type FetchErrorKind = "unauthorized" | "rate-limited" | "network";

export interface FetchError {
  kind: FetchErrorKind;
  at: number;
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
  // When true, the refresh timer pulls the next screen (/api/display) like a
  // real device would, advancing the playlist. When false (default) it only
  // mirrors whatever the device is currently showing (/api/current_screen).
  advancePlaylist: boolean;
  // Seconds between refreshes, overriding the server's refresh_rate. null
  // means follow whatever the server asks for.
  refreshOverride: number | null;
  // True when the server answered but the device has no rendered screen to
  // mirror yet. Advancing the playlist once is what produces one, but that's
  // the user's call, so we surface it rather than doing it for them.
  noScreenRendered: boolean;
  // Why the most recent fetch failed, or null after a success.
  lastError: FetchError | null;
}

// Aim just past the device's expected next render rather than exactly at it,
// to allow for clock skew and render time.
const SYNC_GRACE_MS = 5000;

// Never poll more often than this, however far behind we think we are.
const MIN_POLL_GAP_MS = 15000;

// Selectable refresh intervals, in seconds. 0 is the "Auto" sentinel, i.e.
// follow the server's refresh_rate.
export const REFRESH_STEPS = [0, 30, 60, 120, 300, 600, 900, 1800, 3600];

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
  advancePlaylist: "trmnl_advancePlaylist",
  refreshOverride: "trmnl_refreshOverride",
  noScreenRendered: "trmnl_noScreenRendered",
  lastError: "trmnl_lastError",
  theme: "trmnl_theme",
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
    advancePlaylist: getStorageItem<boolean>(
      STORAGE_KEYS.advancePlaylist,
      false
    ),
    refreshOverride: getStorageItem<number | null>(
      STORAGE_KEYS.refreshOverride,
      null
    ),
    noScreenRendered: getStorageItem<boolean>(
      STORAGE_KEYS.noScreenRendered,
      false
    ),
    lastError: getStorageItem<FetchError | null>(STORAGE_KEYS.lastError, null),
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
  if (updates.advancePlaylist !== undefined) {
    setStorageItem(STORAGE_KEYS.advancePlaylist, updates.advancePlaylist);
  }
  if (updates.refreshOverride !== undefined) {
    setStorageItem(STORAGE_KEYS.refreshOverride, updates.refreshOverride);
  }
  if (updates.noScreenRendered !== undefined) {
    setStorageItem(STORAGE_KEYS.noScreenRendered, updates.noScreenRendered);
  }
  if (updates.lastError !== undefined) {
    setStorageItem(STORAGE_KEYS.lastError, updates.lastError);
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

// The read-only endpoint: returns the device's current screen without
// advancing its playlist.
export function getApiUrl(environment: Environment): string {
  return `${getBaseUrl(environment)}/api/current_screen`;
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

// Fetch the next screen image. This advances the device's playlist, so the
// real device will skip past whatever we consume here.
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
      updateState({
        retryCount: 0,
        retryAfter: null,
        lastError: { kind: "unauthorized", at: Date.now() },
      });
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
        lastError: { kind: "rate-limited", at: Date.now() },
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

    if (!imageUrl) {
      throw new Error("No image in /api/display response");
    }

    // Fetch the actual image
    const imageResponse = await fetch(imageUrl);
    if (!imageResponse.ok) {
      throw new Error(`Failed to fetch image: ${imageResponse.status}`);
    }

    const imageBlob = await imageResponse.blob();
    const imageDataUrl = await blobToDataUrl(imageBlob);

    // Store the image and metadata. We caused this render, so it's current as
    // of now and there's no server boundary to sync to.
    updateState({
      currentImage: {
        url: imageDataUrl,
        originalUrl: imageUrl,
        filename,
        timestamp: currentTime,
        renderedAt: currentTime,
      },
      lastFetch: currentTime,
      nextFetch: currentTime + getEffectiveRefreshRate(refreshRate) * 1000,
      refreshRate,
      noScreenRendered: false,
      lastError: null,
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
      lastError: { kind: "network", at: Date.now() },
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

// Fetch the current screen image. Never advances the playlist — if the device
// has no rendered screen yet, this reports that via `noScreenRendered` and
// leaves generating one to the user.
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

  const API_URL = getApiUrl(environment);

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
      // A bad key won't fix itself, so there's nothing to back off for.
      updateState({
        retryCount: 0,
        retryAfter: null,
        lastError: { kind: "unauthorized", at: Date.now() },
      });
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
        lastError: { kind: "rate-limited", at: Date.now() },
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
    const renderedAt = parseRenderedAt(data.rendered_at);
    const currentTime = Date.now();

    if (renderedAt === null) {
      // Without this we can't show staleness or sync to the device's own
      // refresh boundary, so make its absence visible rather than silent.
      console.warn(
        "No usable rendered_at in current-screen response; falling back to unsynced polling. Fields:",
        Object.keys(data),
        "rendered_at:",
        data.rendered_at
      );
    }

    // A successful response with no image means the device has never rendered
    // a screen. Keep polling at the normal cadence in case it renders one, but
    // don't advance the playlist to force it.
    if (!imageUrl) {
      console.log("Device has no rendered screen yet");
      updateState({
        refreshRate,
        lastFetch: currentTime,
        nextFetch: computeNextFetch(currentTime, refreshRate, null),
        noScreenRendered: true,
        retryCount: 0,
        retryAfter: null,
        lastError: null,
      });
      return null;
    }

    // Check if image URL has changed (optimization to skip re-download)
    if (
      !forceRefresh &&
      currentImage &&
      currentImage.originalUrl === imageUrl
    ) {
      console.log("Image unchanged, updating timestamps only");
      updateState({
        refreshRate,
        currentImage: { ...currentImage, renderedAt },
        lastFetch: currentTime,
        nextFetch: computeNextFetch(currentTime, refreshRate, renderedAt),
        retryCount: 0,
        retryAfter: null,
        lastError: null,
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

    // Store the image and metadata
    updateState({
      currentImage: {
        url: imageDataUrl,
        originalUrl: imageUrl,
        filename,
        timestamp: currentTime,
        renderedAt,
      },
      lastFetch: currentTime,
      nextFetch: computeNextFetch(currentTime, refreshRate, renderedAt),
      refreshRate,
      noScreenRendered: false,
      lastError: null,
      retryCount: 0,
      retryAfter: null,
    });

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
      lastError: { kind: "network", at: Date.now() },
    });

    return currentImage?.url || null;
  }
}

// Select a device
export function selectDevice(device: Device): void {
  updateState({
    selectedDevice: device,
    noScreenRendered: false,
    retryCount: 0,
    retryAfter: null,
  });
}

// Toggle whether the refresh timer advances the playlist
export function setAdvancePlaylist(advancePlaylist: boolean): void {
  updateState({ advancePlaylist });
}

// Pin the refresh interval, in seconds. 0 or null follows the server.
export function setRefreshOverride(seconds: number | null): void {
  updateState({ refreshOverride: seconds ? seconds : null });
}

// The interval the timer actually uses: the user's pinned value if they set
// one, otherwise whatever the server asked for.
export function getEffectiveRefreshRate(serverRate?: number): number {
  const state = getState();
  return state.refreshOverride ?? serverRate ?? state.refreshRate;
}

// Parse the server's rendered_at into epoch ms, tolerating absence and junk.
function parseRenderedAt(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

// When to poll next.
//
// In mirror mode on Auto, the device's own render boundary is the only moment
// the screen can change, so aim just past it. Otherwise our cycle sits at an
// arbitrary offset inside the device's and we're consistently stale by however
// far apart they happen to start.
//
// A pinned interval is taken literally — the user asked for that cadence — and
// in virtual-device mode we cause the render ourselves, so there's nothing to
// sync to.
function computeNextFetch(
  now: number,
  serverRate: number,
  renderedAt: number | null
): number {
  const state = getState();
  const useServerBoundary =
    !state.advancePlaylist && !state.refreshOverride && renderedAt !== null;

  if (!useServerBoundary) {
    return now + getEffectiveRefreshRate(serverRate) * 1000;
  }

  return Math.max(
    renderedAt + serverRate * 1000 + SYNC_GRACE_MS,
    now + MIN_POLL_GAP_MS
  );
}

// Coarse countdown for the status line. Refresh rates are measured in minutes,
// so a ticking seconds display is just motion in the corner of your eye.
export function formatCountdown(due: number | null): string {
  if (!due) return "unknown";

  const seconds = Math.max(0, Math.round((due - Date.now()) / 1000));
  if (seconds < 60) return "<1 min";

  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;

  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
}

// How long ago the screen on display was rendered
export function formatAge(timestamp: number | null): string | null {
  if (!timestamp) return null;

  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 45) return "just now";
  if (seconds < 5400) return `${Math.round(seconds / 60)} min ago`;
  const hours = Math.round(seconds / 3600);
  return hours === 1 ? "1 hr ago" : `${hours} hr ago`;
}

// User-facing explanation of a failed fetch. Each kind needs a different
// response, so they don't share a message.
export function describeFetchError(
  error: FetchError | null,
  retryAfter: number | null
): string | null {
  if (!error) return null;

  switch (error.kind) {
    case "unauthorized":
      return "TRMNL rejected that API key. Check it in Settings.";
    case "rate-limited": {
      const wait =
        retryAfter && retryAfter > Date.now()
          ? formatCountdown(retryAfter)
          : null;
      return wait
        ? `Rate limited by TRMNL — retrying in ${wait}.`
        : "Rate limited by TRMNL — retrying shortly.";
    }
    case "network":
      return "Couldn't reach TRMNL. Check your connection.";
  }
}

// Human label for an interval, used by the settings slider
export function formatInterval(seconds: number): string {
  if (!seconds) return "Auto";
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} min`;
  return `${Math.round(seconds / 3600)} hr`;
}

