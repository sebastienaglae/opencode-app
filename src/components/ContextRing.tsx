export function ContextRing({
  used,
  limit,
  size = 24,
  stroke = 2.5,
  onClick,
}: {
  used: number;
  limit: number;
  size?: number;
  stroke?: number;
  onClick?: () => void;
}) {
  const pct = limit > 0 ? Math.min(used / limit, 1) : 0;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const color = pct > 0.85 ? "var(--oc-danger)" : pct > 0.6 ? "var(--oc-warn)" : "var(--oc-accent)";
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center justify-center rounded-full p-1"
      aria-label={`${Math.round(pct * 100)}%`}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="var(--oc-border)" strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={stroke}
          fill="none"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 0.35s ease" }}
        />
      </svg>
    </button>
  );
}
