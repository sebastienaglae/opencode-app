export function formatTokens(n: number | undefined): string {
  if (!n) return "0";
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}k`;
  return `${(n / 1_000_000).toFixed(2)}M`;
}

export function formatCost(usd: number | undefined): string {
  if (!usd) return "$0.00";
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  if (usd < 1) return `$${usd.toFixed(3)}`;
  return `$${usd.toFixed(2)}`;
}

export function formatRelative(ts: number | undefined): string {
  if (!ts) return "—";
  const diff = Date.now() - ts;
  const s = Math.round(diff / 1000);
  if (s < 60) return "à l'instant";
  const m = Math.round(s / 60);
  if (m < 60) return `il y a ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `il y a ${h} h`;
  const days = Math.round(h / 24);
  if (days < 30) return `il y a ${days} j`;
  return new Date(ts).toLocaleDateString();
}

export function formatDateTime(ts: number | undefined): string {
  if (!ts) return "—";
  return new Date(ts).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDuration(ms: number | undefined): string {
  if (ms === undefined || ms < 0) return "—";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)} s`;
  const m = Math.floor(s / 60);
  return `${m}m ${Math.round(s - m * 60)}s`;
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

export function formatUsage(tokens: {
  input: number;
  output: number;
  reasoning: number;
  cache: { read: number; write: number };
}): string {
  return [
    `in ${formatTokens(tokens.input)}`,
    `out ${formatTokens(tokens.output)}`,
    `reason ${formatTokens(tokens.reasoning)}`,
    `cache r/w ${formatTokens(tokens.cache.read)}/${formatTokens(tokens.cache.write)}`,
  ].join(" · ");
}
