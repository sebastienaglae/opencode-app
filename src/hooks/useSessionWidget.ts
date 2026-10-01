import { useEffect } from "react";
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
  const conversations = useSessions((s) => s.conversations);

  const { data: activeMap = {} } = useQuery({
    queryKey: ["active-sessions"],
    queryFn: () => api.activeSessions(),
    enabled: native && status === "connected",
    retry: false,
    refetchInterval: 5000,
  });

  useEffect(() => {
    if (!native) return;
    const running = list.filter((s) => activeMap[s.id] || conversations[s.id]?.running);
    const finished = list.filter((s) => s.outcome === "succeeded" || s.outcome === "failed").length;
    const single = running.length === 1 ? running[0] : undefined;
    void updateSessionWidget({
      running: running.length,
      finished,
      project: single ? basename(single.location?.directory) : "",
      startedAt: single ? single.time.updated : 0,
    });
  }, [native, list, activeMap, conversations]);
}
