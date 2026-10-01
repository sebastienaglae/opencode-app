import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { IonIcon } from "@ionic/react";
import { chevronForwardOutline } from "ionicons/icons";
import type { AssistantPart, ReasoningPart, ShellMessage, TextPart as TextPartType, ToolPart } from "../core/types";
import { cn } from "../core/cn";
import { useT } from "../core/i18n";
import { formatDuration } from "../core/format";
import { toolFields, toolLabelKey, toolResultText, toolSummary } from "../core/tools";
import { Markdown } from "./Markdown";
import { CodeBlock } from "./CodeBlock";
import { DiffView } from "./DiffView";

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
      className={cn("shrink-0 text-[13px] text-faint transition-transform duration-200", open && "rotate-90")}
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

function useNow(running: boolean) {
  const [now, setNow] = useState(0);
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [running]);
  return now;
}

function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} et ${names[names.length - 1]}`;
}

// --- Reasoning ---------------------------------------------------------------

export function ReasoningRow({ part, running, nested }: { part: ReasoningPart; running: boolean; nested?: boolean }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const now = useNow(running);
  const start = part.time?.created;
  const end = part.time?.completed ?? (running ? now || undefined : undefined);
  const duration = start && end ? end - start : undefined;

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 py-1.5 text-left text-[14px] text-accent"
      >
        <Chevron open={open} />
        <span className={cn("font-medium", running && !open && "oc-shimmer")}>{t("conv.reasoning")}</span>
        {running && !open && <Dots />}
        <span className="flex-1" />
        {duration !== undefined && <span className="text-[12px] tabular-nums text-faint">{formatDuration(duration)}</span>}
      </button>
      <Collapsible open={open}>
        <div className={cn("oc-md pb-2 pr-1", nested && "pl-6")}>
          {part.text ? <Markdown>{part.text}</Markdown> : <span className="text-[13px] text-muted">…</span>}
        </div>
      </Collapsible>
    </div>
  );
}

// --- Tools -------------------------------------------------------------------

function ToolRow({ part }: { part: ToolPart }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const state = part.state;
  const isRunning = state.status === "streaming" || state.status === "running";
  const now = useNow(isRunning);
  const end = part.time.completed ?? (now || undefined);
  const duration = part.time.ran !== undefined && end !== undefined ? end - part.time.ran : undefined;
  const summary = toolSummary(part);
  const output = toolResultText(part);
  const errorText = state.status === "error" ? state.error?.message ?? "" : "";
  const fields = toolFields(part);
  const statusColor =
    state.status === "completed" ? "bg-success" : state.status === "error" ? "bg-danger" : "bg-accent oc-pulse";

  return (
    <div>
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-2 py-1.5 text-left text-[14px]">
        <Chevron open={open} />
        <span className="shrink-0 font-medium text-accent">{t(toolLabelKey(part.name))}</span>
        {summary && <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-muted">{summary}</span>}
        {!summary && <span className="flex-1" />}
        <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", statusColor)} />
        {duration !== undefined && <span className="text-[12px] tabular-nums text-faint">{formatDuration(duration)}</span>}
      </button>
      <Collapsible open={open}>
        <div className="flex flex-col gap-3 pb-3 pl-6 pr-1 pt-1">
          {fields.map((f, i) => (
            <div key={i}>
              <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-faint">
                {f.labelKey.startsWith("#") ? f.labelKey.slice(1) : t(f.labelKey)}
              </div>
              {f.kind === "diff" ? (
                <div className="overflow-hidden rounded-lg border border-border">
                  <DiffView patch={f.value} />
                </div>
              ) : f.lang && f.lang !== "text" ? (
                <CodeBlock code={f.value} lang={f.lang} />
              ) : (
                <CodeBlock code={f.value} lang="text" plain />
              )}
            </div>
          ))}
          {output && (
            <div>
              <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-faint">{t("tool.output")}</div>
              <CodeBlock code={output} lang="text" plain />
            </div>
          )}
          {errorText && (
            <div>
              <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-danger">{t("tool.errorLabel")}</div>
              <pre className="whitespace-pre-wrap break-words font-mono text-[12px] text-danger">{errorText}</pre>
            </div>
          )}
          {fields.length === 0 && !output && !errorText && state.status !== "streaming" && (
            <div className="text-[12px] text-faint">—</div>
          )}
        </div>
      </Collapsible>
    </div>
  );
}

// --- Grouped activity (reasoning + tools together) ---------------------------

type ActivityItem = { kind: "tool"; part: ToolPart } | { kind: "reasoning"; part: ReasoningPart };

export function ActivityGroup({ items }: { items: ActivityItem[] }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const tools = items.filter((i): i is { kind: "tool"; part: ToolPart } => i.kind === "tool");
  const reasonings = items.filter((i): i is { kind: "reasoning"; part: ReasoningPart } => i.kind === "reasoning");
  const running = tools.some((x) => x.part.state.status === "streaming" || x.part.state.status === "running");

  let label: string;
  if (tools.length > 0) {
    const names = [...new Set(tools.map((x) => t(toolLabelKey(x.part.name))))];
    label =
      tools.length === 1
        ? t("conv.activity.one", { names: names[0] })
        : t("conv.activity.many", { count: tools.length, names: joinNames(names) });
  } else {
    label = reasonings.length === 1 ? t("conv.reasoning.one") : t("conv.reasoning.many", { count: reasonings.length });
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 py-1.5 text-left text-[14px]"
      >
        <Chevron open={open} />
        <span className={cn("font-medium text-accent", running && !open && "oc-shimmer")}>{label}</span>
        {running && !open && <Dots />}
      </button>
      <Collapsible open={open}>
        <div className="ml-[6px] flex flex-col border-l border-border pb-1 pl-3">
          {items.map((item, i) =>
            item.kind === "tool" ? (
              <ToolRow key={`t${i}`} part={item.part} />
            ) : (
              <ReasoningRow key={`r${i}`} part={item.part} running={false} nested />
            ),
          )}
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
  const now = useNow(running);
  const duration = running ? now - message.time.created : message.time.completed ? message.time.completed - message.time.created : undefined;
  const output = message.output?.output ?? "";
  return (
    <div>
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-2 py-1.5 text-left text-[14px]">
        <Chevron open={open} />
        <span className={cn("shrink-0 font-medium text-accent", running && !open && "oc-shimmer")}>{t("conv.execution")}</span>
        <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-muted">{message.command}</span>
        {message.exit !== undefined && !running && (
          <span className={cn("text-[12px] tabular-nums", Number(message.exit) === 0 ? "text-faint" : "text-danger")}>
            exit {String(message.exit)}
          </span>
        )}
        {duration !== undefined && <span className="text-[12px] tabular-nums text-faint">{formatDuration(duration)}</span>}
      </button>
      <Collapsible open={open}>
        <div className="flex flex-col gap-2 pb-3 pl-6 pr-1 pt-1">
          <CodeBlock code={`$ ${message.command}`} lang="shellscript" plain />
          {output && <CodeBlock code={output} lang="text" plain />}
          {message.output?.truncated && <div className="text-[11px] text-faint">… (tronqué)</div>}
        </div>
      </Collapsible>
    </div>
  );
}

// --- Text + grouping ---------------------------------------------------------

function TextBlock({ part, streaming }: { part: TextPartType; streaming: boolean }) {
  if (!part.text) return streaming ? <span className="oc-typing text-muted" /> : null;
  return (
    <div className={cn(streaming && "oc-typing")}>
      <Markdown>{part.text}</Markdown>
    </div>
  );
}

export function AssistantParts({ parts, running }: { parts: AssistantPart[]; running: boolean }) {
  const nodes: ReactNode[] = [];
  let buffer: ActivityItem[] = [];
  let lastIndex = -1;
  parts.forEach((p, i) => {
    if (p) lastIndex = i;
  });

  const flush = () => {
    if (buffer.length) {
      nodes.push(<ActivityGroup key={`g${nodes.length}`} items={buffer} />);
      buffer = [];
    }
  };

  parts.forEach((part, i) => {
    if (!part) return;
    if (part.type === "tool") {
      buffer.push({ kind: "tool", part });
      return;
    }
    if (part.type === "reasoning") {
      buffer.push({ kind: "reasoning", part });
      return;
    }
    flush();
    if (part.type === "text") nodes.push(<TextBlock key={i} part={part} streaming={running && i === lastIndex} />);
  });
  flush();

  return <div className="flex flex-col gap-1.5">{nodes}</div>;
}
