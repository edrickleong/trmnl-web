// Theme preference: an explicit light/dark choice, or follow the OS.
// Kept separate from TrmnlState because it's a display preference rather than
// device state, but it shares the trmnl_ storage prefix so Reset clears it.

export type Theme = "light" | "dark" | "system";

const STORAGE_KEY = "trmnl_theme";

export const THEMES: Theme[] = ["light", "dark", "system"];

export function getTheme(): Theme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (THEMES.includes(parsed)) return parsed;
    }
  } catch {
    // fall through to the default
  }
  return "system";
}

export function setTheme(theme: Theme): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(theme));
  } catch (error) {
    console.error("Failed to save theme:", error);
  }
}

function prefersDark(): boolean {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

// Resolve "system" to whatever the OS is currently asking for
export function resolveTheme(theme: Theme): "light" | "dark" {
  if (theme === "system") return prefersDark() ? "dark" : "light";
  return theme;
}

// Tailwind's dark variant is driven by the .dark class on <html>
export function applyTheme(theme: Theme): void {
  const resolved = resolveTheme(theme);
  const root = document.documentElement;
  root.classList.toggle("dark", resolved === "dark");
  root.style.colorScheme = resolved;
}

// Notify when the OS preference changes, so "system" tracks it live
export function onSystemThemeChange(listener: () => void): () => void {
  const query = window.matchMedia("(prefers-color-scheme: dark)");
  query.addEventListener("change", listener);
  return () => query.removeEventListener("change", listener);
}
