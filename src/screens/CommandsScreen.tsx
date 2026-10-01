import { useMemo, useState } from "react";
import { IonIcon, IonSpinner } from "@ionic/react";
import { useQuery } from "@tanstack/react-query";
import { searchOutline } from "ionicons/icons";
import { api } from "../core/api/opencode";
import { useConnection } from "../core/store/connection";
import { useT } from "../core/i18n";
import { cn } from "../core/cn";

export default function CommandsScreen() {
  const t = useT();
  const status = useConnection((s) => s.status);
  const [tab, setTab] = useState<"commands" | "skills">("commands");
  const [search, setSearch] = useState("");

  const commands = useQuery({ queryKey: ["commands"], queryFn: api.listCommands, enabled: status === "connected", retry: false });
  const skills = useQuery({ queryKey: ["skills"], queryFn: api.listSkills, enabled: status === "connected", retry: false });

  const allCommands = useMemo(() => {
    const builtins = [{ name: "compact", description: t("conv.menu.compact") }];
    const custom = (commands.data ?? []).filter((c) => c.name !== "compact");
    return [...builtins, ...custom];
  }, [commands.data, t]);

  const q = search.toLowerCase();
  const filteredCommands = allCommands.filter((c) => !q || c.name.toLowerCase().includes(q) || (c.description ?? "").toLowerCase().includes(q));
  const filteredSkills = (skills.data ?? []).filter((s) => !q || s.name.toLowerCase().includes(q) || (s.description ?? "").toLowerCase().includes(q));
  const loading = tab === "commands" ? commands.isLoading : skills.isLoading;

  return (
    <div className="flex h-full flex-col bg-bg">
      <header className="border-b border-border px-4 pb-2.5 pt-[calc(10px+env(safe-area-inset-top))]">
        <span className="text-[16px] font-bold text-fg">{t("commands.title")}</span>
      </header>
      <div className="flex gap-1 border-b border-border px-3 py-2">
        {(["commands", "skills"] as const).map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={cn("flex-1 rounded-lg py-1.5 text-[13px] font-semibold transition-colors", tab === id ? "bg-accentsoft text-accent" : "text-muted")}
          >
            {t(id === "commands" ? "commands.tab.commands" : "commands.tab.skills")}
          </button>
        ))}
      </div>
      <div className="border-b border-border px-3 py-2">
        <div className="flex items-center gap-2 rounded-lg bg-surface2 px-3 py-1.5">
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
                <div key={c.name} className="border-b border-border px-4 py-2.5">
                  <div className="font-mono text-[13px] font-semibold text-accent">/{c.name}</div>
                  {c.description && <div className="mt-0.5 text-[12.5px] text-muted">{c.description}</div>}
                </div>
              ))}
            </>
          )
        ) : filteredSkills.length === 0 ? (
          <div className="p-10 text-center text-[13px] text-muted">{t("commands.skills.empty")}</div>
        ) : (
          filteredSkills.map((s) => (
            <div key={s.id} className="border-b border-border px-4 py-2.5">
              <div className="text-[14px] text-fg">{s.name}</div>
              {s.description && <div className="mt-0.5 text-[12.5px] text-muted">{s.description}</div>}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
