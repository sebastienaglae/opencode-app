import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { IonIcon, IonSpinner } from "@ionic/react";
import { arrowBackOutline, playOutline, stopCircleOutline, trashOutline } from "ionicons/icons";
import { api } from "../core/api/opencode";
import { useSessions } from "../core/store/sessions";
import { useConnection } from "../core/store/connection";
import { useT } from "../core/i18n";
import { cn } from "../core/cn";
import { formatDuration } from "../core/format";
import { CodeBlock } from "../components/CodeBlock";

type Entry = {
  key: string;
  command: string;
  id?: string;
  output: string;
  status: string;
  exit?: number | string;
  started: number;
  completed?: number;
};

export default function ConsoleScreen() {
  const t = useT();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const status = useConnection((s) => s.status);
  const sessions = useSessions((s) => s.list);
  const listRef = useRef<HTMLDivElement>(null);

  const cwd = useMemo(() => {
    const fromQuery = params.get("cwd");
    if (fromQuery) return fromQuery;
    return sessions.find((s) => s.location?.directory)?.location?.directory ?? "";
  }, [params, sessions]);

  const [entries, setEntries] = useState<Entry[]>([]);
  const [command, setCommand] = useState("");
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [entries]);

  const patch = (key: string, next: Partial<Entry>) =>
    setEntries((list) => list.map((e) => (e.key === key ? { ...e, ...next } : e)));

  const poll = async (key: string, id: string) => {
    for (let i = 0; i < 900 && alive.current; i++) {
      await new Promise((r) => setTimeout(r, 700));
      const [info, out] = await Promise.all([
        api.shellInfo(id).catch(() => undefined),
        api.shellOutput(id).catch(() => undefined),
      ]);
      if (out) patch(key, { output: out.output });
      if (info && info.status !== "running") {
        patch(key, { status: info.status, exit: info.exit, completed: info.time.completed });
        return;
      }
    }
  };

  const run = async (raw?: string) => {
    const cmd = (raw ?? command).trim();
    if (!cmd) return;
    setCommand("");
    const key = `${Date.now()}-${Math.random()}`;
    setEntries((list) => [...list, { key, command: cmd, output: "", status: "running", started: Date.now() }]);
    try {
      const created = await api.runShellGlobal({ command: cmd, cwd: cwd || undefined });
      patch(key, { id: created.id, status: created.status });
      await poll(key, created.id);
    } catch (err) {
      patch(key, { status: "error", output: err instanceof Error ? err.message : String(err) });
    }
  };

  const kill = async (entry: Entry) => {
    if (!entry.id) return;
    await api.killShell(entry.id).catch(() => {});
    patch(entry.key, { status: "killed" });
  };

  return (
    <div className="flex h-full flex-col bg-bg">
      <header className="flex items-center gap-1 border-b border-border px-2 pb-2.5 pt-[calc(10px+env(safe-area-inset-top))]">
        <button type="button" onClick={() => navigate(-1)} className="p-2 text-muted active:text-fg" aria-label={t("common.back")}>
          <IonIcon icon={arrowBackOutline} className="text-[20px]" />
        </button>
        <div className="min-w-0 flex-1 px-1">
          <div className="text-[16px] font-bold text-fg">{t("console.title")}</div>
          {cwd && <div className="truncate font-mono text-[11px] text-faint">{cwd}</div>}
        </div>
        <button
          type="button"
          onClick={() => setEntries([])}
          className="p-2 text-muted active:text-fg"
          aria-label={t("console.clear")}
        >
          <IonIcon icon={trashOutline} className="text-[18px]" />
        </button>
      </header>

      <div ref={listRef} className="oc-scroll min-h-0 flex-1 overflow-y-auto px-3 py-2">
        {status !== "connected" ? (
          <div className="p-10 text-center text-[13px] text-muted">{t("sessions.noConnection")}</div>
        ) : entries.length === 0 ? (
          <div className="p-10 text-center text-[13px] text-muted">{t("console.empty")}</div>
        ) : (
          entries.map((e) => (
            <div key={e.key} className="mb-4">
              <div className="flex items-center gap-2">
                <span className="font-mono text-[13px] text-accent">$ {e.command}</span>
                <span className="flex-1" />
                {e.status === "running" && (
                  <>
                    <IonSpinner name="crescent" style={{ width: 14, height: 14 }} />
                    <button type="button" onClick={() => void kill(e)} className="text-danger" aria-label={t("console.kill")}>
                      <IonIcon icon={stopCircleOutline} className="text-[18px]" />
                    </button>
                  </>
                )}
                {e.status !== "running" && (
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[11px] font-medium",
                      e.status === "exited" && (Number(e.exit ?? 0) === 0 ? "bg-success/15 text-success" : "bg-danger/15 text-danger"),
                      e.status === "error" && "bg-danger/15 text-danger",
                      (e.status === "killed" || e.status === "timeout") && "bg-warn/15 text-warn",
                    )}
                  >
                    {e.status === "exited" ? `${t("console.exit")} ${e.exit ?? 0}` : e.status}
                  </span>
                )}
                {e.completed !== undefined && (
                  <span className="text-[11px] tabular-nums text-faint">{formatDuration(e.completed - e.started)}</span>
                )}
              </div>
              {e.output ? <CodeBlock code={e.output} lang="text" plain /> : null}
            </div>
          ))
        )}
      </div>

      <div className="border-t border-border px-3 pb-[calc(8px+env(safe-area-inset-bottom))] pt-2">
        <div className="flex items-center gap-2">
          <input
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void run();
            }}
            placeholder={t("console.placeholder")}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            className="min-w-0 flex-1 rounded-xl border border-border bg-surface px-3.5 py-2.5 font-mono text-[14px] text-fg outline-none placeholder:text-faint focus:border-borderstrong"
          />
          <button
            type="button"
            disabled={!command.trim()}
            onClick={() => void run()}
            className={cn("flex h-11 w-11 items-center justify-center rounded-full", command.trim() ? "bg-accent text-white" : "text-faint opacity-50")}
            aria-label={t("console.run")}
          >
            <IonIcon icon={playOutline} className="text-[20px]" />
          </button>
        </div>
      </div>
    </div>
  );
}
