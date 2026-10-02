import { useEffect, useState } from "react";
import { IonSpinner } from "@ionic/react";
import { LocalNotifications } from "@capacitor/local-notifications";
import { Camera } from "@capacitor/camera";
import { useConnection } from "../core/store/connection";
import { DEFAULT_CANDIDATE_PORTS, useSettings, type ThemeMode } from "../core/store/settings";
import { LANGUAGES, useT, type Lang } from "../core/i18n";
import { cn } from "../core/cn";
import { AppHeader } from "../components/AppHeader";

function Field({
  label,
  value,
  onChange,
  mono,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  mono?: boolean;
  placeholder?: string;
}) {
  return (
    <label className="flex flex-col gap-1 py-2">
      <span className="text-[12px] font-semibold text-muted">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn(
          "rounded-lg border border-border bg-surface px-3 py-2 text-[14px] text-fg outline-none placeholder:text-faint focus:border-borderstrong",
          mono && "font-mono text-[13px]",
        )}
      />
    </label>
  );
}

function Segmented<T extends string>({ value, options, onChange }: { value: T; options: Array<{ id: T; label: string }>; onChange: (v: T) => void }) {
  return (
    <div className="flex rounded-lg border border-border p-0.5">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => onChange(o.id)}
          className={cn("flex-1 rounded-md px-2 py-1.5 text-[13px] font-medium transition-colors", value === o.id ? "bg-accentsoft text-accent" : "text-muted")}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-2">
      <span className="text-[13px] text-muted">{label}</span>
      <span className="font-mono text-[12.5px] text-fg">{value}</span>
    </div>
  );
}

function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <button type="button" onClick={() => onChange(!checked)} className="flex w-full items-center gap-3 py-2.5 text-left">
      <span className="flex-1">
        <span className="block text-[14px] text-fg">{label}</span>
        {hint && <span className="block text-[11.5px] text-faint">{hint}</span>}
      </span>
      <span className={cn("flex h-6 w-11 shrink-0 items-center rounded-full border border-border transition-colors", checked ? "bg-accent" : "bg-surface2")}>
        <span className={cn("h-5 w-5 rounded-full bg-bg transition-transform", checked ? "translate-x-[22px]" : "translate-x-0.5")} />
      </span>
    </button>
  );
}

function PermissionRow({ label, kind }: { label: string; kind: "notifications" | "camera" }) {
  const t = useT();
  const [state, setState] = useState<string>("");

  const check = async () => {
    try {
      if (kind === "notifications") setState((await LocalNotifications.checkPermissions()).display);
      else setState((await Camera.checkPermissions()).camera);
    } catch {
      setState("");
    }
  };
  const request = async () => {
    try {
      if (kind === "notifications") setState((await LocalNotifications.requestPermissions()).display);
      else setState((await Camera.requestPermissions({ permissions: ["camera"] })).camera);
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    void check();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const granted = state === "granted";
  return (
    <div className="flex items-center gap-3 py-2.5">
      <span className="flex-1 text-[14px] text-fg">{label}</span>
      <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", granted ? "bg-success/15 text-success" : "bg-surface2 text-muted")}>
        {granted ? t("settings.permissions.granted") : state ? t("settings.permissions.denied") : "—"}
      </span>
      {!granted && (
        <button type="button" onClick={() => void request()} className="rounded-lg border border-border px-2.5 py-1 text-[12px] font-medium text-fg">
          {t("settings.permissions.grant")}
        </button>
      )}
    </div>
  );
}

export default function SettingsScreen() {
  const t = useT();
  const settings = useSettings();
  const { status, error, serverInfo, latency, eventStatus, connect, disconnect } = useConnection();

  const [host, setHost] = useState(settings.host);
  const [port, setPort] = useState(String(settings.port));
  const [token, setToken] = useState(settings.token);
  const [ports, setPorts] = useState(settings.candidatePorts.join(", "));

  const save = () => {
    const parsedPorts = ports
      .split(/[,\s]+/)
      .map((p) => Number.parseInt(p.trim(), 10))
      .filter((p) => Number.isFinite(p) && p > 0);
    settings.update({
      host: host.trim(),
      port: Number.parseInt(port, 10) || settings.port,
      token: token.trim(),
      candidatePorts: parsedPorts.length ? parsedPorts : DEFAULT_CANDIDATE_PORTS,
    });
  };

  return (
    <div className="flex h-full flex-col bg-bg">
      <AppHeader subtitle={t("settings.title")} />
      <div className="oc-scroll min-h-0 flex-1 overflow-y-auto px-4 pb-10">
        <section className="py-3">
          <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-faint">{t("settings.connection")}</div>
          <Field label={t("settings.host")} value={host} onChange={setHost} placeholder="192.168.1.x" />
          <Field label={t("settings.port")} value={port} onChange={setPort} placeholder="47821" />
          <Field label={t("settings.ports")} value={ports} onChange={setPorts} mono />
          <Field label={t("settings.token")} value={token} onChange={setToken} mono />
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => {
                save();
                void connect();
              }}
              disabled={status === "connecting"}
              className="flex-1 rounded-lg bg-accent py-2.5 text-[14px] font-semibold text-white disabled:opacity-50"
            >
              {status === "connecting" ? <IonSpinner name="crescent" /> : t("settings.connect")}
            </button>
            <button type="button" onClick={disconnect} className="rounded-lg border border-border px-4 py-2.5 text-[14px] font-semibold text-muted">
              {t("settings.disconnect")}
            </button>
          </div>
        </section>

        <section className="border-t border-border py-3">
          <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-faint">{t("settings.state")}</div>
          <Row label={t("settings.status")} value={`${status}${latency !== undefined ? ` · ${latency} ms` : ""}`} />
          <Row label={t("settings.events")} value={t(`events.${eventStatus}`)} />
          {serverInfo && <Row label={t("settings.server")} value={`v${serverInfo.version} · pid ${serverInfo.pid}`} />}
          {error && <div className="py-2 text-[13px] text-danger">{error === "unauthorized" ? t("conn.unauthorized.title") : error}</div>}
        </section>

        <section className="border-t border-border py-3">
          <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-faint">{t("settings.permissions")}</div>
          <PermissionRow label={t("settings.permissions.notifications")} kind="notifications" />
          <PermissionRow label={t("settings.permissions.camera")} kind="camera" />
        </section>

        <section className="border-t border-border py-3">
          <div className="mb-2 text-[11px] font-bold uppercase tracking-wide text-faint">{t("settings.appearance")}</div>
          <Segmented<ThemeMode>
            value={settings.theme}
            onChange={(v) => settings.update({ theme: v })}
            options={[
              { id: "dark", label: t("settings.theme.dark") },
              { id: "light", label: t("settings.theme.light") },
              { id: "system", label: t("settings.theme.system") },
            ]}
          />
          <div className="mb-2 mt-4 text-[11px] font-bold uppercase tracking-wide text-faint">{t("settings.language")}</div>
          <Segmented<Lang> value={settings.lang} onChange={(v) => settings.update({ lang: v })} options={LANGUAGES.map((l) => ({ id: l.id, label: l.label }))} />
        </section>

        <section className="border-t border-border py-3">
          <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-faint">{t("settings.security")}</div>
          <Toggle
            checked={settings.secure}
            onChange={(v) => {
              settings.update({ secure: v });
              void connect();
            }}
            label={t("settings.security.secure")}
            hint={t("settings.security.hint")}
          />
        </section>

        <div className="border-t border-border pt-4 text-[12px] text-faint">{t("settings.footer")}</div>
      </div>
    </div>
  );
}
