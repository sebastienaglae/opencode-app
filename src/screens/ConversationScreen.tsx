import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { IonIcon, IonSpinner } from "@ionic/react";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import {
  arrowBackOutline,
  arrowDownOutline,
  chevronForwardOutline,
  closeCircle,
  ellipsisHorizontal,
  flagOutline,
  layersOutline,
  peopleOutline,
  stopCircleOutline,
} from "ionicons/icons";
import { api, ApiError } from "../core/api/opencode";
import { BUILTIN_COMMANDS } from "../core/builtinCommands";
import { Capacitor } from "@capacitor/core";
import { Share } from "@capacitor/share";
import { setProjectDir } from "../core/navigation";
import { copyText } from "../core/clipboard";
import { useSessions } from "../core/store/sessions";
import { useConnection } from "../core/store/connection";
import { useSettings } from "../core/store/settings";
import { useT } from "../core/i18n";
import { cn } from "../core/cn";
import { formatCost, formatDateTime, formatRelative, formatUsage } from "../core/format";
import { modelLabel } from "../core/models";
import { toast } from "../core/store/toast";
import { emptyTokens } from "../core/types";import type { ModelRef, PromptFileInput, SessionInfo } from "../core/types";
import { MessageView } from "../components/MessageView";
import { Composer } from "../components/Composer";
import { QuestionBanner } from "../components/QuestionBanner";
import { ContextRing } from "../components/ContextRing";
import { ModelPicker } from "../components/ModelPicker";
import { StatsBlock } from "../components/StatsBlock";
import { DiffView } from "../components/DiffView";
import { CodeBlock } from "../components/CodeBlock";
import { Sheet, ActionSheet } from "../components/Sheet";
import { AppHeader } from "../components/AppHeader";

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
  const [agentOpen, setAgentOpen] = useState(false);
  const [diffLimit, setDiffLimit] = useState(20);
  const [shellResult, setShellResult] = useState<{ command: string; output: string; status: string; exit?: number | string } | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [subagentsOpen, setSubagentsOpen] = useState(false);
  const [goalOpen, setGoalOpen] = useState(false);
  const [goalDraft, setGoalDraft] = useState("");
  const [goalUnsupported, setGoalUnsupported] = useState(false);

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
  const { data: agents = [] } = useQuery({
    queryKey: ["agents"],
    queryFn: api.listAgents,
    enabled: status === "connected",
    staleTime: 5 * 60_000,
  });
  const { data: activeMap = {} } = useQuery({
    queryKey: ["active-sessions"],
    queryFn: () => api.activeSessions(),
    enabled: status === "connected",
    refetchInterval: 6000,
  });
  const sessionList = useSessions((s) => s.list);
  const lastModel = useSettings((s) => s.lastModel);
  const defaultModel = lastModel ?? sessionList.find((s) => s.model)?.model;
  const runningAgents = useMemo(
    () => sessionList.filter((s) => s.parentID === id && activeMap[s.id]),
    [sessionList, id, activeMap],
  );
  const childSessions = useMemo(
    () =>
      sessionList
        .filter((s) => s.parentID === id)
        .sort((a, b) => b.time.updated - a.time.updated),
    [sessionList, id],
  );

  useEffect(() => {
    if (!id || !session) return;
    if (!session.model && defaultModel) void useSessions.getState().setSessionModel(id, defaultModel);
  }, [id, session, defaultModel]);
  const { data: diff, isLoading: diffLoading } = useQuery({
    queryKey: ["diff", id],
    queryFn: () => api.sessionDiff(id!),
    enabled: diffOpen && status === "connected",
  });

  // Session goal (/goal, OpenCode 2.2+). Read through the goal plugin's RPC;
  // older servers answer 404 and the goal UI stays hidden.
  const { data: goal = null, refetch: refetchGoal } = useQuery({
    queryKey: ["goal", id],
    queryFn: async () => {
      try {
        const res = await api.goal(id!);
        return res?.output ?? null;
      } catch (err) {
        if (err instanceof ApiError && [400, 404, 405, 501].includes(err.status)) setGoalUnsupported(true);
        return null;
      }
    },
    enabled: status === "connected" && Boolean(id) && !goalUnsupported,
    retry: false,
    refetchInterval: (query) => (query.state.data?.status === "active" ? 5000 : 20_000),
  });

  useEffect(() => {
    if (!id) return;
    initialScrolled.current = false;
    useSessions.getState().ensureConversation(id);
    void useSessions.getState().loadMessages(id);
    void useSessions.getState().refreshInbox(id);
    if (useSessions.getState().list.length === 0) void useSessions.getState().loadSessions();
    return () => useSessions.getState().abortLoad(id);
  }, [id]);

  // Stacked prompts are drained by the server as steps finish: keep the queue fresh.
  useEffect(() => {
    if (!id || !conv?.running) return;
    const timer = setInterval(() => void useSessions.getState().refreshInbox(id), 4000);
    return () => clearInterval(timer);
  }, [id, conv?.running]);

  useEffect(() => {
    setProjectDir(session?.location?.directory);
  }, [session?.location?.directory]);

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

  const lastAssistantTokens = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.type === "assistant" && m.tokens) return m.tokens;
    }
    return undefined;
  }, [messages]);

  const tokens = useMemo(() => {
    const base = conv?.tokens ?? session?.tokens;
    if (base && (base.input || base.output || base.reasoning)) return base;
    const sum = emptyTokens();
    for (const m of messages) {
      if (m.type === "assistant" && m.tokens) {
        sum.input += m.tokens.input;
        sum.output += m.tokens.output;
        sum.reasoning += m.tokens.reasoning;
        sum.cache.read += m.tokens.cache.read;
        sum.cache.write += m.tokens.cache.write;
      }
    }
    return sum;
  }, [conv?.tokens, session?.tokens, messages]);

  const contextUsed = lastAssistantTokens
    ? lastAssistantTokens.input + lastAssistantTokens.cache.read + lastAssistantTokens.cache.write
    : tokens.input + tokens.cache.read;
  const cost = conv?.cost ?? session?.cost ?? 0;

  const userModelLabels = useMemo(() => {
    const map = new Map<string, string>();
    let current: ModelRef | undefined = session?.model;
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.type === "assistant" && m.model) current = m.model;
      else if (m.type === "user") map.set(m.id, modelLabel(current, models));
    }
    return map;
  }, [messages, models, session?.model]);

  const openModel = useCallback(() => setModelOpen(true), []);

  const runShell = useCallback(
    async (command: string) => {
      if (!id) return;
      setShellResult({ command, output: "", status: "running" });
      try {
        const created = await api.runShellGlobal({ command, cwd: session?.location?.directory });
        if (!created) throw new Error("shell not created");
        for (let i = 0; i < 900; i++) {
          await new Promise((r) => setTimeout(r, 700));
          const [info, out] = await Promise.all([
            api.shellInfo(created.id).catch(() => undefined),
            api.shellOutput(created.id).catch(() => undefined),
          ]);
          if (out) setShellResult((r) => (r ? { ...r, output: out.output } : r));
          if (info && info.status !== "running") {
            setShellResult((r) => (r ? { ...r, status: info.status, exit: info.exit } : r));
            return;
          }
        }
      } catch (err) {
        setShellResult((r) => (r ? { ...r, status: "error", output: String(err) } : r));
      }
    },
    [id, session?.location?.directory],
  );

  const handleSend = async (text: string, files: PromptFileInput[], delivery?: "queue" | "steer") => {
    const trimmed = text.trim();
    if (!id) return;
    const match = /^\/([\w-]+)\s*([\s\S]*)$/.exec(trimmed);
    const name = match?.[1];
    const rest = match?.[2] ?? "";
    const isServerCommand = commands.some((c) => c.name === name) || BUILTIN_COMMANDS.some((b) => b.name === name && b.server);

    if (name) {
      switch (name) {
        case "compact":
          await api.compact(id);
          return;
        case "new": {
          const s = await useSessions.getState().createSession({});
          if (s) navigate(`/session/${s.id}`);
          return;
        }
        case "fork": {
          const s = await api.forkSession(id);
          if (s) {
            useSessions.getState().upsertSession(s);
            navigate(`/session/${s.id}`);
          }
          return;
        }
        case "undo": {
          const lastUser = [...messages].reverse().find((m) => m.type === "user");
          if (lastUser) {
            await api.revertStage(id, lastUser.id);
            await api.revertCommit(id);
            await useSessions.getState().loadMessages(id);
          }
          return;
        }
        case "model":
          setModelOpen(true);
          return;
        case "agents":
          setAgentOpen(true);
          return;
        case "mcp":
          navigate("/commands?tab=mcp");
          return;
        case "skills":
          navigate("/commands?tab=skills");
          return;
        case "terminal":
        case "pty":
        case "shell": {
          const dir = session?.location?.directory ?? "";
          navigate(`/console${dir ? `?cwd=${encodeURIComponent(dir)}` : ""}`);
          return;
        }
        case "open":
          navigate("/files");
          return;
        case "connect":
          navigate("/models");
          return;
        case "export": {
          try {
            const data = await api.exportSession(id);
            const text = JSON.stringify(data, null, 2);
            if (Capacitor.isNativePlatform()) await Share.share({ title: "OpenCode session", text });
            else {
              const ok = await copyText(text);
              toast[ok ? "success" : "error"](ok ? t("toast.copied") : t("toast.copyFailed"));
            }
          } catch (err) {
            toast.error(t("toast.error", { message: err instanceof Error ? err.message : String(err) }));
          }
          return;
        }
        case "help":
          setHelpOpen(true);
          return;
        case "share":
          toast.show(`/${name} : ${t("commands.notAvailable")}`);
          return;
        default:
          break;
      }
      if (isServerCommand) {
        await api.runCommand(id, { name: name!, text: rest });
        return;
      }
    }
    await useSessions.getState().sendPrompt(id, text, files, session?.agent, delivery);
  };

  // `/goal <objective>` is a server-side command (OpenCode 2.2+). It runs through
  // the same command endpoint as the TUI/Desktop, so pause/resume/clear work too.
  const runGoal = async (text: string, successKey: string) => {
    if (!id) return;
    try {
      await api.runCommand(id, { name: "goal", text });
      toast.success(t(successKey));
      setTimeout(() => void refetchGoal(), 700);
    } catch (err) {
      if (err instanceof ApiError && [400, 404, 405].includes(err.status)) setGoalUnsupported(true);
      toast.error(t("toast.error", { message: err instanceof Error ? err.message : String(err) }));
    }
  };

  if (!id) return null;

  return (
    <div className="flex h-full flex-col bg-bg">
      <AppHeader
        left={
          <button type="button" onClick={() => navigate(-1)} className="p-1.5 text-muted active:text-fg" aria-label={t("common.back")}>
            <IonIcon icon={arrowBackOutline} className="text-[20px]" />
          </button>
        }
        subtitle={
          runningAgents.length > 0
            ? `${session?.title || t("app.name")} · ${t("conv.agents.running", { count: runningAgents.length })}`
            : session?.title || t("conv.empty").split(".")[0]
        }
        right={
          <>
            {conv?.running && (
              <button type="button" onClick={() => void useSessions.getState().interrupt(id)} className="p-1.5 text-danger" aria-label={t("conv.stop")}>
                <IonIcon icon={stopCircleOutline} className="text-[20px]" />
              </button>
            )}
            {childSessions.length > 0 && (
              <button
                type="button"
                onClick={() => setSubagentsOpen(true)}
                className="relative p-1.5 text-muted active:text-fg"
                aria-label={t("conv.subagents")}
              >
                <IonIcon icon={peopleOutline} className="text-[20px]" />
                <span className="absolute -right-0.5 -top-0.5 rounded-full bg-accent px-1 text-[10px] font-bold text-white">
                  {childSessions.length}
                </span>
              </button>
            )}
            <ContextRing used={contextUsed} limit={contextLimit} onClick={() => setContextOpen(true)} />
            <button type="button" onClick={() => setMenuOpen(true)} className="p-1.5 text-muted active:text-fg" aria-label="menu">
              <IonIcon icon={ellipsisHorizontal} className="text-[20px]" />
            </button>
          </>
        }
      />

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
                {messages.map((message) => (
                  <MessageView
                    key={message.id}
                    message={message}
                    parts={message.type === "assistant" ? conv?.parts[message.id] : undefined}
                    running={Boolean(conv?.running)}
                    modelLabel={message.type === "user" ? userModelLabels.get(message.id) : undefined}
                    onOpenModel={message.type === "user" ? openModel : undefined}
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

      {(goal || (conv?.inbox.length ?? 0) > 0) && (
        <div className="flex flex-col gap-1.5 border-t border-border bg-bg px-3 pt-2">
          {goal && (
            <button
              type="button"
              onClick={() => setGoalOpen(true)}
              className={cn(
                "flex items-center gap-2 rounded-xl border px-2.5 py-1.5 text-left",
                goal.status === "paused"
                  ? "border-warning/40 bg-warning/10"
                  : goal.status === "complete"
                    ? "border-success/40 bg-success/10"
                    : "border-border bg-surface2",
              )}
            >
              <IonIcon
                icon={flagOutline}
                className={cn(
                  "shrink-0 text-[15px]",
                  goal.status === "paused" ? "text-warning" : goal.status === "complete" ? "text-success" : "text-accent",
                )}
              />
              <span className="shrink-0 text-[12px] font-semibold text-fg">{t(`goal.pill.${goal.status}`)}</span>
              <span className="min-w-0 flex-1 truncate text-[12px] text-muted">{goal.objective}</span>
              {goal.status === "active" && (
                <span className="shrink-0 font-mono text-[10.5px] text-faint">
                  {goal.rounds}/{goal.maxRounds}
                </span>
              )}
            </button>
          )}

          {(conv?.inbox.length ?? 0) > 0 && (
            <div className="rounded-xl border border-border bg-surface2 px-2 py-1.5">
              <div className="flex items-center gap-1.5 pb-1 text-[10.5px] font-semibold uppercase tracking-wide text-faint">
                <IonIcon icon={layersOutline} className="text-[12px]" />
                {t("conv.queue.title", { count: conv?.inbox.length ?? 0 })}
              </div>
              <div className="flex flex-col gap-1">
                {conv?.inbox.map((item) => (
                  <div key={item.id} className="flex items-center gap-1.5 rounded-lg bg-bg px-2 py-1">
                    <span className="min-w-0 flex-1 truncate text-[12.5px] text-fg">
                      {item.payload?.text || item.payload?.description || item.type}
                    </span>
                    {item.type === "user" && item.delivery === "queue" && (
                      <button
                        type="button"
                        onClick={() => void useSessions.getState().setInboxDelivery(id, item.id, "steer")}
                        className="shrink-0 rounded-full border border-border px-1.5 py-0.5 text-[10.5px] text-accent"
                      >
                        {t("conv.queue.steer")}
                      </button>
                    )}
                    {item.delivery === "steer" && (
                      <span className="shrink-0 rounded-full bg-accent/15 px-1.5 py-0.5 text-[10.5px] text-accent">
                        {t("conv.delivery.steer")}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => void useSessions.getState().cancelInbox(id, item.id)}
                      aria-label={t("conv.queue.cancel")}
                      className="shrink-0 text-[15px] text-faint active:text-danger"
                    >
                      <IonIcon icon={closeCircle} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <Composer
        sessionID={id}
        running={Boolean(conv?.running)}
        onSend={handleSend}
        onStop={() => void useSessions.getState().interrupt(id)}
        onShell={runShell}
        modelLabel={modelLabel(session?.model ?? defaultModel, models) || t("model.choose")}
        agentLabel={session?.agent}
        onOpenModel={() => setModelOpen(true)}
        onOpenAgent={() => setAgentOpen(true)}
      />

      <ActionSheet
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        actions={[
          {
            label: t("common.rename"),
            onClick: () => {
              const title = window.prompt(t("sessions.rename.prompt"), session?.title ?? "");
              if (title != null && title.trim())
                void useSessions.getState().renameSession(id, title.trim()).then(() => toast.success(t("toast.renamed")));
            },
          },
          {
            label: t("conv.menu.compact"),
            onClick: () => void api.compact(id).then(() => toast.success(t("toast.compacted"))).catch((e) => toast.error(t("toast.error", { message: String(e?.message ?? e) }))),
          },
          {
            label: t("console.title"),
            onClick: () => {
              const dir = session?.location?.directory ?? "";
              navigate(`/console${dir ? `?cwd=${encodeURIComponent(dir)}` : ""}`);
            },
          },
          {
            label: t("preview.title"),
            onClick: () => navigate("/preview"),
          },
          {
            label: t("conv.menu.diff"),
            onClick: () => {
              setDiffLimit(20);
              setDiffOpen(true);
            },
          },
          {
            label: goal ? t(`goal.pill.${goal.status}`) : t("goal.title"),
            onClick: () => setGoalOpen(true),
          },
          ...(childSessions.length > 0 ? [{ label: `${t("conv.subagents")} (${childSessions.length})`, onClick: () => setSubagentsOpen(true) }] : []),
          {
            label: t("conv.menu.fork"),
            onClick: () => void api.forkSession(id).then((s) => s && useSessions.getState().upsertSession(s)),
          },
          {
            label: t("conv.menu.delete"),
            destructive: true,
            onClick: () => {
              if (window.confirm(t("sessions.delete.confirm", { title: session?.title || "—" }))) {
                void useSessions.getState().removeSession(id).then(() => {
                  toast.success(t("toast.deleted"));
                  navigate("/projects");
                });
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
        onSelect={(model) => {
          void useSessions.getState().setSessionModel(id, model);
          toast.success(t("toast.modelChanged"));
        }}
      />

      <Sheet open={agentOpen} onClose={() => setAgentOpen(false)} title={t("conv.agent")}>
        <div className="flex flex-col p-2">
          {agents
            .filter((a) => !a.hidden && a.mode !== "subagent")
            .map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => {
                  void useSessions.getState().setSessionAgent(id, a.id);
                  toast.success(t("toast.agentChanged"));
                  setAgentOpen(false);
                }}
                className={cn(
                  "rounded-lg px-3 py-3 text-left active:bg-surface2",
                  session?.agent === a.id && "bg-accentsoft",
                )}
              >
                <div className="text-[15px] font-medium text-fg">{a.name}</div>
                {a.description && <div className="mt-0.5 text-[12.5px] text-muted">{a.description}</div>}
              </button>
            ))}
        </div>
      </Sheet>

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
            {diff.slice(0, diffLimit).map((f) => (
              <div key={f.file} className="overflow-hidden rounded-xl border border-border">
                <div className="flex items-center gap-2 border-b border-border px-3 py-2">
                  <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-fg">{f.file}</span>
                  <span className="text-[11px] text-success">+{f.additions}</span>
                  <span className="text-[11px] text-danger">-{f.deletions}</span>
                </div>
                <DiffView patch={f.patch} />
              </div>
            ))}
            {diff.length > diffLimit && (
              <button
                type="button"
                onClick={() => setDiffLimit((l) => l + 20)}
                className="mx-auto rounded-lg border border-border px-4 py-2 text-[13px] font-medium text-accent"
              >
                {t("common.loadMore")} ({diff.length - diffLimit})
              </button>
            )}
          </div>
        )}
      </Sheet>

      <Sheet
        open={shellResult !== null}
        onClose={() => setShellResult(null)}
        title={<span className="font-mono text-[13px]">$ {shellResult?.command ?? ""}</span>}
      >
        <div className="p-3">
          {shellResult?.status === "running" && (
            <div className="flex items-center gap-2 pb-2 text-[13px] text-muted">
              <IonSpinner name="crescent" style={{ width: 14, height: 14 }} />
              {t("console.running")}
            </div>
          )}
          {shellResult?.output ? (
            <CodeBlock code={shellResult.output} lang="text" plain />
          ) : shellResult?.status === "running" ? null : (
            <div className="p-6 text-center text-[13px] text-faint">—</div>
          )}
          {shellResult && shellResult.status !== "running" && (
            <div className="pt-2 text-[12px] text-faint">
              {shellResult.status === "exited" ? `${t("console.exit")} ${shellResult.exit ?? 0}` : shellResult.status}
            </div>
          )}
        </div>
      </Sheet>

      <Sheet open={helpOpen} onClose={() => setHelpOpen(false)} title={t("cmd.help")}>
        <div className="flex flex-col p-2">
          {BUILTIN_COMMANDS.map((c) => (
            <div key={c.name} className="flex items-baseline gap-3 px-3 py-2.5">
              <span className="shrink-0 font-mono text-[13px] font-semibold text-accent">/{c.name}</span>
              <span className="min-w-0 flex-1 text-[13px] text-muted">{t(c.descKey)}</span>
            </div>
          ))}
          <div className="px-3 py-2.5 text-[12px] text-faint">
            {t("conv.input.placeholder")} · <span className="font-mono">!command</span>
          </div>
        </div>
      </Sheet>

      <Sheet open={subagentsOpen} onClose={() => setSubagentsOpen(false)} title={t("conv.subagents")}>
        <div className="flex flex-col p-2">
          {childSessions.length === 0 ? (
            <div className="p-6 text-center text-[13px] text-muted">{t("conv.subagents.empty")}</div>
          ) : (
            childSessions.map((child) => {
              const running = Boolean(activeMap[child.id]) || Boolean(useSessions.getState().conversations[child.id]?.running);
              return (
                <button
                  key={child.id}
                  type="button"
                  onClick={() => {
                    setSubagentsOpen(false);
                    navigate(`/session/${child.id}`);
                  }}
                  className="flex items-center gap-3 rounded-lg px-3 py-3 text-left active:bg-surface2"
                >
                  <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", running ? "bg-success oc-pulse" : "bg-faint")} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] text-fg">{child.title || "—"}</span>
                    <span className="block text-[11.5px] text-faint">
                      {child.agent ? `${child.agent} · ` : ""}
                      {running ? t("conv.subagents.running") : t("conv.subagents.done")} · {formatRelative(child.time.updated)}
                    </span>
                  </span>
                  <IonIcon icon={chevronForwardOutline} className="text-[16px] text-faint" />
                </button>
              );
            })
          )}
        </div>
      </Sheet>

      <Sheet open={goalOpen} onClose={() => setGoalOpen(false)} title={t("goal.title")}>
        <div className="flex flex-col gap-3 p-3">
          {goal ? (
            <>
              <div className="flex flex-wrap items-center gap-1.5">
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                    goal.status === "paused"
                      ? "bg-warning/15 text-warning"
                      : goal.status === "complete"
                        ? "bg-success/15 text-success"
                        : "bg-accent/15 text-accent",
                  )}
                >
                  {t(`goal.pill.${goal.status}`)}
                </span>
                <span className="text-[11.5px] text-faint">
                  {t("goal.rounds", { rounds: goal.rounds, max: goal.maxRounds })}
                </span>
              </div>
              <p className="whitespace-pre-wrap text-[14px] leading-6 text-fg">{goal.objective}</p>
              {goal.reason && (
                <div className="rounded-lg border border-border bg-surface2 px-2.5 py-2 text-[12.5px] text-muted">
                  <span className="block pb-0.5 text-[10.5px] font-semibold uppercase tracking-wide text-faint">
                    {t("goal.reason")}
                  </span>
                  {goal.reason}
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                {goal.status === "active" ? (
                  <button
                    type="button"
                    onClick={() => void runGoal("pause", "goal.paused")}
                    className="rounded-lg border border-border bg-surface2 px-3 py-2 text-[13px] font-medium text-fg active:bg-surface"
                  >
                    {t("goal.pause")}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => void runGoal("resume", "goal.resumed")}
                    className="rounded-lg bg-accent px-3 py-2 text-[13px] font-semibold text-white active:opacity-90"
                  >
                    {t("goal.resume")}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => void runGoal("clear", "goal.cleared")}
                  className="rounded-lg border border-border px-3 py-2 text-[13px] font-medium text-danger active:bg-surface2"
                >
                  {t("goal.clear")}
                </button>
              </div>
            </>
          ) : goalUnsupported ? (
            <div className="p-4 text-center text-[13px] text-muted">{t("goal.unsupported")}</div>
          ) : (
            <>
              <p className="text-[12.5px] text-muted">{t("goal.hint")}</p>
              <textarea
                value={goalDraft}
                onChange={(e) => setGoalDraft(e.target.value)}
                rows={4}
                maxLength={4000}
                placeholder={t("goal.placeholder")}
                className="w-full resize-none rounded-xl border border-border bg-surface px-3 py-2.5 text-[14px] leading-6 text-fg outline-none placeholder:text-faint focus:border-borderstrong"
              />
              <button
                type="button"
                disabled={!goalDraft.trim()}
                onClick={() => {
                  void runGoal(goalDraft.trim(), "goal.started");
                  setGoalDraft("");
                  setGoalOpen(false);
                }}
                className={cn(
                  "rounded-lg px-3 py-2.5 text-[14px] font-semibold",
                  goalDraft.trim() ? "bg-accent text-white active:opacity-90" : "bg-surface2 text-faint",
                )}
              >
                {t("goal.start")}
              </button>
            </>
          )}
        </div>
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
    [t("conv.context.tokens"), tokens ? formatUsage(tokens, t) : "—"],
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
