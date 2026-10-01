import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { IonIcon, IonSpinner } from "@ionic/react";
import { useQuery } from "@tanstack/react-query";
import { addOutline, chevronDownOutline, ellipsisHorizontal, refreshOutline, searchOutline } from "ionicons/icons";
import { api } from "../core/api/opencode";
import { useSessions } from "../core/store/sessions";
import { useConnection } from "../core/store/connection";
import { useT } from "../core/i18n";
import { cn } from "../core/cn";
import { basename, formatRelative } from "../core/format";
import { Mark } from "../components/Mark";
import { Sheet, ActionSheet } from "../components/Sheet";
import type { SessionInfo } from "../core/types";

type Group = { id: string; name: string; sessions: SessionInfo[]; active: boolean; updated: number };

export default function SessionsScreen() {
  const t = useT();
  const navigate = useNavigate();
  const status = useConnection((s) => s.status);
  const list = useSessions((s) => s.list);
  const listLoading = useSessions((s) => s.listLoading);
  const conversations = useSessions((s) => s.conversations);
  const loadSessions = useSessions((s) => s.loadSessions);
  const removeSession = useSessions((s) => s.removeSession);
  const createSession = useSessions((s) => s.createSession);

  const [search, setSearch] = useState("");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDirectory, setNewDirectory] = useState("");
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

  const isActive = (s: SessionInfo) => Boolean(activeMap[s.id]) || Boolean(conversations[s.id]?.running);

  const groups = useMemo<Group[]>(() => {
    const projectById = new Map(projects.map((p) => [p.id, p] as const));
    const filtered = search
      ? list.filter(
          (s) =>
            (s.title ?? "").toLowerCase().includes(search.toLowerCase()) ||
            (s.location?.directory ?? "").toLowerCase().includes(search.toLowerCase()),
        )
      : list;

    const byProject = new Map<string, SessionInfo[]>();
    for (const s of filtered) {
      const key = s.projectID ?? "unknown";
      const arr = byProject.get(key) ?? [];
      arr.push(s);
      byProject.set(key, arr);
    }

    const result: Group[] = [];
    for (const [projectID, sessions] of byProject) {
      const project = projectById.get(projectID);
      const name =
        project?.name ||
        basename(project?.canonical) ||
        basename(sessions[0]?.location?.directory) ||
        t("sessions.project.other");
      const sorted = sessions.slice().sort((a, b) => {
        const aa = isActive(a) ? 1 : 0;
        const bb = isActive(b) ? 1 : 0;
        return bb - aa || b.time.updated - a.time.updated;
      });
      result.push({
        id: projectID,
        name,
        sessions: sorted,
        active: sorted.some(isActive),
        updated: Math.max(...sorted.map((s) => s.time.updated), 0),
      });
    }
    return result.sort((a, b) => Number(b.active) - Number(a.active) || b.updated - a.updated);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list, projects, search, activeMap, conversations, t]);

  const total = list.length;

  const onCreate = async () => {
    setBusy(true);
    try {
      const session = await createSession({
        title: newTitle.trim() || undefined,
        location: newDirectory.trim() ? { directory: newDirectory.trim() } : undefined,
      });
      setCreating(false);
      setNewTitle("");
      setNewDirectory("");
      if (session) navigate(`/session/${session.id}`);
    } finally {
      setBusy(false);
    }
  };

  const onDelete = (session: SessionInfo) => {
    if (window.confirm(t("sessions.delete.confirm", { title: session.title || "—" }))) void removeSession(session.id);
  };

  return (
    <div className="relative flex h-full flex-col bg-bg">
      <header className="flex items-center gap-2 border-b border-border px-4 pb-2.5 pt-[calc(10px+env(safe-area-inset-top))]">
        <Mark className="h-[15px] w-3 text-fg" />
        <span className="text-[16px] font-bold tracking-tight text-fg">OpenCode</span>
        <span className="text-[12px] text-faint">
          {t("sessions.count", { count: total })}
        </span>
        <span className="flex-1" />
        <span
          className={cn(
            "h-2 w-2 rounded-full",
            status === "connected" ? "bg-success" : status === "connecting" ? "bg-info oc-pulse" : "bg-faint",
          )}
          title={status}
        />
        <button type="button" onClick={() => void loadSessions()} className="p-1.5 text-muted active:text-fg" aria-label="refresh">
          <IonIcon icon={refreshOutline} className="text-[18px]" />
        </button>
      </header>

      <div className="border-b border-border px-3 py-2">
        <div className="flex items-center gap-2 rounded-lg bg-surface2 px-3 py-1.5">
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
        {status !== "connected" ? (
          <div className="p-10 text-center text-[13px] text-muted">{t("sessions.noConnection")}</div>
        ) : listLoading && list.length === 0 ? (
          <div className="flex justify-center p-10">
            <IonSpinner name="crescent" />
          </div>
        ) : groups.length === 0 ? (
          <div className="p-10 text-center text-[13px] text-muted">{t("sessions.empty")}</div>
        ) : (
          groups.map((group) => {
            const isCollapsed = collapsed[group.id];
            return (
              <section key={group.id} className="border-b border-border">
                <button
                  type="button"
                  onClick={() => setCollapsed((c) => ({ ...c, [group.id]: !c[group.id] }))}
                  className="flex w-full items-center gap-2 px-4 py-2.5 text-left active:bg-surface2"
                >
                  <IonIcon
                    icon={chevronDownOutline}
                    className={cn("text-[14px] text-faint transition-transform", isCollapsed && "-rotate-90")}
                  />
                  <span className="truncate text-[13.5px] font-semibold text-fg">{group.name}</span>
                  {group.active && <span className="h-1.5 w-1.5 rounded-full bg-success oc-pulse" />}
                  <span className="flex-1" />
                  <span className="text-[11.5px] text-faint">{group.sessions.length}</span>
                </button>

                {!isCollapsed &&
                  group.sessions.map((session) => {
                    const active = isActive(session);
                    return (
                      <div key={session.id} className="group/row flex items-center">
                        <button
                          type="button"
                          onClick={() => navigate(`/session/${session.id}`)}
                          className="flex min-w-0 flex-1 items-center gap-2 py-2.5 pl-9 pr-1 text-left active:bg-surface2"
                        >
                          {active && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-success oc-pulse" />}
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[14px] text-fg">{session.title || "—"}</span>
                            <span className="block text-[11.5px] text-faint">{formatRelative(session.time.updated)}</span>
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setActionFor(session)}
                          className="px-3 py-2 text-faint active:text-fg"
                          aria-label="actions"
                        >
                          <IonIcon icon={ellipsisHorizontal} className="text-[18px]" />
                        </button>
                      </div>
                    );
                  })}
              </section>
            );
          })
        )}
        <div className="h-20" />
      </div>

      <button
        type="button"
        onClick={() => setCreating(true)}
        className="absolute bottom-5 right-5 z-30 flex h-14 w-14 items-center justify-center rounded-2xl bg-accent text-white shadow-lg active:scale-95"
        aria-label={t("sessions.new")}
      >
        <IonIcon icon={addOutline} className="text-[26px]" />
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
                { label: t("common.delete"), destructive: true, onClick: () => onDelete(actionFor) },
              ]
            : []
        }
      />

      <Sheet open={creating} onClose={() => setCreating(false)} title={t("sessions.new")}>
        <div className="flex flex-col gap-3 p-4">
          <label className="flex flex-col gap-1">
            <span className="text-[12px] font-semibold text-muted">{t("sessions.create.name")}</span>
            <input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder={t("sessions.create.namePlaceholder")}
              className="rounded-lg border border-border bg-surface px-3 py-2 text-[14px] text-fg outline-none placeholder:text-faint focus:border-borderstrong"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[12px] font-semibold text-muted">{t("sessions.create.directory")}</span>
            <input
              value={newDirectory}
              onChange={(e) => setNewDirectory(e.target.value)}
              placeholder={t("sessions.create.directoryPlaceholder")}
              className="rounded-lg border border-border bg-surface px-3 py-2 font-mono text-[13px] text-fg outline-none placeholder:text-faint focus:border-borderstrong"
            />
          </label>
          <button
            type="button"
            disabled={busy}
            onClick={onCreate}
            className="mt-1 rounded-lg bg-accent py-2.5 text-[15px] font-semibold text-white disabled:opacity-50"
          >
            {busy ? <IonSpinner name="crescent" /> : t("sessions.create.submit")}
          </button>
          <p className="text-[12px] leading-relaxed text-faint">{t("sessions.create.hint")}</p>
        </div>
      </Sheet>
    </div>
  );
}
