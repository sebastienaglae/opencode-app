import { useSettings } from "./store/settings";
import { useConnection } from "./store/connection";

/** Applies an `ai.opencode.remote://connect?...` pairing link to the settings. */
export function applyPairingLink(url: string): boolean {
  try {
    const u = new URL(url);
    const host = u.searchParams.get("host");
    const port = Number(u.searchParams.get("port"));
    const token = u.searchParams.get("token");
    const secure = u.searchParams.get("secure");
    const patch: { host?: string; port?: number; token?: string; secure?: boolean } = {};
    if (host) patch.host = host;
    if (port) patch.port = port;
    if (token) patch.token = token;
    if (secure) patch.secure = secure === "1" || secure === "true";
    if (Object.keys(patch).length === 0) return false;
    useSettings.getState().update(patch);
    void useConnection.getState().connect();
    return true;
  } catch {
    return false;
  }
}
