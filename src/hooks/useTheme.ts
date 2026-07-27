import { useCallback, useEffect, useState } from "react";
import {
  applyTheme,
  getTheme,
  onSystemThemeChange,
  setTheme,
  type Theme,
} from "@/lib/theme";

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(getTheme);

  useEffect(() => {
    applyTheme(theme);
    // Only "system" needs to track the OS; an explicit choice is fixed.
    if (theme !== "system") return;
    return onSystemThemeChange(() => applyTheme("system"));
  }, [theme]);

  const changeTheme = useCallback((next: Theme) => {
    setTheme(next);
    setThemeState(next);
  }, []);

  return { theme, changeTheme };
}
