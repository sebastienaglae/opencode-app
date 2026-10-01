import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { IonIcon } from "@ionic/react";
import { chevronForwardOutline } from "ionicons/icons";
import type { AssistantPart, ReasoningPart, ShellMessage, TextPart as TextPartType, ToolPart } from "../core/types";
import { cn } from "../core/cn";
import { useT } from "../core/i18n";
import { formatDuration } from "../core/format";
import { Markdown } from "./Markdown";
import { CodeBlock } from "./CodeBlock";

export function Collapsible({ open, children }: { open: boolean; children: ReactNode }) {
  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.18, ease: "easeOut" }}
          className="overflow-hidden"
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function Chevron({ open }: { open: boolean }) {
  return (
    <IonIcon
      icon={chevronForwardOutline}
      className={cn("shrink-0 text-[12px] text-faint transition-transform duration-200", open && "rotate-90")}
    />
  );
}

function Dots() {
  return (
    <span className="ml-1 inline-flex items-center gap-0.5">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="h-1 w-1 rounded-full bg-current"
          animate={{ opacity: [0.2, 1, 0.2] }}
          transition={{ duration: 1, repeat: Infinity, delay: i * 0.15 }}
        />
      ))}
    </span>
  );
}

function StatusDot({ status }: { status: "streaming" | "running" | "completed" | "error" }) {
  const color =
    status === "completed" ? "bg-success" : status === "error" ? "bg-danger" : status === "running" ? "bg-info" : "bg-faint";
  return <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", color, status !== "completed" && status !== "error" && "oc-pulse")} />;
}

// --- Reasoning ---------------------------------------------------------------

export function ReasoningRow({ part, running }: { part: ReasoningPart; running: boolean }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1.5 py-1 text-left text-[12.5px] font-medium text-muted"
      >
        <Chevron open={open} />
        <span className={cn(running && !open && "oc-shimmer")}>{t("conv.reasoning")}</span>
        {running && !open && <Dots />}
      </button>
      <Collapsible open={open}>
        <div className="whitespace-pre-wrap pb-2 pl-5 pr-1 text-[13px] leading-relaxed text-muted">{part.text || "…"}</div>
      </Collapsible>
    </div>
  );
}

// --- Tools -------------------------------------------------------------------

function ToolRow({ part }: { part: ToolPart }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(0);
  const state = part.state;
  const isRunning = state.status === "streaming" || state.status === "running";

  useEffect(() => {
    if (!isRunning) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [isRunning]);

  const end = part.time.completed ?? (now || undefined);
  const duration = part.time.ran !== undefined && end !== undefined ? end - part.time.ran : undefined;

  const inputText = state.status === "streaming" ? state.input || "…" : JSON.stringify(state.input ?? {}, null, 2);
  const output =
    state.status === "completed" || state.status === "error"
      ? (state.content ?? [])
          .map((c) => ("text" in c && c.text ? c.text : c.type === "file" ? `[file] ${c.path ?? ""}` : ""))
          .join("\n")
      : "";
  const errorText = state.status === "error" ? state.error?.message ?? "" : "";

  return (
    <div>
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-2 py-1 text-left">
        <Chevron open={open} />
        <StatusDot status={state.status} />
        <span className="font-mono text-[12.5px] text-fg">{part.name}</span>
        {part.executed === false && <span className="text-[11px] text-faint">· {t("tool.proposed")}</span>}
        <span className="flex-1" />
        {duration !== undefined && <span className="text-[11px] tabular-nums text-faint">{formatDuration(duration)}</span>}
      </button>
      <Collapsible open={open}>
        <div className="flex flex-col gap-3 pb-3 pl-6 pr-1">
          <div>
            <div className="mb-1 text-[10.5px] font-bold uppercase tracking-wide text-faint">{t("tool.input")}</div>
            <CodeBlock code={inputText} lang="json" plain />
          </div>
          {output && (
            <div>
              <div className="mb-1 text-[10.5px] font-bold uppercase tracking-wide text-faint">{t("tool.output")}</div>
              <CodeBlock code={output} lang="text" plain />
            </div>
          )}
          {errorText && (
            <div>
              <div className="mb-1 text-[10.5px] font-bold uppercase tracking-wide text-danger">{t("tool.errorLabel")}</div>
              <pre className="whitespace-pre-wrap break-words font-mono text-[12px] text-danger">{errorText}</pre>
            </div>
          )}
        </div>
      </Collapsible>
    </div>
  );
}

export function ToolGroup({ tools }: { tools: ToolPart[] }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const running = tools.some((p) => p.state.status === "streaming" || p.state.status === "running");
  const label = tools.length === 1 ? t("conv.tools", { count: 1 }) : t("conv.tools.plural", { count: tools.length });

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1.5 py-1 text-left text-[12.5px] font-medium text-muted"
      >
        <Chevron open={open} />
        <span className={cn(running && !open && "oc-shimmer")}>{label}</span>
        {running && !open && <Dots />}
      </button>
      <Collapsible open={open}>
        <div className="ml-[6px] flex flex-col border-l border-border pb-1 pl-3">
          {tools.map((part) => (
            <ToolRow key={part.id} part={part} />
          ))}
        </div>
      </Collapsible>
    </div>
  );
}

