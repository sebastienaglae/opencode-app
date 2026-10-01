import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { IonIcon, IonSpinner } from "@ionic/react";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { arrowBackOutline, arrowDownOutline, ellipsisHorizontal, stopCircleOutline } from "ionicons/icons";
import { api } from "../core/api/opencode";
import { useSessions } from "../core/store/sessions";
import { useConnection } from "../core/store/connection";
import { useT } from "../core/i18n";
import { cn } from "../core/cn";
import { formatCost, formatDateTime, formatUsage } from "../core/format";
import { modelLabel } from "../core/models";
import type { ModelRef, PromptFileInput, SessionInfo } from "../core/types";
import { MessageView } from "../components/MessageView";
import { Composer } from "../components/Composer";
import { QuestionBanner } from "../components/QuestionBanner";
import { ContextRing } from "../components/ContextRing";
import { ModelPicker } from "../components/ModelPicker";
import { StatsBlock } from "../components/StatsBlock";
import { DiffView } from "../components/DiffView";
import { Sheet, ActionSheet } from "../components/Sheet";

export default function ConversationScreen() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const t = useT();
  const status = useConnection((s) => s.status);
  const scrollRef = useRef<HTMLDivElement>(null);
  const initialScrolled = useRef(false);
  const anchorRef = useRef<number | null>(null);

  const conv = useSessions((s) => (id ? s.conversations[id] : undefined));
  const session = useSessions((s) => (id ? s.list.find((x) => x.id === id) : undefined));

  const [pinned, setPinned] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [contextOpen, setContextOpen] = useState(false);
  const [diffOpen, setDiffOpen] = useState(false);
  const [modelOpen, setModelOpen] = useState(false);

  const { data: models = [] } = useQuery({
    queryKey: ["models"],
    queryFn: api.listModels,
    enabled: status === "connected",
    staleTime: 5 * 60_000,
  });
  const { data: commands = [] } = useQuery({
    queryKey: ["commands"],
    queryFn: api.listCommands,
    enabled: status === "connected",
    staleTime: 5 * 60_000,
  });
  const { data: diff, isLoading: diffLoading } = useQuery({
    queryKey: ["diff", id],
    queryFn: () => api.sessionDiff(id!),
    enabled: diffOpen && status === "connected",
  });

  useEffect(() => {
    if (!id) return;
    initialScrolled.current = false;
    useSessions.getState().ensureConversation(id);
    void useSessions.getState().loadMessages(id);
    if (useSessions.getState().list.length === 0) void useSessions.getState().loadSessions();
    return () => useSessions.getState().abortLoad(id);
  }, [id]);

  // Keep pinned to the bottom without a visible jump.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || !conv?.loaded) return;
    if (!initialScrolled.current) {
      el.scrollTop = el.scrollHeight;
      initialScrolled.current = true;
      setPinned(true);
      return;
    }
    if (pinned) el.scrollTop = el.scrollHeight;
  }, [conv, pinned]);

  // Preserve scroll position when older messages are prepended.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || anchorRef.current === null) return;
    el.scrollTop = el.scrollHeight - anchorRef.current;
    anchorRef.current = null;
  }, [conv?.messages.length]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < 140;
    setPinned(near);
    if (el.scrollTop < 80 && conv?.hasMore && !conv.loadingOlder) {
      anchorRef.current = el.scrollHeight - el.scrollTop;
      void useSessions.getState().loadOlder(id!);
    }
  };

  const messages = conv?.messages ?? [];

  const stats = useMemo(() => {
    let tools = 0;
    for (const m of messages) {
      if (m.type !== "assistant") continue;
      for (const p of m.content) if (p.type === "tool") tools += 1;
    }
    const first = messages[0]?.time?.created;
    const last = messages[messages.length - 1]?.time?.created;
    const durationMs = first && last ? last - first : undefined;
    const count = messages.filter((m) => m.type === "user" || m.type === "assistant").length;
    return { tools, durationMs, count };
  }, [messages]);

  const contextLimit = useMemo(() => {
    if (!session?.model) return 0;
    const info = models.find((m) => m.modelID === session.model!.id && m.providerID === session.model!.providerID);
    return info?.limit.context ?? 0;
  }, [models, session?.model]);

  const tokens = conv?.tokens ?? session?.tokens;
  const lastAssistantTokens = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.type === "assistant" && m.tokens) return m.tokens;
    }
    return undefined;
  }, [messages]);
  const contextUsed = lastAssistantTokens
    ? lastAssistantTokens.input + lastAssistantTokens.cache.read + lastAssistantTokens.cache.write
    : 0;
  const cost = conv?.cost ?? session?.cost ?? 0;

  const modelForUserMessage = (index: number): ModelRef | undefined => {
    for (let j = index + 1; j < messages.length; j++) {
      const m = messages[j];
      if (m.type === "assistant") return m.model ?? session?.model;
      if (m.type === "user") break;
    }
    return session?.model;
  };

  const handleSend = async (text: string, files: PromptFileInput[]) => {
    const trimmed = text.trim();
    if (!id) return;
    if (trimmed === "/compact") {
      await api.compact(id);
      return;
    }
    const match = /^\/([\w-]+)\s*([\s\S]*)$/.exec(trimmed);
    if (match && commands.some((c) => c.name === match[1])) {
      await api.runCommand(id, { name: match[1], text: match[2] });
      return;
    }
    await useSessions.getState().sendPrompt(id, text, files, session?.agent);
  };

  if (!id) return null;

  return (
    <div className="flex h-full flex-col bg-bg">
      <header className="flex items-center gap-1 border-b border-border px-2 pb-2 pt-[calc(8px+env(safe-area-inset-top))]">
        <button type="button" onClick={() => navigate("/sessions")} className="p-2 text-muted active:text-fg" aria-label={t("common.back")}>
          <IonIcon icon={arrowBackOutline} className="text-[20px]" />
        </button>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[15px] font-semibold text-fg">{session?.title || t("app.name")}</div>
        </div>
        {conv?.running && (
          <button type="button" onClick={() => void useSessions.getState().interrupt(id)} className="p-2 text-danger" aria-label={t("conv.stop")}>
            <IonIcon icon={stopCircleOutline} className="text-[20px]" />
          </button>
        )}
        <ContextRing used={contextUsed} limit={contextLimit} onClick={() => setContextOpen(true)} />
        <button type="button" onClick={() => setMenuOpen(true)} className="p-2 text-muted active:text-fg" aria-label="menu">
          <IonIcon icon={ellipsisHorizontal} className="text-[20px]" />
        </button>
      </header>

      <div className="relative min-h-0 flex-1">
        <div ref={scrollRef} onScroll={onScroll} className="oc-scroll h-full overflow-y-auto px-3.5 pb-4">
          {conv?.loading && messages.length === 0 ? (
            <div className="flex justify-center p-10">
              <IonSpinner name="crescent" />
            </div>
          ) : messages.length === 0 ? (
            <div className="p-10 text-center text-[13px] text-muted">{t("conv.empty")}</div>
          ) : (
            <>
              {conv?.hasMore && (
                <div className="flex justify-center py-2">
                  {conv.loadingOlder ? <IonSpinner name="crescent" /> : <span className="text-[11px] text-faint">{t("conv.loadOlder")}</span>}
                </div>
              )}
              <div className="flex flex-col">
                {messages.map((message, i) => (
                  <MessageView
                    key={message.id}
                    message={message}
                    parts={message.type === "assistant" ? conv?.parts[message.id] : undefined}
                    running={Boolean(conv?.running)}
                    modelLabel={message.type === "user" ? modelLabel(modelForUserMessage(i), models) : undefined}
                    onOpenModel={message.type === "user" ? () => setModelOpen(true) : undefined}
                  />
                ))}
              </div>
              {!conv?.running && messages.length > 0 && (
                <StatsBlock
                  messages={stats.count}
                  tools={stats.tools}
                  tokens={tokens ?? { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } }}
                  cost={cost}
                  durationMs={stats.durationMs}
                />
              )}
              <QuestionBanner
                forms={conv?.forms ?? []}
                permissions={conv?.permissions ?? []}
                onReplyForm={(formID, answers) => void useSessions.getState().replyForm(id, formID, answers)}
                onCancelForm={(formID) => void api.cancelForm(id, formID).then(() => useSessions.getState().loadMessages(id))}
                onReplyPermission={(requestID, decision) => void useSessions.getState().replyPermission(id, requestID, decision)}
              />
            </>
          )}
        </div>

        <AnimatePresence>
          {!pinned && messages.length > 0 && (
            <motion.button
              type="button"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              onClick={() => {
                setPinned(true);
                scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
              }}
              className="absolute bottom-4 right-4 flex h-10 w-10 items-center justify-center rounded-full border border-border bg-elevated text-fg shadow-lg"
              aria-label={t("conv.scrollBottom")}
            >
              <IonIcon icon={arrowDownOutline} className="text-[20px]" />
            </motion.button>
          )}
        </AnimatePresence>
      </div>

      <Composer running={Boolean(conv?.running)} onSend={handleSend} onStop={() => void useSessions.getState().interrupt(id)} />

      <ActionSheet
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        actions={[
          {
            label: t("common.rename"),
            onClick: () => {
              const title = window.prompt(t("sessions.rename.prompt"), session?.title ?? "");
              if (title != null && title.trim()) void useSessions.getState().renameSession(id, title.trim());
            },
          },
          { label: t("conv.menu.compact"), onClick: () => void api.compact(id) },
          { label: t("conv.menu.diff"), onClick: () => setDiffOpen(true) },
          { label: t("conv.menu.fork"), onClick: () => void api.forkSession(id).then((s) => s && useSessions.getState().upsertSession(s)) },
          {
            label: t("conv.menu.delete"),
            destructive: true,
            onClick: () => {
              if (window.confirm(t("sessions.delete.confirm", { title: session?.title || "—" }))) {
                void useSessions.getState().removeSession(id).then(() => navigate("/sessions"));
              }
            },
          },
        ]}
      />

      <ModelPicker
        open={modelOpen}
        onClose={() => setModelOpen(false)}
        models={models}
        current={session?.model}
        onSelect={(model) => void useSessions.getState().setSessionModel(id, model)}
      />

      <Sheet open={contextOpen} onClose={() => setContextOpen(false)} title={t("conv.context.title")}>
        <ContextDetails
          session={session}
          messagesCount={stats.count}
          tokens={tokens}
          cost={cost}
          contextUsed={contextUsed}
          contextLimit={contextLimit}
        />
      </Sheet>

      <Sheet open={diffOpen} onClose={() => setDiffOpen(false)} title={t("conv.diff.title")}>
        {diffLoading ? (
          <div className="flex justify-center p-8">
            <IonSpinner name="crescent" />
          </div>
        ) : !diff || diff.length === 0 ? (
          <div className="p-8 text-center text-[13px] text-muted">{t("conv.diff.empty")}</div>
        ) : (
          <div className="flex flex-col gap-3 p-3">
            {diff.map((f) => (
              <div key={f.file} className="overflow-hidden rounded-xl border border-border">
                <div className="flex items-center gap-2 border-b border-border px-3 py-2">
                  <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-fg">{f.file}</span>
                  <span className="text-[11px] text-success">+{f.additions}</span>
                  <span className="text-[11px] text-danger">-{f.deletions}</span>
                </div>
                <DiffView patch={f.patch} />
              </div>
            ))}
          </div>
        )}
      </Sheet>
    </div>
  );
}

