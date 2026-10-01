import { useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { IonIcon, IonSpinner } from "@ionic/react";
import { useQuery } from "@tanstack/react-query";
import { chevronForwardOutline, copyOutline, folderOutline } from "ionicons/icons";
import { api } from "../core/api/opencode";
import { useSessions } from "../core/store/sessions";
import { useConnection } from "../core/store/connection";
import { useT } from "../core/i18n";
import { cn } from "../core/cn";
import { basename, formatRelative } from "../core/format";
import { copyText } from "../core/clipboard";
import { toast } from "../core/store/toast";
import { Mark } from "../components/Mark";
import type { Project } from "../core/types";

export default function ProjectsScreen() {
  const t = useT();
  const navigate = useNavigate();
  const status = useConnection((s) => s.status);
  const list = useSessions((s) => s.list);
  const conversations = useSessions((s) => s.conversations);
  const loadSessions = useSessions((s) => s.loadSessions);

  const { data: projects = [], isLoading } = useQuery({
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

  const rows = useMemo(() => {
    const byProject = new Map<string, typeof list>();
    for (const s of list) {
      const arr = byProject.get(s.projectID) ?? [];
      arr.push(s);
      byProject.set(s.projectID, arr);
    }
    const isActive = (sid: string) => Boolean(activeMap[sid]) || Boolean(conversations[sid]?.running);

    const merged = projects.map((p: Project) => {
      const sessions = byProject.get(p.id) ?? [];
      return {
        id: p.id,
        name: p.name || basename(p.canonical) || t("sessions.project.other"),
        path: p.canonical,
        count: sessions.length,
        active: sessions.some((s) => isActive(s.id)),
        updated: Math.max(p.time?.active ?? 0, ...sessions.map((s) => s.time.updated), 0),
        git: p.vcs === "git",
      };
    });
    for (const [projectID, sessions] of byProject) {
      if (projects.some((p) => p.id === projectID)) continue;
      merged.push({
        id: projectID,
        name: basename(sessions[0]?.location?.directory) || t("sessions.project.other"),
        path: sessions[0]?.location?.directory ?? "",
        count: sessions.length,
        active: sessions.some((s) => isActive(s.id)),
        updated: Math.max(...sessions.map((s) => s.time.updated), 0),
        git: false,
      });
    }
    // Hide noise "projects" that are drives/temp dirs with no session and no VCS.
    return merged
      .filter((r) => r.count > 0 || r.git)
      .sort((a, b) => Number(b.active) - Number(a.active) || b.updated - a.updated);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects, list, activeMap, conversations, t]);

  const copyPath = async (path: string) => {
    const ok = await copyText(path);
    toast[ok ? "success" : "error"](ok ? t("toast.copied") : t("toast.copyFailed"));
  };

  return (
    <div className="flex h-full flex-col bg-bg">
      <header className="flex items-center gap-2 border-b border-border px-4 pb-2.5 pt-[calc(10px+env(safe-area-inset-top))]">
        <Mark className="h-[15px] w-3 text-fg" />
        <span className="text-[16px] font-bold tracking-tight text-fg">OpenCode</span>
        <span className="flex-1" />
        <span
          className={cn("h-2 w-2 rounded-full", status === "connected" ? "bg-success" : status === "connecting" ? "bg-info oc-pulse" : "bg-faint")}
          title={status}
        />
      </header>

      <div className="oc-scroll min-h-0 flex-1 overflow-y-auto">
        {status !== "connected" ? (
          <div className="p-10 text-center text-[13px] text-muted">{t("sessions.noConnection")}</div>
        ) : isLoading && rows.length === 0 ? (
          <div className="flex justify-center p-10">
            <IonSpinner name="crescent" />
          </div>
        ) : rows.length === 0 ? (
          <div className="p-10 text-center text-[13px] text-muted">{t("projects.empty")}</div>
        ) : (
          rows.map((row) => (
            <div key={row.id} className="flex items-center border-b border-border">
              <button
                type="button"
                onClick={() => navigate(`/project/${row.id}`)}
                className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3.5 text-left active:bg-surface2"
              >
                <IonIcon icon={folderOutline} className="text-[20px] text-muted" />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    {row.active && <span className="h-1.5 w-1.5 rounded-full bg-success oc-pulse" />}
                    <span className="truncate text-[15px] font-semibold text-fg">{row.name}</span>
                  </span>
                  <span className="mt-0.5 block truncate font-mono text-[11.5px] text-faint">{row.path}</span>
                  <span className="mt-0.5 block text-[11.5px] text-faint">
                    {t("projects.sessions", { count: row.count })} · {formatRelative(row.updated)}
                  </span>
                </span>
              </button>
              <button
                type="button"
                onClick={() => void copyPath(row.path)}
                className="p-2 text-faint active:text-fg"
                aria-label={t("projects.copyPath")}
              >
                <IonIcon icon={copyOutline} className="text-[16px]" />
              </button>
              <IonIcon icon={chevronForwardOutline} className="mr-3 text-[16px] text-faint" />
            </div>
          ))
        )}
        <div className="h-16" />
      </div>
    </div>
  );
}
