import { Capacitor, registerPlugin } from "@capacitor/core";
import { api, baseUrl } from "./api/opencode";
import { useSettings } from "./store/settings";
import { basename } from "./format";

/**
 * Save a bridge file (APK, archive, binary…) on the device.
 *
 * Native path: a small Android plugin downloads it into `Download/OpenCode`
 * and can hand it to the system viewer (APK installer for `.apk`).
 * Web path: plain anchor download so the browser dev flow still works.
 */

type NativeDownloader = {
  download(options: {
    url: string;
    token?: string;
    filename: string;
    mime?: string;
    open?: boolean;
  }): Promise<{ uri: string; name: string; path: string; size: number }>;
  cancel(): Promise<void>;
  openFile(options: { uri: string; mime?: string }): Promise<void>;
  addListener(
    event: "progress",
    cb: (data: { received: number; total: number }) => void,
  ): Promise<{ remove: () => Promise<void> }>;
};

const Native = registerPlugin<NativeDownloader>("Downloader");

const MIME: Record<string, string> = {
  apk: "application/vnd.android.package-archive",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  avif: "image/avif",
  ico: "image/x-icon",
  pdf: "application/pdf",
  zip: "application/zip",
  gz: "application/gzip",
  tar: "application/x-tar",
  "7z": "application/x-7z-compressed",
  txt: "text/plain",
  md: "text/markdown",
  json: "application/json",
  html: "text/html",
  css: "text/css",
  js: "text/javascript",
  mp4: "video/mp4",
  webm: "video/webm",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  aab: "application/octet-stream",
};

export function mimeFor(path: string): string {
  return MIME[path.split(".").pop()?.toLowerCase() ?? ""] ?? "application/octet-stream";
}

/** Absolute bridge URL of a scoped file (same route as the in-app preview). */
export function fileUrl(path: string, directory?: string): string {
  const encoded = path.split("/").map(encodeURIComponent).join("/");
  const params = new URLSearchParams();
  if (directory) params.set("location[directory]", directory);
  const query = params.toString();
  return `${baseUrl()}/api/fs/read/${encoded}${query ? `?${query}` : ""}`;
}

export type SavedFile = { uri: string; name: string; path: string };

export async function saveFile(
  path: string,
  options: { directory?: string; open?: boolean; onProgress?: (p: { received: number; total: number }) => void } = {},
): Promise<SavedFile> {
  const filename = basename(path);
  const mime = mimeFor(path);

  if (!Capacitor.isNativePlatform()) {
    const blob = await api.fsReadBlob(path, options.directory);
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    return { uri: "", name: filename, path: filename };
  }

  const listener = options.onProgress
    ? await Native.addListener("progress", (data) => options.onProgress?.(data))
    : null;
  try {
    return await Native.download({
      url: fileUrl(path, options.directory),
      token: useSettings.getState().token,
      filename,
      mime,
      open: options.open,
    });
  } finally {
    await listener?.remove().catch(() => undefined);
  }
}

export async function openSaved(uri: string, pathOrName: string): Promise<void> {
  if (!Capacitor.isNativePlatform() || !uri) return;
  await Native.openFile({ uri, mime: mimeFor(pathOrName) });
}
