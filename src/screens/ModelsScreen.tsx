import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { IonIcon, IonSpinner } from "@ionic/react";
import { useQuery } from "@tanstack/react-query";
import { searchOutline } from "ionicons/icons";
import { api } from "../core/api/opencode";
import { useConnection } from "../core/store/connection";
import { useT } from "../core/i18n";
import { cn } from "../core/cn";
import { providerLabel, sortProviders, statusLabel, effortLabel } from "../core/models";
import { formatTokens } from "../core/format";
import { AppHeader } from "../components/AppHeader";

export default function ModelsScreen() {
  const t = useT();
  const status = useConnection((s) => s.status);
  const [search, setSearch] = useState("");

  const { data: models = [], isLoading, error } = useQuery({
    queryKey: ["models"],
    queryFn: api.listModels,
    enabled: status === "connected",
    retry: false,
  });

  const grouped = useMemo(() => {
    const filter = search.toLowerCase();
    const map = new Map<string, typeof models>();
    for (const m of models) {
      if (filter && !m.name.toLowerCase().includes(filter) && !m.providerID.toLowerCase().includes(filter) && !m.modelID.toLowerCase().includes(filter))
        continue;
      const list = map.get(m.providerID) ?? [];
      list.push(m);
      map.set(m.providerID, list);
    }
    return [...map.entries()].sort((a, b) => sortProviders(a[0], b[0])).map(([p, l]) => [p, l.sort((a, b) => a.name.localeCompare(b.name))] as const);
  }, [models, search]);

  return (
    <div className="flex h-full flex-col bg-bg">
      <AppHeader subtitle={t("models.title")} />
      <div className="border-b border-border px-3 py-2">
        <div className="flex items-center gap-2 rounded-lg bg-surface2 px-3 py-1.5">
          <IonIcon icon={searchOutline} className="text-[16px] text-faint" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("models.search")}
            className="w-full bg-transparent text-[14px] text-fg outline-none placeholder:text-faint"
          />
        </div>
      </div>
      <div className="oc-scroll min-h-0 flex-1 overflow-y-auto pb-8">
        {status !== "connected" ? (
          <div className="p-10 text-center text-[13px] text-muted">{t("models.noConnection")}</div>
        ) : isLoading ? (
          <div className="flex justify-center p-10">
            <IonSpinner name="crescent" />
          </div>
        ) : error ? (
          <div className="p-10 text-center text-[13px] text-danger">{(error as Error).message}</div>
        ) : grouped.length === 0 ? (
          <div className="p-10 text-center text-[13px] text-muted">{t("models.empty")}</div>
        ) : (
          grouped.map(([provider, list]) => (
            <section key={provider} className="border-b border-border">
              <div className="flex items-center gap-2 px-4 py-2">
                <span className="text-[12px] font-bold uppercase tracking-wide text-faint">{providerLabel(provider)}</span>
                <span className="text-[11px] text-faint">{list.length}</span>
              </div>
              {list.map((m) => (
                <div key={`${m.providerID}/${m.modelID}`} className="border-b border-border px-4 py-3">
                  <div className="text-[15px] text-fg">{m.name}</div>
                  <div className="mt-0.5 font-mono text-[11.5px] text-faint">
                    {m.modelID} · {t("metric.ctx")} {formatTokens(m.limit.context)} · {t("metric.out")} {formatTokens(m.limit.output)}
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    <Chip>{statusLabel(m.status, t)}</Chip>
                    {m.capabilities.tools && <Chip>{t("cap.tools")}</Chip>}
                    {m.capabilities.input.includes("image") && <Chip>{t("cap.vision")}</Chip>}
                    {m.family && <Chip>{m.family}</Chip>}
                    {m.cost[0] && (
                      <Chip>
                        ${m.cost[0].input}/M {t("usage.in")} · ${m.cost[0].output}/M {t("usage.out")}
                      </Chip>
                    )}
                    {m.time.released > 0 && <Chip>{new Date(m.time.released).toLocaleDateString()}</Chip>}
                  </div>
                  {m.variants?.length > 0 && (
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <span className="text-[11px] uppercase tracking-wide text-faint">{t("models.effort")}</span>
                      {m.variants.map((v) => (
                        <Chip key={v.id} accent>
                          {effortLabel(v.id, t)}
                        </Chip>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </section>
          ))
        )}
      </div>
    </div>
  );
}

function Chip({ children, accent }: { children: ReactNode; accent?: boolean }) {
  return (
    <span className={cn("rounded-full border px-2 py-0.5 text-[11px] font-medium", accent ? "border-accent/40 bg-accentsoft text-accent" : "border-border bg-surface2 text-muted")}>
      {children}
    </span>
  );
}
