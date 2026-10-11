import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { IonIcon, IonSpinner } from "@ionic/react";
import { useQuery } from "@tanstack/react-query";
import { arrowBackOutline, globeOutline, refreshOutline } from "ionicons/icons";
import { api } from "../core/api/opencode";
import { useSettings } from "../core/store/settings";
import { useConnection } from "../core/store/connection";
import { useT } from "../core/i18n";
import { cn } from "../core/cn";
import { AppHeader } from "../components/AppHeader";

export default function PreviewScreen() {
  const t = useT();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const status = useConnection((s) => s.status);
  const settings = useSettings();
  const host = settings.host;
  const [scheme, setScheme] = useState<"http" | "https">("http");

  const [port, setPort] = useState(params.get("port") ?? "");
  const [reloadKey, setReloadKey] = useState(0);

  const { data, isLoading } = useQuery({
    queryKey: ["servers"],
    queryFn: () => api.listServers(),
    enabled: status === "connected" && settings.previewAllowed,
    retry: false,
    refetchInterval: 15000,
  });

  const servers = data?.servers ?? [];
  useEffect(() => {
    if (!port && servers.length > 0) setPort(String(servers[0].port));
  }, [servers, port]);

  const url = useMemo(() => (host && port ? `${scheme}://${host}:${port}` : ""), [scheme, host, port]);

  if (!settings.previewAllowed) {
    return (
      <div className="flex h-full flex-col bg-bg">
        <AppHeader
          left={
            <button type="button" onClick={() => navigate(-1)} className="p-1.5 text-muted active:text-fg" aria-label={t("common.back")}>
              <IonIcon icon={arrowBackOutline} className="text-[20px]" />
            </button>
          }
          subtitle={t("preview.title")}
        />
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-8 text-center">
          <IonIcon icon={globeOutline} className="text-[40px] text-accent" />
          <div className="text-[16px] font-semibold text-fg">{t("preview.permission.title")}</div>
          <p className="max-w-sm text-[13.5px] leading-relaxed text-muted">{t("preview.permission.body")}</p>
          <button
            type="button"
            onClick={() => settings.update({ previewAllowed: true })}
            className="rounded-xl bg-accent px-6 py-2.5 text-[15px] font-semibold text-white"
          >
            {t("preview.permission.allow")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-bg">
      <AppHeader
        left={
          <button type="button" onClick={() => navigate(-1)} className="p-1.5 text-muted active:text-fg" aria-label={t("common.back")}>
            <IonIcon icon={arrowBackOutline} className="text-[20px]" />
          </button>
        }
        subtitle={url || t("preview.title")}
        right={
          <button type="button" onClick={() => setReloadKey((k) => k + 1)} className="p-1.5 text-muted active:text-fg" aria-label={t("preview.reload")}>
            <IonIcon icon={refreshOutline} className="text-[18px]" />
          </button>
        }
      />

      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <button
          type="button"
          onClick={() => setScheme((s) => (s === "http" ? "https" : "http"))}
          className="shrink-0 rounded-md border border-border bg-surface2 px-2 py-1 font-mono text-[12px] font-semibold text-accent"
        >
          {scheme}
        </button>
        <span className="shrink-0 font-mono text-[12px] text-faint">://{host || "…"}:</span>
        <input
          value={port}
          onChange={(e) => setPort(e.target.value.replace(/[^0-9]/g, ""))}
          inputMode="numeric"
          placeholder="3000"
          className="w-20 rounded-lg border border-border bg-surface px-2.5 py-1.5 font-mono text-[13px] text-fg outline-none focus:border-borderstrong"
        />
        <button
          type="button"
          disabled={!url}
          onClick={() => setReloadKey((k) => k + 1)}
          className={cn("rounded-lg px-3 py-1.5 text-[13px] font-semibold", url ? "bg-accent text-white" : "text-faint opacity-50")}
        >
          {t("preview.open")}
        </button>
      </div>

      {servers.length > 0 && (
        <div className="flex items-center gap-1.5 overflow-x-auto oc-scroll border-b border-border px-3 py-2">
          <span className="shrink-0 text-[11px] font-bold uppercase tracking-wide text-faint">{t("preview.detected")}</span>
          {servers.map((s) => (
            <button
              key={s.port}
              type="button"
              onClick={() => setPort(String(s.port))}
              className={cn(
                "shrink-0 rounded-full border px-2.5 py-1 font-mono text-[12px]",
                port === String(s.port) ? "border-accent bg-accentsoft text-accent" : "border-border bg-surface2 text-muted",
              )}
            >
              :{s.port}
            </button>
          ))}
        </div>
      )}

      <div className="relative min-h-0 flex-1 bg-white">
        {isLoading && !url ? (
          <div className="flex h-full items-center justify-center bg-bg">
            <IonSpinner name="crescent" />
          </div>
        ) : url ? (
          <iframe
            key={`${url}-${reloadKey}`}
            src={url}
            title={t("preview.title")}
            className="h-full w-full border-0"
            allow="clipboard-read; clipboard-write; fullscreen"
          />
        ) : (
          <div className="flex h-full items-center justify-center bg-bg px-8 text-center text-[13px] text-muted">{t("preview.none")}</div>
        )}
      </div>
    </div>
  );
}
