import { useSettings } from "./store/settings";
import { useConnection } from "./store/connection";

/** Extracts connection params from a pairing link (custom scheme, https, or raw text). */
function extractParams(text: string): URLSearchParams | null {
  const trimmed = text.trim();
  try {
    return new URL(trimmed).searchParams;
  } catch {
    /* not a full URL */
  }
  const idx = trimmed.indexOf("host=");
  if (idx >= 0) {
    try {
      return new URLSearchParams(trimmed.slice(idx));
    } catch {
      /* ignore */
    }
  }
  return null;
}

/** Applies an `ai.opencode.remote://connect?...` pairing link to the settings. */
export function applyPairingLink(url: string): boolean {
  const params = extractParams(url);
  if (!params) return false;
  const host = params.get("host");
  const port = Number(params.get("port"));
  const token = params.get("token");
  const secure = params.get("secure");
  const patch: { host?: string; port?: number; token?: string; secure?: boolean } = {};
  if (host) patch.host = host;
  if (Number.isFinite(port) && port > 0) patch.port = port;
  if (token) patch.token = token;
  if (secure) patch.secure = secure === "1" || secure === "true";
  if (Object.keys(patch).length === 0) return false;
  useSettings.getState().update(patch);
  void useConnection.getState().connect();
  return true;
}
