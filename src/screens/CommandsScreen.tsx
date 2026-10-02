import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { IonIcon, IonSpinner } from "@ionic/react";
import { useQuery } from "@tanstack/react-query";
import { searchOutline } from "ionicons/icons";
import { api } from "../core/api/opencode";
import { BUILTIN_COMMANDS } from "../core/builtinCommands";
import { useConnection } from "../core/store/connection";
import { useT } from "../core/i18n";
import { cn } from "../core/cn";
import { AppHeader } from "../components/AppHeader";

type Tab = "commands" | "skills" | "mcp";

export default function CommandsScreen() {
  const t = useT();
  const status = useConnection((s) => s.status);
  const [params] = useSearchParams();
  const [tab, setTab] = useState<Tab>((params.get("tab") as Tab) || "commands");
  const [search, setSearch] = useState("");

  useEffect(() => {
    const p = params.get("tab") as Tab | null;
    if (p) setTab(p);
  }, [params]);

  const commands = useQuery({ queryKey: ["commands"], queryFn: api.listCommands, enabled: status === "connected", retry: false });
  const skills = useQuery({ queryKey: ["skills"], queryFn: api.listSkills, enabled: status === "connected", retry: false });
  const mcp = useQuery({ queryKey: ["mcp"], queryFn: () => api.listMcp(), enabled: status === "connected", retry: false });

  const allCommands = useMemo(() => {
    const builtins = BUILTIN_COMMANDS.map((b) => ({ name: b.name, description: t(b.descKey), builtin: true }));
    const known = new Set(builtins.map((b) => b.name));
    const extra = (commands.data ?? [])
      .filter((c) => !known.has(c.name))
      .map((c) => ({ name: c.name, description: c.description ?? "", builtin: false }));
    return [...builtins, ...extra];
  }, [commands.data, t]);

  const q = search.toLowerCase();
  const filteredCommands = allCommands.filter((c) => !q || c.name.toLowerCase().includes(q) || c.description.toLowerCase().includes(q));
  const filteredSkills = (skills.data ?? []).filter((s) => !q || s.name.toLowerCase().includes(q) || (s.description ?? "").toLowerCase().includes(q));
  const filteredMcp = (mcp.data ?? []).filter((m) => !q || m.name.toLowerCase().includes(q));

  const loading = tab === "commands" ? commands.isLoading : tab === "skills" ? skills.isLoading : mcp.isLoading;

  const mcpStatus = (s?: string) => {
    switch (s) {
      case "connected": return t("commands.mcp.connected");
      case "disabled": return t("commands.mcp.disabled");
      case "failed": return t("commands.mcp.failed");
      case "needs-auth": return t("commands.mcp.needsAuth");
      case "pending": return t("commands.mcp.pending");
      default: return s ?? "";
    }
  };

  return (
    <div className="flex h-full flex-col bg-bg">
      <AppHeader subtitle={t("commands.title")} />
      <div className="flex gap-1 border-b border-border px-3 py-2">
        {(["commands", "skills", "mcp"] as const).map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={cn("flex-1 rounded-lg py-2 text-[13.5px] font-semibold transition-colors", tab === id ? "bg-accentsoft text-accent" : "text-muted")}
          >
            {t(id === "commands" ? "commands.tab.commands" : id === "skills" ? "commands.tab.skills" : "commands.tab.mcp")}
          </button>
        ))}
      </div>
      <div className="border-b border-border px-3 py-2">
        <div className="flex items-center gap-2 rounded-lg bg-surface2 px-3 py-2">
          <IonIcon icon={searchOutline} className="text-[16px] text-faint" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("common.search")}
            className="w-full bg-transparent text-[14px] text-fg outline-none placeholder:text-faint"
          />
        </div>
      </div>
      <div className="oc-scroll min-h-0 flex-1 overflow-y-auto pb-8">
        {status !== "connected" ? (
          <div className="p-10 text-center text-[13px] text-muted">{t("sessions.noConnection")}</div>
        ) : loading ? (
          <div className="flex justify-center p-10">
            <IonSpinner name="crescent" />
          </div>
        ) : tab === "commands" ? (
          filteredCommands.length === 0 ? (
            <div className="p-10 text-center text-[13px] text-muted">{t("commands.empty")}</div>
          ) : (
            <>
              <div className="px-4 py-2 text-[11px] text-faint">{t("commands.hint")}</div>
              {filteredCommands.map((c) => (
                <div key={c.name} className="flex items-baseline gap-3 border-b border-border px-4 py-3">
                  <span className="shrink-0 font-mono text-[14px] font-semibold text-accent">/{c.name}</span>
                  <span className="min-w-0 flex-1 text-[13px] text-muted">{c.description}</span>
                  {c.builtin && <span className="shrink-0 text-[10.5px] uppercase tracking-wide text-faint">{t("commands.builtin")}</span>}
                </div>
              ))}
            </>
          )
        ) : tab === "skills" ? (
          filteredSkills.length === 0 ? (
            <div className="p-10 text-center text-[13px] text-muted">{t("commands.skills.empty")}</div>
          ) : (
            filteredSkills.map((s) => (
              <div key={s.id} className="border-b border-border px-4 py-3">
                <div className="text-[14.5px] text-fg">{s.name}</div>
                {s.description && <div className="mt-0.5 text-[12.5px] text-muted">{s.description}</div>}
              </div>
            ))
          )
        ) : filteredMcp.length === 0 ? (
          <div className="p-10 text-center text-[13px] text-muted">{t("commands.mcp.empty")}</div>
        ) : (
          filteredMcp.map((m) => (
            <div key={m.name} className="flex items-center gap-3 border-b border-border px-4 py-3">
              <span className="min-w-0 flex-1 text-[14.5px] text-fg">{m.name}</span>
              <span
                className={cn(
                  "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium",
                  m.status?.status === "connected" ? "bg-success/15 text-success" : "bg-surface2 text-muted",
                )}
              >
                {mcpStatus(m.status?.status)}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
