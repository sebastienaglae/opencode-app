import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Capacitor } from "@capacitor/core";
import { api } from "../core/api/opencode";
import { useSessions } from "../core/store/sessions";
import { useConnection } from "../core/store/connection";
import { updateSessionWidget } from "../core/widget";
import { basename } from "../core/format";

/** Pushes the current session state to the Android home-screen widget. */
export function useSessionWidget(): void {
  const native = Capacitor.isNativePlatform();
  const status = useConnection((s) => s.status);
  const list = useSessions((s) => s.list);
  // A string selector so streaming updates (new conversation objects every event)
  // do not re-run the widget effect on every token.
  const runningIds = useSessions((s) => {
    const ids: string[] = [];
    for (const conv of Object.values(s.conversations)) if (conv.running) ids.push(conv.id);
    return ids.join(",");
  });
  const lastKey = useRef("");

  const { data: activeMap = {} } = useQuery({
    queryKey: ["active-sessions"],
    queryFn: () => api.activeSessions(),
    enabled: native && status === "connected",
    retry: false,
    refetchInterval: 20_000,
  });

  useEffect(() => {
    if (!native) return;
    const storeRunning = new Set(runningIds ? runningIds.split(",") : []);
    const running = list.filter((s) => activeMap[s.id] || storeRunning.has(s.id));
    const finished = list.filter((s) => s.outcome === "succeeded" || s.outcome === "failed").length;
    const single = running.length === 1 ? running[0] : undefined;
    const payload = {
      running: running.length,
      finished,
      project: single ? basename(single.location?.directory) || single.title || "" : "",
      startedAt: single ? single.time.updated : 0,
      sessions: running.slice(0, 12).map((s) => ({
        project: basename(s.location?.directory) || s.title || "Session",
        startedAt: s.time.updated,
      })),
    };
    // Every state write wakes the launcher widget: skip identical payloads.
    const key = JSON.stringify(payload);
    if (key === lastKey.current) return;
    lastKey.current = key;
    void updateSessionWidget(payload);
  }, [native, list, activeMap, runningIds]);
}
