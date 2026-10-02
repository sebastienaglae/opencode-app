import type { ReactNode } from "react";

/** Constant-height app header: always shows "OpenCode" on top and a subtitle
 *  (section or context) below, regardless of the screen. */
export function AppHeader({
  subtitle,
  left,
  right,
  onSubtitleClick,
}: {
  subtitle?: ReactNode;
  left?: ReactNode;
  right?: ReactNode;
  onSubtitleClick?: () => void;
}) {
  return (
    <header className="pt-safe flex min-h-14 shrink-0 items-center gap-1.5 border-b border-border px-3">
      {left}
      <div className="min-w-0 flex-1">
        <div className="truncate text-[15px] font-bold leading-tight tracking-tight text-fg">OpenCode</div>
        {subtitle !== undefined && (
          <button
            type="button"
            onClick={onSubtitleClick}
            disabled={!onSubtitleClick}
            className="block max-w-full truncate text-left text-[12px] leading-tight text-muted"
          >
            {subtitle}
          </button>
        )}
      </div>
      {right}
    </header>
  );
}
