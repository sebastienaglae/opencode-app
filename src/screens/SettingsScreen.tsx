import { useState } from "react";
import { IonSpinner } from "@ionic/react";
import { useConnection } from "../core/store/connection";
import { DEFAULT_CANDIDATE_PORTS, useSettings, type ThemeMode } from "../core/store/settings";
import { LANGUAGES, useT, type Lang } from "../core/i18n";
import { cn } from "../core/cn";

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
          className={cn("flex-1 rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors", value === o.id ? "bg-accentsoft text-accent" : "text-muted")}
        >
          {o.label}
        </button>
      ))}
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
      <header className="border-b border-border px-4 pb-2.5 pt-[calc(10px+env(safe-area-inset-top))]">
        <span className="text-[16px] font-bold text-fg">{t("settings.title")}</span>
      </header>
      <div className="oc-scroll min-h-0 flex-1 overflow-y-auto px-4 pb-10">
        <section className="py-3">
          <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-faint">{t("settings.connection")}</div>
          <Field label={t("settings.host")} value={host} onChange={setHost} placeholder="192.168.1.133" />
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
          <Row label={t("settings.events")} value={eventStatus} />
          {serverInfo && <Row label={t("settings.server")} value={`v${serverInfo.version} · pid ${serverInfo.pid}`} />}
          {error && <div className="py-2 text-[13px] text-danger">{error}</div>}
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

        <div className="border-t border-border pt-4 text-[12px] text-faint">
          {t("settings.footer")}
        </div>
      </div>
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
