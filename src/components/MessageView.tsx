import { memo, useState } from "react";
import { IonIcon } from "@ionic/react";
import { checkmarkOutline, copyOutline } from "ionicons/icons";
import type { AssistantMessage, AssistantPart, MessageInfo } from "../core/types";
import { useT } from "../core/i18n";
import { cn } from "../core/cn";
import { copyText } from "../core/clipboard";
import { toast } from "../core/store/toast";
import { Mark } from "./Mark";
import { AssistantParts, ShellRow } from "./parts";

function UserMessage({
  message,
  modelLabel,
  onOpenModel,
}: {
  message: Extract<MessageInfo, { type: "user" }>;
  modelLabel?: string;
  onOpenModel?: () => void;
}) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const long = message.text.length > 300 || message.text.split("\n").length > 6;
  const copy = async () => {
    const ok = await copyText(message.text);
    toast[ok ? "success" : "error"](ok ? t("toast.copied") : t("toast.copyFailed"));
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    }
  };
  return (
    <div className="mt-8 first:mt-0">
      <div className="mb-1.5 ml-0.5 text-[11px] font-bold uppercase tracking-wide text-faint">{t("conv.you")}</div>
      <div className="group relative rounded-2xl border border-border bg-surface px-4 py-3">
        <div
          className={cn(
            "whitespace-pre-wrap break-words text-[15px] leading-relaxed text-fg",
            long && !expanded && "line-clamp-6",
          )}
        >
          {message.text}
        </div>
        {long && (
          <button type="button" onClick={() => setExpanded((v) => !v)} className="mt-1.5 text-[13px] font-medium text-accent">
            {expanded ? t("conv.showLess") : t("conv.showMore")}
          </button>
        )}
        <button
          type="button"
          onClick={copy}
          className="absolute right-2.5 top-2.5 rounded-md border border-border bg-bg/80 p-1 text-faint opacity-0 transition-opacity group-hover:opacity-100 active:opacity-100"
          aria-label={t("common.copy")}
        >
          <IonIcon icon={copied ? checkmarkOutline : copyOutline} className="text-[13px]" />
        </button>
      </div>
      {message.files && message.files.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {message.files.map((f, i) => (
            <span key={i} className="rounded-md border border-border bg-surface2 px-2 py-0.5 text-[11.5px] text-muted">
              {f.name ?? "file"}
            </span>
          ))}
        </div>
      )}
      {modelLabel && (
        <button
          type="button"
          onClick={onOpenModel}
          className="mt-1.5 ml-0.5 inline-flex items-center gap-1.5 text-[11.5px] text-faint transition-colors hover:text-muted"
        >
          <Mark className="h-2.5 w-2" />
          <span>{modelLabel}</span>
        </button>
      )}
    </div>
  );
}

function AssistantView({ message, parts, running }: { message: AssistantMessage; parts: AssistantPart[]; running: boolean }) {
  return (
    <div className="mt-2">
      <AssistantParts parts={parts} running={running} />
      {message.error && <div className="mt-1 text-[13px] text-danger">{message.error.message}</div>}
    </div>
  );
}

export const MessageView = memo(function MessageView({
  message,
  parts,
  running,
  modelLabel,
  onOpenModel,
}: {
  message: MessageInfo;
  parts?: AssistantPart[];
  running: boolean;
  modelLabel?: string;
  onOpenModel?: () => void;
}) {
  if (message.type === "user") return <UserMessage message={message} modelLabel={modelLabel} onOpenModel={onOpenModel} />;
  if (message.type === "assistant") return <AssistantView message={message} parts={parts ?? message.content} running={running} />;
  if (message.type === "shell") return <div className="mt-1"><ShellRow message={message} /></div>;
  if (message.type === "skill") {
    return (
      <div className="mt-1 flex items-center gap-1.5 text-[12px] text-faint">
        <span className={cn("rounded bg-surface2 px-1.5 py-0.5")}>skill</span>
        <span>{message.name}</span>
      </div>
    );
  }
  if (message.type === "system" || message.type === "synthetic") {
    const text = "text" in message ? message.text : undefined;
    if (!text) return null;
    return <div className="mt-1 text-[12px] italic text-faint">{text}</div>;
  }
  return null;
});
