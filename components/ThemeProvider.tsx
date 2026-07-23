// components/ThemeProvider.tsx
// App-wide light/dark theme. Persists to localStorage; toggled from Nav.

"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type ThemeColors = {
  ink: string;
  sheet: string;
  card: string;
  coral: string;
  gold: string;
  green: string;
  sea: string;
};

const LIGHT: ThemeColors = {
  ink: "#1e2a3a",
  sheet: "#eef4f1",
  card: "#ffffff",
  coral: "#e8604c",
  gold: "#d4a017",
  green: "#2d8a56",
  sea: "#3d8b8b",
};

const DARK: ThemeColors = {
  ink: "#e6edf4",
  sheet: "#0f1419",
  card: "#1a222d",
  coral: "#f07562",
  gold: "#e0b03a",
  green: "#4cba78",
  sea: "#5aabab",
};

type ThemeCtx = {
  dark: boolean;
  toggle: () => void;
  colors: ThemeColors;
};

const ThemeContext = createContext<ThemeCtx>({
  dark: false,
  toggle: () => {},
  colors: LIGHT,
});

const STORAGE_KEY = "larvatar-dark";

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [dark, setDark] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    const prefer =
      stored === "1" ||
      (stored === null && window.matchMedia("(prefers-color-scheme: dark)").matches);
    setDark(prefer);
    document.documentElement.classList.toggle("dark", prefer);
    setReady(true);
  }, []);

  const toggle = useCallback(() => {
    setDark((d) => {
      const next = !d;
      localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      document.documentElement.classList.toggle("dark", next);
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({ dark, toggle, colors: dark ? DARK : LIGHT }),
    [dark, toggle]
  );

  // Avoid flash of wrong theme on first paint after hydration
  if (!ready) {
    return (
      <ThemeContext.Provider value={{ dark: false, toggle, colors: LIGHT }}>
        {children}
      </ThemeContext.Provider>
    );
  }

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