// --- Shell -------------------------------------------------------------------

export function ShellRow({ message }: { message: ShellMessage }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const running = message.status === "running";
  const output = message.output?.output ?? "";
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1.5 py-1 text-left text-[12.5px] font-medium text-muted"
      >
        <Chevron open={open} />
        <span className={cn(running && !open && "oc-shimmer")}>{t("conv.execution")}</span>
        {running && !open && <Dots />}
        <span className="ml-2 flex-1 truncate font-mono text-[11.5px] text-faint">{message.command}</span>
        {message.exit !== undefined && !running && (
          <span className={cn("text-[11px] tabular-nums", Number(message.exit) === 0 ? "text-faint" : "text-danger")}>
            exit {String(message.exit)}
          </span>
        )}
      </button>
      <Collapsible open={open}>
        <div className="flex flex-col gap-2 pb-3 pl-5 pr-1">
          <CodeBlock code={`$ ${message.command}`} lang="shellscript" plain />
          {output && <CodeBlock code={output} lang="text" plain />}
          {message.output?.truncated && <div className="text-[11px] text-faint">… ({t("tool.output")} tronquée)</div>}
        </div>
      </Collapsible>
    </div>
  );
}

// --- Text + grouping ---------------------------------------------------------

function TextBlock({ part, streaming }: { part: TextPartType; streaming: boolean }) {
  if (!part.text) {
    return streaming ? <span className="oc-typing text-muted" /> : null;
  }
  return (
    <div className={cn(streaming && "oc-typing")}>
      <Markdown>{part.text}</Markdown>
    </div>
  );
}

export function AssistantParts({ parts, running }: { parts: AssistantPart[]; running: boolean }) {
  const nodes: ReactNode[] = [];
  let buffer: ToolPart[] = [];
  let lastIndex = -1;
  parts.forEach((p, i) => {
    if (p) lastIndex = i;
  });

  const flush = () => {
    if (buffer.length) {
      nodes.push(<ToolGroup key={`g${nodes.length}`} tools={buffer} />);
      buffer = [];
    }
  };

  parts.forEach((part, i) => {
    if (!part) return;
    if (part.type === "tool") {
      buffer.push(part);
      return;
    }
    flush();
    if (part.type === "text") nodes.push(<TextBlock key={i} part={part} streaming={running && i === lastIndex} />);
    else if (part.type === "reasoning") nodes.push(<ReasoningRow key={i} part={part} running={running && i === lastIndex} />);
  });
  flush();

  return <div className="flex flex-col gap-1.5">{nodes}</div>;
}