function ContextDetails({
  session,
  messagesCount,
  tokens,
  cost,
  contextUsed,
  contextLimit,
}: {
  session?: SessionInfo;
  messagesCount: number;
  tokens?: { input: number; output: number; reasoning: number; cache: { read: number; write: number } };
  cost: number;
  contextUsed: number;
  contextLimit: number;
}) {
  const t = useT();
  const pct = contextLimit > 0 ? Math.min((contextUsed / contextLimit) * 100, 100) : 0;
  const rows: Array<[string, string]> = [
    [t("conv.context.id"), session?.id ?? "—"],
    [t("conv.context.directory"), session?.location?.directory ?? "—"],
    [t("conv.context.provider"), session?.model?.providerID ?? "—"],
    [t("conv.context.model"), session?.model?.id ?? "—"],
    [t("conv.context.effort"), session?.model?.variant ?? "—"],
    [t("conv.context.agent"), session?.agent ?? "—"],
    [t("conv.context.messages"), String(messagesCount)],
    [t("conv.context.tokens"), tokens ? formatUsage(tokens) : "—"],
    [t("conv.context.cost"), formatCost(cost)],
    [t("conv.context.created"), formatDateTime(session?.time?.created)],
    [t("conv.context.updated"), formatDateTime(session?.time?.updated)],
  ];
  return (
    <div className="flex flex-col gap-3 p-4">
      <div>
        <div className="mb-1.5 flex items-baseline justify-between text-[12px]">
          <span className="font-semibold text-muted">{t("conv.context.usage")}</span>
          <span className="tabular-nums text-faint">
            {contextLimit > 0 ? `${Math.round(pct)}%` : "—"} · {contextUsed.toLocaleString()}
            {contextLimit > 0 ? ` / ${contextLimit.toLocaleString()}` : ""}
          </span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-surface2">
          <div
            className={cn("h-full rounded-full", pct > 85 ? "bg-danger" : pct > 60 ? "bg-warn" : "bg-accent")}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
      <div className="divide-y divide-border">
        {rows.map(([label, value]) => (
          <div key={label} className="flex flex-col gap-0.5 py-2">
            <span className="text-[10.5px] font-bold uppercase tracking-wide text-faint">{label}</span>
            <span className="break-words font-mono text-[12.5px] text-fg">{value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
