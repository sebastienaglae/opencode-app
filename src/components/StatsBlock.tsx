import { useT } from "../core/i18n";
import { formatCost, formatDuration, formatTokens, formatUsage } from "../core/format";
import type { TokenUsage } from "../core/types";

/** Discrete one-line end-of-session summary (wraps if needed). */
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

  const parts = [
    `${messages} ${t("conv.stats.messages")}`,
    `${tools} ${t("conv.stats.tools")}`,
    `${formatTokens(tokens.input)} in · ${formatTokens(out)} out · ${formatTokens(tokens.reasoning)} reason`,
    formatCost(cost),
    durationMs !== undefined ? formatDuration(durationMs) : undefined,
    speed !== undefined ? `${speed} tok/s` : undefined,
  ].filter(Boolean) as string[];

  return (
    <div className="mt-5 border-t border-border pt-2.5 text-[12px] leading-relaxed text-faint">
      {parts.join("  ·  ")}
    </div>
  );
}

export { formatUsage };
