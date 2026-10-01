import { create } from "zustand";
import { api } from "../api/opencode";
import { eventStream, type EventStreamStatus } from "../events";
import { setReconnectHint, useSettings } from "./settings";
import type { ServerInfo } from "../types";

export type ConnectionStatus = "disconnected" | "connecting" | "connected" | "error";

type ProbeResult = { port: number; info: ServerInfo; latency: number };

async function probePort(host: string, port: number, _token: string, timeoutMs: number): Promise<ProbeResult | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = performance.now();
  try {
    const res = await fetch(`http://${host}:${port}/health`, { signal: controller.signal });
    if (!res.ok) return null;
    const body = (await res.json()) as { ok?: boolean; opencode?: { version?: string; pid?: number } };
    if (!body.ok) return null;
    const latency = Math.round(performance.now() - started);
    return {
      port,
      latency,
      info: {
        version: body.opencode?.version ?? "unknown",
        pid: body.opencode?.pid ?? 0,
        urls: [`http://${host}:${port}`],
        paths: { tmp: "" },
      },
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

type ConnectionState = {
  status: ConnectionStatus;
  error?: string;
  serverInfo?: ServerInfo;
  latency?: number;
  effectivePort?: number;
  eventStatus: EventStreamStatus;
  connect: () => Promise<boolean>;
  disconnect: () => void;
};

export const useConnection = create<ConnectionState>((set) => ({
  status: "disconnected",
  eventStatus: "idle",

  disconnect: () => {
    eventStream.disconnect();
    set({ status: "disconnected", eventStatus: "idle", serverInfo: undefined, effectivePort: undefined });
  },

  connect: async () => {
    const { host, port, token, candidatePorts } = useSettings.getState();
    set({ status: "connecting", error: undefined });

    // Probe the configured port first; only fall back to the candidate list if
    // it does not answer.
    let found = await probePort(host, port, token, 1500);
    if (!found) {
      const others = candidatePorts.filter((p) => p !== port);
      const results = await Promise.all(others.map((p) => probePort(host, p, token, 1200)));
      found = results.find((r): r is ProbeResult => r !== null) ?? null;
    }

    if (!found) {
      eventStream.disconnect();
      set({
        status: "error",
        error: `Aucun serveur sur ${host} (ports ${[port, ...candidatePorts].join(", ")})`,
        serverInfo: undefined,
        effectivePort: undefined,
      });
      return false;
    }

    if (found.port !== port) useSettings.getState().update({ port: found.port });
    eventStream.connect(host, found.port, token);
    eventStream.onStatus((eventStatus) => set({ eventStatus }));
    set({ status: "connected", serverInfo: found.info, latency: found.latency, effectivePort: found.port });
    // Validate the API surface end-to-end (bridge proxy → OpenCode).
    try {
      await api.serverInfo();
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) });
    }
    return true;
  },
}));

setReconnectHint(() => {
  const state = useConnection.getState();
  void state.connect();
});
