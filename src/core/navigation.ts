import { create } from "zustand";

type ViewerState = {
  pendingFile: string | null;
  pendingDir: string | null;
  open: (path: string, directory?: string) => void;
  clear: () => void;
};

/** Lets deep components (e.g. Markdown links) request opening a file in the
 *  Files viewer without prop-drilling the router. */
export const useViewer = create<ViewerState>((set) => ({
  pendingFile: null,
  pendingDir: null,
  open: (path, directory) => set({ pendingFile: path, pendingDir: directory ?? null }),
  clear: () => set({ pendingFile: null, pendingDir: null }),
}));

let currentProjectDir: string | null = null;
export function setProjectDir(dir: string | undefined): void {
  currentProjectDir = dir && dir.length > 0 ? dir : null;
}

let navigateFn: ((to: string) => void) | null = null;
export function setNavigator(fn: (to: string) => void): void {
  navigateFn = fn;
}
export function navigateTo(to: string): void {
  navigateFn?.(to);
}

/** True for values that look like a project file path / file:// URL. */
export function isFilePath(value: string): boolean {
  const v = value.trim();
  if (!v || /\s/.test(v)) return false;
  if (/^(https?:|mailto:|tel:|#|data:)/i.test(v)) return false;
  if (v.startsWith("file://")) return true;
  return /[\\/]/.test(v) && /\.[a-z0-9]{1,8}$/i.test(v);
}

export function stripFileUrl(value: string): string {
  let v = value.trim();
  if (v.startsWith("file://")) {
    v = v.slice("file://".length);
    try {
      v = decodeURIComponent(v);
    } catch {
      /* ignore */
    }
  }
  return v;
}

export function openFileInViewer(value: string, directory?: string): void {
  useViewer.getState().open(stripFileUrl(value), directory ?? currentProjectDir ?? undefined);
  navigateTo("/files");
}
