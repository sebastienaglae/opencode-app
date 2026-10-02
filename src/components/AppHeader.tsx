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
    <header className="pt-safe shrink-0 border-b border-border">
      <div className="flex min-h-12 items-center gap-2 px-3 py-2">
        {left}
        <div className="min-w-0 flex-1">
          <div className="truncate text-[15px] font-semibold leading-snug tracking-tight text-fg">OpenCode</div>
          {subtitle !== undefined && (
            <button
              type="button"
              onClick={onSubtitleClick}
              disabled={!onSubtitleClick}
              className="mt-0.5 block max-w-full truncate text-left text-[12px] leading-snug text-muted"
            >
              {subtitle}
            </button>
          )}
        </div>
        {right}
      </div>
    </header>
  );
}
