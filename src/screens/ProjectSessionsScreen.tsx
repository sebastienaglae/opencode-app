import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { IonIcon, IonSpinner } from "@ionic/react";
import { useQuery } from "@tanstack/react-query";
import { addOutline, arrowBackOutline, copyOutline, ellipsisHorizontal, searchOutline } from "ionicons/icons";
import { api } from "../core/api/opencode";
import { useSessions } from "../core/store/sessions";
import { useConnection } from "../core/store/connection";
import { useT } from "../core/i18n";
import { basename, formatRelative } from "../core/format";
import { ActionSheet } from "../components/Sheet";
import type { SessionInfo } from "../core/types";

export default function ProjectSessionsScreen() {
  const { id } = useParams<{ id: string }>();
  const t = useT();
  const navigate = useNavigate();
  const status = useConnection((s) => s.status);
  const list = useSessions((s) => s.list);
  const conversations = useSessions((s) => s.conversations);
  const loadSessions = useSessions((s) => s.loadSessions);
  const removeSession = useSessions((s) => s.removeSession);

  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionFor, setActionFor] = useState<SessionInfo | null>(null);

  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: () => api.listProjects(),
    enabled: status === "connected",
    retry: false,
  });
  const { data: activeMap = {} } = useQuery({
    queryKey: ["active-sessions"],
    queryFn: () => api.activeSessions(),
    enabled: status === "connected",
    retry: false,
    refetchInterval: 6000,
  });

  useEffect(() => {
    if (status === "connected") void loadSessions();
  }, [status, loadSessions]);

  const project = projects.find((p) => p.id === id);
  const directory = project?.canonical ?? list.find((s) => s.projectID === id)?.location?.directory ?? "";
  const projectName = project?.name || basename(directory) || t("sessions.project.other");

  const isActive = (s: SessionInfo) => Boolean(activeMap[s.id]) || Boolean(conversations[s.id]?.running);

  const sessions = useMemo(() => {
    const q = search.toLowerCase();
    return list
      .filter((s) => s.projectID === id)
      .filter((s) => !q || (s.title ?? "").toLowerCase().includes(q))
      .sort((a, b) => Number(isActive(b)) - Number(isActive(a)) || b.time.updated - a.time.updated);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list, id, search, activeMap, conversations]);

  const onCreate = async () => {
    setBusy(true);
    try {
      const session = await useSessions.getState().createSession({ location: directory ? { directory } : undefined });
      if (session) navigate(`/session/${session.id}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative flex h-full flex-col bg-bg">
      <header className="flex items-center gap-1 border-b border-border px-2 pb-2.5 pt-[calc(10px+env(safe-area-inset-top))]">
        <button type="button" onClick={() => navigate("/projects")} className="p-2 text-muted active:text-fg" aria-label={t("common.back")}>
          <IonIcon icon={arrowBackOutline} className="text-[20px]" />
        </button>
        <div className="min-w-0 flex-1 px-1">
          <div className="truncate text-[16px] font-bold text-fg">{projectName}</div>
          {directory && (
            <button
              type="button"
              onClick={() => void navigator.clipboard.writeText(directory).catch(() => {})}
              className="flex max-w-full items-center gap-1 text-left"
            >
              <span className="truncate font-mono text-[11px] text-faint">{directory}</span>
              <IonIcon icon={copyOutline} className="shrink-0 text-[12px] text-faint" />
            </button>
          )}
        </div>
      </header>

      <div className="border-b border-border px-3 py-2">
        <div className="flex items-center gap-2 rounded-lg bg-surface2 px-3 py-2">
          <IonIcon icon={searchOutline} className="text-[16px] text-faint" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("sessions.search")}
            className="w-full bg-transparent text-[14px] text-fg outline-none placeholder:text-faint"
          />
        </div>
      </div>

      <div className="oc-scroll min-h-0 flex-1 overflow-y-auto">
        {sessions.length === 0 ? (
          <div className="p-10 text-center text-[13px] text-muted">{t("sessions.empty")}</div>
        ) : (
          sessions.map((session) => {
            const active = isActive(session);
            return (
              <div key={session.id} className="flex items-center border-b border-border">
                <button
                  type="button"
                  onClick={() => navigate(`/session/${session.id}`)}
                  className="flex min-w-0 flex-1 items-center gap-2 px-4 py-3 text-left active:bg-surface2"
                >
                  {active && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-success oc-pulse" />}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14.5px] text-fg">{session.title || "—"}</span>
                    <span className="block text-[11.5px] text-faint">{formatRelative(session.time.updated)}</span>
                  </span>
                </button>
                <button type="button" onClick={() => setActionFor(session)} className="px-3 py-2 text-faint active:text-fg" aria-label="actions">
                  <IonIcon icon={ellipsisHorizontal} className="text-[18px]" />
                </button>
              </div>
            );
          })
        )}
        <div className="h-20" />
      </div>

      <button
        type="button"
        disabled={busy}
        onClick={onCreate}
        className="absolute bottom-5 right-5 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-accent text-white shadow-lg active:scale-95 disabled:opacity-50"
        aria-label={t("sessions.new")}
      >
        {busy ? <IonSpinner name="crescent" /> : <IonIcon icon={addOutline} className="text-[26px]" />}
      </button>

      <ActionSheet
        open={actionFor !== null}
        onClose={() => setActionFor(null)}
        actions={
          actionFor
            ? [
                {
                  label: t("common.rename"),
                  onClick: () => {
                    const title = window.prompt(t("sessions.rename.prompt"), actionFor.title ?? "");
                    if (title != null && title.trim()) void useSessions.getState().renameSession(actionFor.id, title.trim());
                  },
                },
                {
                  label: t("conv.menu.fork"),
                  onClick: () => void api.forkSession(actionFor.id).then((s) => s && useSessions.getState().upsertSession(s)),
                },
                {
                  label: t("common.delete"),
                  destructive: true,
                  onClick: () => {
                    if (window.confirm(t("sessions.delete.confirm", { title: actionFor.title || "—" }))) void removeSession(actionFor.id);
                  },
                },
              ]
            : []
        }
      />
    </div>
  );
}
