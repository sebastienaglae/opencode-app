let locale = "fr";

export function setFormatLocale(l: string): void {
  locale = l || "fr";
}
export function getFormatLocale(): string {
  return locale;
}

export function formatTokens(n: number | undefined): string {
  if (!n) return "0";
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}k`;
  return `${(n / 1_000_000).toFixed(2)}M`;
}

export function formatCost(usd: number | undefined): string {
  if (!usd) return "$0.00";
  const digits = usd < 0.01 ? 4 : usd < 1 ? 3 : 2;
  return new Intl.NumberFormat(locale, { style: "currency", currency: "USD", minimumFractionDigits: digits, maximumFractionDigits: digits }).format(usd);
}

export function formatNumber(n: number | undefined): string {
  return new Intl.NumberFormat(locale).format(n ?? 0);
}

export function formatRelative(ts: number | undefined): string {
  if (!ts) return "—";
  const diff = ts - Date.now();
  const abs = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ["year", 31_536_000_000],
    ["month", 2_592_000_000],
    ["day", 86_400_000],
    ["hour", 3_600_000],
    ["minute", 60_000],
    ["second", 1000],
  ];
  for (const [unit, ms] of units) {
    if (abs >= ms || unit === "second") return rtf.format(Math.round(diff / ms), unit);
  }
  return "";
}

export function formatDateTime(ts: number | undefined): string {
  if (!ts) return "—";
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(ts));
}

export function formatDate(ts: number | undefined): string {
  if (!ts) return "—";
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(ts));
}

export function formatDuration(ms: number | undefined): string {
  if (ms === undefined || ms < 0) return "—";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  const totalSeconds = ms / 1000;
  if (totalSeconds < 60) return `${totalSeconds.toFixed(1)} s`;
  const m = Math.floor(totalSeconds / 60);
  const s = Math.round(totalSeconds - m * 60);
  if (m < 60) return `${m}m ${s}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m - h * 60}m`;
}

export function shortPath(p: string | undefined, max = 48): string {
  if (!p) return "";
  const normalized = p.replace(/\\/g, "/");
  if (normalized.length <= max) return normalized;
  const parts = normalized.split("/");
  if (parts.length <= 2) return normalized;
  return `…/${parts.slice(-3).join("/")}`;
}

export function basename(p: string | undefined): string {
  if (!p) return "";
  const normalized = p.replace(/\\/g, "/");
  return normalized.split("/").filter(Boolean).pop() ?? normalized;
}

export type Translator = (key: string, vars?: Record<string, string | number>) => string;

export function formatUsage(
  tokens: { input: number; output: number; reasoning: number; cache: { read: number; write: number } },
  t: Translator,
): string {
  return [
    `${t("usage.in")} ${formatTokens(tokens.input)}`,
    `${t("usage.out")} ${formatTokens(tokens.output)}`,
    `${t("usage.reason")} ${formatTokens(tokens.reasoning)}`,
    `${t("usage.cache")} ${formatTokens(tokens.cache.read)}/${formatTokens(tokens.cache.write)}`,
  ].join(" · ");
}
