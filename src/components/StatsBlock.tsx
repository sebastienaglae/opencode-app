import { useT } from "../core/i18n";
import { formatCost, formatDuration, formatUsage } from "../core/format";
import type { TokenUsage } from "../core/types";

export function StatsBlock({
  messages,
  tools,
  tokens,
  cost,
  durationMs,
}: {
  messages: number;
  tools: number;
  tokens: TokenUsage;
  cost: number;
  durationMs?: number;
}) {
  const t = useT();
  const out = tokens.output || 0;
  const speed = durationMs && durationMs > 0 ? Math.round((out / durationMs) * 1000) : undefined;

  return (
    <div className="mt-4 rounded-xl border border-border bg-surface px-4 py-3">
      <div className="mb-2 text-[11px] font-bold uppercase tracking-wide text-faint">{t("conv.stats.title")}</div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-[12.5px] sm:grid-cols-3">
        <Metric label={t("conv.stats.messages")} value={String(messages)} />
        <Metric label={t("conv.stats.tools")} value={String(tools)} />
        <Metric label={t("conv.stats.cost")} value={formatCost(cost)} accent />
        <Metric label={t("conv.stats.tokens")} value={formatUsage(tokens)} full />
        {durationMs !== undefined && <Metric label={t("conv.stats.duration")} value={formatDuration(durationMs)} />}
        {speed !== undefined && <Metric label={t("conv.stats.speed")} value={`${speed} tok/s`} />}
      </div>
    </div>
  );
}

function Metric({ label, value, full, accent }: { label: string; value: string; full?: boolean; accent?: boolean }) {
  return (
    <div className={full ? "col-span-2 sm:col-span-3" : undefined}>
      <div className="text-[10.5px] uppercase tracking-wide text-faint">{label}</div>
      <div className={`tabular-nums ${accent ? "text-accent" : "text-fg"}`}>{value}</div>
    </div>
  );
}
