import { create } from "zustand";
import type { ModelRef } from "../types";
import type { Lang } from "../i18n";

export type ThemeMode = "dark" | "light" | "system";

export type Settings = {
  host: string;
  port: number;
  /** Fallback ports probed automatically during discovery. */
  candidatePorts: number[];
  token: string;
  theme: ThemeMode;
  lang: Lang;
  lastModel?: ModelRef;
  lastAgent?: string;
  hydrated: boolean;
};

const STORAGE_KEY = "opencode-remote.settings.v2";

export const DEFAULT_CANDIDATE_PORTS = [
  47821, 47311, 48240, 46901, 49923, 45177, 48812, 46355, 49730, 47688,
];

const defaults: Omit<Settings, "hydrated"> = {
  host: "192.168.1.133",
  port: 47821,
  candidatePorts: DEFAULT_CANDIDATE_PORTS,
  token: "",
  theme: "dark",
  lang: "fr",
};

type SettingsState = Settings & {
  update: (patch: Partial<Settings>) => void;
  hydrate: () => void;
};

function persist(state: Settings) {
  try {
    const { hydrated: _hydrated, ...rest } = state;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rest));
  } catch {
    /* ignore */
  }
}

function prefersDark(): boolean {
  return typeof window !== "undefined" && !!window.matchMedia?.("(prefers-color-scheme: dark)").matches;
}

export function applyTheme(theme: ThemeMode) {
  const dark = theme === "dark" || (theme === "system" && prefersDark());
  const root = document.documentElement;
  root.classList.toggle("dark", dark);
  root.classList.toggle("ion-palette-dark", dark);
  root.setAttribute("data-theme", dark ? "dark" : "light");
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", dark ? "#0a0a0b" : "#ffffff");
}

export const useSettings = create<SettingsState>((set, get) => ({
  ...defaults,
  hydrated: false,
  update: (patch) => {
    set(patch);
    persist(get());
    if (patch.theme) applyTheme(patch.theme);
    if (patch.host || patch.token) notifyReconnectNeeded();
  },
  hydrate: () => {
    let loaded = defaults;
    try {
      const raw = localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem("opencode-remote.settings.v1");
      if (raw) loaded = { ...defaults, ...(JSON.parse(raw) as Partial<Settings>) };
    } catch {
      /* ignore */
    }
    set({ ...loaded, hydrated: true });
    applyTheme(loaded.theme);
    if (typeof window !== "undefined" && window.matchMedia) {
      window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => applyTheme(get().theme));
    }
  },
}));

/** Small indirection to avoid a circular import with the connection store. */
let reconnectHint: () => void = () => {};
export function setReconnectHint(fn: () => void) {
  reconnectHint = fn;
}
function notifyReconnectNeeded() {
  reconnectHint();
}
