import { create } from "zustand";
import { api } from "../api/opencode";
import { eventStream } from "../events";
import { useSettings } from "./settings";
import type {
  AssistantMessage,
  AssistantPart,
  FormInfo,
  MessageInfo,
  InboxDelivery,
  InboxItem,
  ModelRef,
  OpenCodeEvent,
  PermissionReply,
  PermissionRequest,
  PromptFileInput,
  SessionInfo,
  SessionStatus,
  ToolPart,
  TokenUsage,
} from "../types";
import { emptyTokens } from "../types";

const RECENT_PAGE = 50;
const OLDER_PAGE = 50;

export type Conversation = {
  id: string;
  messages: MessageInfo[];
  parts: Record<string, AssistantPart[]>;
  forms: FormInfo[];
  permissions: PermissionRequest[];
  /** Prompts stacked on the server, waiting for the current turn to end. */
  inbox: InboxItem[];
  status: SessionStatus;
  running: boolean;
  cost: number;
  tokens: TokenUsage;
  loaded: boolean;
  loading: boolean;
  loadingOlder: boolean;
  hasMore: boolean;
  oldestCursor?: string;
  error?: string;
};

const newConversation = (id: string): Conversation => ({
  id,
  messages: [],
  parts: {},
  forms: [],
  permissions: [],
  inbox: [],
  status: { type: "idle" },
  running: false,
  cost: 0,
  tokens: emptyTokens(),
  loaded: false,
  loading: false,
  loadingOlder: false,
  hasMore: false,
});

type SessionsState = {
  list: SessionInfo[];
  listLoading: boolean;
  listError?: string;
  conversations: Record<string, Conversation>;

  loadSessions: (search?: string) => Promise<void>;
  upsertSession: (session: SessionInfo) => void;
  removeSession: (id: string) => Promise<void>;
  createSession: (body: { title?: string; agent?: string; model?: ModelRef; location?: { directory: string } }) => Promise<SessionInfo | undefined>;
  renameSession: (id: string, title: string) => Promise<void>;
  setSessionModel: (id: string, model: ModelRef) => Promise<void>;
  setSessionAgent: (id: string, agent: string) => Promise<void>;

  ensureConversation: (id: string) => void;
  loadMessages: (id: string) => Promise<void>;
  loadOlder: (id: string) => Promise<void>;
  mergeRecent: (id: string) => Promise<void>;
  abortLoad: (id: string) => void;
  sendPrompt: (id: string, text: string, files?: PromptFileInput[], agent?: string, delivery?: InboxDelivery) => Promise<void>;
  refreshInbox: (id: string) => Promise<void>;
  cancelInbox: (id: string, inboxID: string) => Promise<void>;
  setInboxDelivery: (id: string, inboxID: string, delivery: InboxDelivery) => Promise<void>;
  interrupt: (id: string) => Promise<void>;
  replyForm: (id: string, formID: string, answer: Record<string, unknown>) => Promise<void>;
  replyPermission: (id: string, requestID: string, decision: PermissionReply) => Promise<void>;

  /** Re-read the sessions and every loaded conversation after a reconnect. */
  resync: () => Promise<void>;
  applyEvent: (event: OpenCodeEvent) => void;
};

// --- pure helpers -----------------------------------------------------------

function isAbort(err: unknown): boolean {
  return err instanceof DOMException && err.name === "AbortError";
}

function partsOf(c: Conversation, messageID: string): AssistantPart[] {
  return c.parts[messageID] ?? [];
}

function setParts(c: Conversation, messageID: string, parts: AssistantPart[]): Conversation {
  return { ...c, parts: { ...c.parts, [messageID]: parts } };
}

function ensureTextPart(parts: AssistantPart[], ordinal: number, type: "text" | "reasoning", text = ""): AssistantPart[] {
  const next = parts.slice();
  const existing = next[ordinal];
  if (!existing || (existing.type !== "text" && existing.type !== "reasoning")) {
    next[ordinal] = type === "text" ? { type: "text", text } : { type: "reasoning", text };
  } else {
    next[ordinal] = { ...existing, type, text } as AssistantPart;
  }
  return next;
}

function ensureToolPart(parts: AssistantPart[], id: string, name: string, created: number): { parts: AssistantPart[]; index: number } {
  const existingIndex = parts.findIndex((p) => p.type === "tool" && p.id === id);
  if (existingIndex >= 0) return { parts, index: existingIndex };
  const next = parts.slice();
  next.push({ type: "tool", id, name, state: { status: "streaming", input: "" }, time: { created } });
  return { parts: next, index: next.length - 1 };
}

function updateToolPart(c: Conversation, messageID: string, id: string, updater: (part: ToolPart) => ToolPart): Conversation {
  const parts = partsOf(c, messageID);
  const index = parts.findIndex((p) => p.type === "tool" && p.id === id);
  if (index < 0) return c;
  const next = parts.slice();
  next[index] = updater(next[index] as ToolPart);
  return setParts(c, messageID, next);
}

function ensureAssistantMessage(c: Conversation, messageID: string, init: { created?: number; agent?: string; model?: ModelRef }): Conversation {
  if (c.messages.some((m) => m.id === messageID)) return c;
  const message: AssistantMessage = {
    type: "assistant",
    id: messageID,
    time: { created: init.created ?? Date.now() },
    agent: init.agent,
    model: init.model,
    content: [],
  };
  return {
    ...c,
    messages: [...c.messages, message],
    parts: c.parts[messageID] ? c.parts : { ...c.parts, [messageID]: [] },
  };
}

function replaceMessage(c: Conversation, messageID: string, updater: (m: MessageInfo) => MessageInfo): Conversation {
  const index = c.messages.findIndex((m) => m.id === messageID);
  if (index < 0) return c;
  const messages = c.messages.slice();
  messages[index] = updater(messages[index]);
  return { ...c, messages };
}

function sortMessages(messages: MessageInfo[]): MessageInfo[] {
  return messages.slice().sort((a, b) => (a.time?.created ?? 0) - (b.time?.created ?? 0));
}

function buildParts(messages: MessageInfo[]): Record<string, AssistantPart[]> {
  const parts: Record<string, AssistantPart[]> = {};
  for (const m of messages) if (m.type === "assistant") parts[m.id] = m.content;
  return parts;
}

// --- store ------------------------------------------------------------------

const loadControllers = new Map<string, AbortController>();

export const useSessions = create<SessionsState>((set, get) => {
  const withConv = (id: string, fn: (c: Conversation) => Conversation) => {
    const c = get().conversations[id];
    if (!c) return;
    set({ conversations: { ...get().conversations, [id]: fn(c) } });
  };

  return {
    list: [],
    listLoading: false,
    conversations: {},

    loadSessions: async (search) => {
      set({ listLoading: true, listError: undefined });
      try {
        const res = await api.listSessions({ limit: 200, order: "desc", search });
        set({ list: res.data, listLoading: false });
      } catch (err) {
        if (isAbort(err)) return;
        set({ listLoading: false, listError: err instanceof Error ? err.message : String(err) });
      }
    },

    upsertSession: (session) => {
      const list = get().list.slice();
      const index = list.findIndex((s) => s.id === session.id);
      if (index >= 0) list[index] = { ...list[index], ...session };
      else list.unshift(session);
      list.sort((a, b) => b.time.updated - a.time.updated);
      set({ list });
    },

    removeSession: async (id) => {
      await api.deleteSession(id);
      const conversations = { ...get().conversations };
      delete conversations[id];
      set({ list: get().list.filter((s) => s.id !== id), conversations });
    },

    createSession: async (body) => {
      const fallback = useSettings.getState().lastModel ?? get().list.find((s) => s.model)?.model;
      const model = body.model ?? fallback;
      const session = await api.createSession({ ...body, model });
      get().upsertSession(session);
      return session;
    },

    renameSession: async (id, title) => {
      await api.updateSession(id, { title });
      const session = get().list.find((s) => s.id === id);
      if (session) get().upsertSession({ ...session, title });
    },

    setSessionModel: async (id, model) => {
      await api.setSessionModel(id, model);
      useSettings.getState().update({ lastModel: model });
      const session = get().list.find((s) => s.id === id);
      if (session) get().upsertSession({ ...session, model });
    },

    setSessionAgent: async (id, agent) => {
      await api.setSessionAgent(id, agent);
      useSettings.getState().update({ lastAgent: agent });
      const session = get().list.find((s) => s.id === id);
      if (session) get().upsertSession({ ...session, agent });
    },

    ensureConversation: (id) => {
      if (get().conversations[id]) return;
      set({ conversations: { ...get().conversations, [id]: newConversation(id) } });
    },

    abortLoad: (id) => {
      loadControllers.get(id)?.abort();
      loadControllers.delete(id);
    },

    loadMessages: async (id) => {
      get().ensureConversation(id);
      get().abortLoad(id);
      const controller = new AbortController();
      loadControllers.set(id, controller);
      withConv(id, (c) => ({ ...c, loading: true, error: undefined }));
      try {
        const res = await api.listMessages(id, { limit: RECENT_PAGE, order: "desc" }, controller.signal);
        const messages = sortMessages(res.data);
        const parts = buildParts(messages);
        const [forms, permissions] = await Promise.all([
          api.listSessionForms(id).catch(() => [] as FormInfo[]),
          api.listSessionPermissions(id).catch(() => [] as PermissionRequest[]),
        ]);
        if (controller.signal.aborted) return;
        set({
          conversations: {
            ...get().conversations,
            [id]: {
              ...(get().conversations[id] ?? newConversation(id)),
              messages,
              parts,
              forms,
              permissions,
              loaded: true,
              loading: false,
              hasMore: Boolean(res.cursor?.next),
              oldestCursor: res.cursor?.next ?? undefined,
            },
          },
        });
      } catch (err) {
        if (isAbort(err)) return;
        withConv(id, (c) => ({ ...c, loading: false, error: err instanceof Error ? err.message : String(err) }));
      } finally {
        loadControllers.delete(id);
      }
    },

    loadOlder: async (id) => {
      const c = get().conversations[id];
      if (!c || c.loadingOlder || !c.hasMore || !c.oldestCursor) return;
      withConv(id, (conv) => ({ ...conv, loadingOlder: true }));
      try {
        const res = await api.listMessages(id, { limit: OLDER_PAGE, cursor: c.oldestCursor });
        const older = sortMessages(res.data);
        set({
          conversations: {
            ...get().conversations,
            [id]: {
              ...get().conversations[id],
              messages: [...older, ...get().conversations[id].messages],
              parts: { ...buildParts(older), ...get().conversations[id].parts },
              loadingOlder: false,
              hasMore: Boolean(res.cursor?.next),
              oldestCursor: res.cursor?.next ?? undefined,
            },
          },
        });
      } catch (err) {
        if (isAbort(err)) return;
        withConv(id, (conv) => ({ ...conv, loadingOlder: false }));
      }
    },

    mergeRecent: async (id) => {
      const c = get().conversations[id];
      if (!c?.loaded) return;
      try {
        const res = await api.listMessages(id, { limit: RECENT_PAGE, order: "desc" });
        const incoming = res.data;
        const byId = new Map(c.messages.map((m) => [m.id, m] as const));
        const incomingTexts = new Set(incoming.filter((m) => m.type === "user").map((m) => (m.type === "user" ? m.text : "")));
        for (const m of incoming) byId.set(m.id, m);
        let messages = [...byId.values()].filter(
          (m) => !(m.id.startsWith("msg_local_") && m.type === "user" && incomingTexts.has(m.text)),
        );
        messages = sortMessages(messages);
        set({
          conversations: {
            ...get().conversations,
            [id]: { ...c, messages, parts: { ...c.parts, ...buildParts(incoming) } },
          },
        });
      } catch {
        /* ignore */
      }
    },

    sendPrompt: async (id, text, files, agent, delivery) => {
      get().ensureConversation(id);
      const queued = delivery === "queue" && Boolean(get().conversations[id]?.running);
      const optimistic: MessageInfo = {
        type: "user",
        id: `msg_local_${crypto.randomUUID()}`,
        time: { created: Date.now() },
        text,
        files: files?.map((f) => ({ name: f.name, mime: f.mime })),
      };
      // A stacked prompt is only delivered after the running turn, so it must not
      // appear in the transcript yet: the server inbox row is the visible trace.
      withConv(id, (c) => ({
        ...c,
        running: queued ? c.running : true,
        status: queued ? c.status : { type: "busy" },
        messages: queued ? c.messages : [...c.messages, optimistic],
      }));
      try {
        await api.prompt(id, { text, files, agent, delivery });
        if (queued) await get().refreshInbox(id);
      } catch (err) {
        withConv(id, (c) => ({
          ...c,
          running: queued ? c.running : false,
          status: queued ? c.status : { type: "idle" },
          error: err instanceof Error ? err.message : String(err),
          messages: queued ? c.messages : c.messages.filter((m) => m.id !== optimistic.id),
        }));
        throw err;
      }
    },

    refreshInbox: async (id) => {
      try {
        const inbox = await api.sessionInbox(id);
        withConv(id, (c) => ({ ...c, inbox: Array.isArray(inbox) ? inbox : [] }));
      } catch {
        /* older servers or transient errors: keep the last known queue */
      }
    },

    cancelInbox: async (id, inboxID) => {
      withConv(id, (c) => ({ ...c, inbox: c.inbox.filter((i) => i.id !== inboxID) }));
      try {
        await api.cancelInbox(id, inboxID);
      } finally {
        await get().refreshInbox(id);
      }
    },

    setInboxDelivery: async (id, inboxID, delivery) => {
      withConv(id, (c) => ({
        ...c,
        inbox: c.inbox.map((i) => (i.id === inboxID ? { ...i, delivery } : i)),
      }));
      try {
        await api.setInboxDelivery(id, inboxID, delivery);
      } finally {
        await get().refreshInbox(id);
      }
    },

    interrupt: async (id) => {
      try {
        await api.interrupt(id);
      } finally {
        withConv(id, (c) => ({ ...c, running: false, status: { type: "idle" } }));
      }
    },

    replyForm: async (id, formID, answer) => {
      await api.replyForm(id, formID, answer);
      withConv(id, (c) => ({ ...c, forms: c.forms.filter((f) => f.id !== formID) }));
    },

    replyPermission: async (id, requestID, decision) => {
      await api.replyPermission(id, requestID, decision);
      withConv(id, (c) => ({ ...c, permissions: c.permissions.filter((p) => p.id !== requestID) }));
    },

    resync: async () => {
      const ids = Object.keys(get().conversations);
      if (ids.length === 0) {
        await get().loadSessions().catch(() => undefined);
        return;
      }
      await get().loadSessions().catch(() => undefined);
      let active: Record<string, { type: string }> | null = null;
      try {
        active = await api.activeSessions();
      } catch {
        /* transient: keep event-driven state */
      }
      await Promise.all(
        ids.map(async (id) => {
          if (!get().conversations[id]) return;
          await get().mergeRecent(id);
          await get().refreshInbox(id);
          if (!active) return;
          const on = Boolean(active[id]);
          withConv(id, (c) =>
            c.running === on ? c : { ...c, running: on, status: on ? { type: "busy" } : { type: "idle" } },
          );
        }),
      );
    },

    applyEvent: (event) => {
      const t = event.type;
      const d = (event.data ?? {}) as Record<string, any>;
      const sid: string | undefined = d.sessionID;

      // The bridge sends this synthetic event on every (re)connection: events
      // missed while the socket was down must be recovered over REST.
      if (t === "server.connected") {
        void get().resync();
        return;
      }

      if (t === "session.created") {
        void get().loadSessions();
        return;
      }
      if (t === "session.deleted" && sid) {
        const conversations = { ...get().conversations };
        delete conversations[sid];
        set({ list: get().list.filter((s) => s.id !== sid), conversations });
        return;
      }
      if (t === "session.renamed" && sid) {
        const session = get().list.find((s) => s.id === sid);
        if (session) get().upsertSession({ ...session, title: d.title });
        return;
      }
      if (t === "session.moved" && sid && d.location) {
        const session = get().list.find((s) => s.id === sid);
        if (session) get().upsertSession({ ...session, location: { directory: d.location.directory } });
        return;
      }
      if (t === "session.model.selected" && sid && d.model) {
        const session = get().list.find((s) => s.id === sid);
        if (session) get().upsertSession({ ...session, model: d.model as ModelRef });
        return;
      }
      if (t === "session.agent.selected" && sid && d.agent) {
        const session = get().list.find((s) => s.id === sid);
        if (session) get().upsertSession({ ...session, agent: d.agent });
        return;
      }

      if (!sid || !get().conversations[sid]) return;

      switch (t) {
        case "session.status": {
          const status = d.status as SessionStatus;
          withConv(sid, (c) => ({ ...c, status, running: status.type !== "idle" }));
          return;
        }
        case "session.idle": {
          withConv(sid, (c) => ({ ...c, status: { type: "idle" }, running: false }));
          void get().mergeRecent(sid);
          void get().refreshInbox(sid);
          return;
        }
        case "session.execution.started":
        case "session.step.started": {
          const mid = d.assistantMessageID as string | undefined;
          withConv(sid, (c) => {
            let next = { ...c, running: true, status: { type: "busy" } as SessionStatus };
            if (mid) next = ensureAssistantMessage(next, mid, { created: d.started, agent: d.agent, model: d.model });
            return next;
          });
          void get().refreshInbox(sid);
          return;
        }
        case "session.execution.failed": {
          withConv(sid, (c) => ({ ...c, running: false, status: { type: "idle" }, error: d.error?.message }));
          void get().refreshInbox(sid);
          return;
        }
        case "session.execution.interrupted":
        case "session.execution.succeeded": {
          withConv(sid, (c) => ({ ...c, running: false, status: { type: "idle" } }));
          void get().refreshInbox(sid);
          return;
        }
        case "session.step.ended": {
          const mid = d.assistantMessageID as string | undefined;
          if (!mid) return;
          withConv(sid, (c) =>
            replaceMessage(c, mid, (m) =>
              m.type === "assistant" ? { ...m, finish: d.finish, cost: d.cost, tokens: d.tokens, time: { ...m.time, completed: Date.now() } } : m,
            ),
          );
          return;
        }
        case "session.step.failed": {
          const mid = d.assistantMessageID as string | undefined;
          if (!mid) return;
          withConv(sid, (c) => replaceMessage(c, mid, (m) => (m.type === "assistant" ? { ...m, error: d.error } : m)));
          return;
        }
        case "session.text.started": {
          const mid = d.assistantMessageID as string | undefined;
          if (!mid) return;
          withConv(sid, (c) => setParts(c, mid, ensureTextPart(partsOf(c, mid), d.ordinal, "text", "")));
          return;
        }
        case "session.text.delta": {
          const mid = d.assistantMessageID as string | undefined;
          if (!mid) return;
          withConv(sid, (c) => {
            const parts = partsOf(c, mid);
            const existing = parts[d.ordinal];
            const text = existing && existing.type === "text" ? existing.text + d.delta : String(d.delta);
            return setParts(c, mid, ensureTextPart(parts, d.ordinal, "text", text));
          });
          return;
        }
        case "session.text.ended": {
          const mid = d.assistantMessageID as string | undefined;
          if (!mid) return;
          withConv(sid, (c) => setParts(c, mid, ensureTextPart(partsOf(c, mid), d.ordinal, "text", d.text ?? "")));
          return;
        }
        case "session.reasoning.started": {
          const mid = d.assistantMessageID as string | undefined;
          if (!mid) return;
          withConv(sid, (c) => setParts(c, mid, ensureTextPart(partsOf(c, mid), d.ordinal, "reasoning", "")));
          return;
        }
        case "session.reasoning.delta": {
          const mid = d.assistantMessageID as string | undefined;
          if (!mid) return;
          withConv(sid, (c) => {
            const parts = partsOf(c, mid);
            const existing = parts[d.ordinal];
            const text = existing && existing.type === "reasoning" ? existing.text + d.delta : String(d.delta);
            return setParts(c, mid, ensureTextPart(parts, d.ordinal, "reasoning", text));
          });
          return;
        }
        case "session.reasoning.ended": {
          const mid = d.assistantMessageID as string | undefined;
          if (!mid) return;
          withConv(sid, (c) => {
            const updated = ensureTextPart(partsOf(c, mid), d.ordinal, "reasoning", d.text ?? "");
            const part = updated[d.ordinal];
            if (part && part.type === "reasoning") updated[d.ordinal] = { ...part, time: { created: Date.now(), completed: Date.now() } };
            return setParts(c, mid, updated);
          });
          return;
        }
        case "session.tool.input.started": {
          const mid = d.assistantMessageID as string | undefined;
          if (!mid) return;
          withConv(sid, (c) => {
            const { parts } = ensureToolPart(partsOf(c, mid), d.id, d.name, d.created ?? Date.now());
            return setParts(c, mid, parts);
          });
          return;
        }
        case "session.tool.input.delta": {
          const mid = d.assistantMessageID as string | undefined;
          if (!mid) return;
          withConv(sid, (c) =>
            updateToolPart(c, mid, d.id, (part) => ({
              ...part,
              state: part.state.status === "streaming" ? { status: "streaming", input: part.state.input + d.delta } : part.state,
            })),
          );
          return;
        }
        case "session.tool.input.ended": {
          const mid = d.assistantMessageID as string | undefined;
          if (!mid) return;
          withConv(sid, (c) =>
            updateToolPart(c, mid, d.id, (part) => ({
              ...part,
              state: { status: "streaming", input: d.text ?? (part.state as { input?: string }).input ?? "" },
            })),
          );
          return;
        }
        case "session.tool.called": {
          const mid = d.assistantMessageID as string | undefined;
          if (!mid) return;
          withConv(sid, (c) => {
            const { parts } = ensureToolPart(partsOf(c, mid), d.id, d.id, Date.now());
            const next = setParts(c, mid, parts);
            return updateToolPart(next, mid, d.id, (part) => ({
              ...part,
              executed: d.executed,
              time: { ...part.time, ran: Date.now() },
              state: { status: "running", input: d.input ?? {}, metadata: d.state },
            }));
          });
          return;
        }
        case "session.tool.progress": {
          const mid = d.assistantMessageID as string | undefined;
          if (!mid) return;
          withConv(sid, (c) =>
            updateToolPart(c, mid, d.id, (part) =>
              part.state.status === "running" ? { ...part, state: { ...part.state, metadata: { ...part.state.metadata, ...d.metadata } } } : part,
            ),
          );
          return;
        }
        case "session.tool.success": {
          const mid = d.assistantMessageID as string | undefined;
          if (!mid) return;
          withConv(sid, (c) =>
            updateToolPart(c, mid, d.id, (part) => ({
              ...part,
              executed: d.executed,
              time: { ...part.time, completed: Date.now() },
              state: { status: "completed", input: d.input ?? {}, content: d.content ?? [], metadata: d.metadata },
            })),
          );
          return;
        }
        case "session.tool.failed": {
          const mid = d.assistantMessageID as string | undefined;
          if (!mid) return;
          withConv(sid, (c) =>
            updateToolPart(c, mid, d.id, (part) => ({
              ...part,
              executed: d.executed,
              time: { ...part.time, completed: Date.now() },
              state: { status: "error", input: d.input ?? {}, error: d.error, content: d.content, metadata: d.metadata },
            })),
          );
          return;
        }
        case "session.message.content.updated": {
          const mid = d.messageID as string | undefined;
          if (!mid) return;
          withConv(sid, (c) => setParts(c, mid, d.content ?? []));
          return;
        }
        case "session.usage.updated": {
          withConv(sid, (c) => ({ ...c, cost: d.cost, tokens: d.tokens }));
          return;
        }
        case "session.usage.recorded": {
          withConv(sid, (c) => ({ ...c, cost: (c.cost ?? 0) + (d.cost ?? 0) }));
          return;
        }
        case "form.created": {
          const form = d.form as FormInfo | undefined;
          if (!form) return;
          withConv(sid, (c) => ({ ...c, forms: [...c.forms.filter((f) => f.id !== form.id), form] }));
          return;
        }
        case "form.replied":
        case "form.cancelled": {
          const id = d.id as string | undefined;
          if (!id) return;
          withConv(sid, (c) => ({ ...c, forms: c.forms.filter((f) => f.id !== id) }));
          return;
        }
        case "permission.asked": {
          withConv(sid, (c) => ({
            ...c,
            permissions: [
              ...c.permissions.filter((p) => p.id !== d.id),
              { id: d.id, sessionID: sid, action: d.action, resources: d.resources ?? [], save: d.save, message: d.message },
            ],
          }));
          return;
        }
        case "permission.replied": {
          const id = d.requestID as string | undefined;
          if (!id) return;
          withConv(sid, (c) => ({ ...c, permissions: c.permissions.filter((p) => p.id !== id) }));
          return;
        }
        case "server.connected": {
          void get().mergeRecent(sid);
          return;
        }
        default:
          return;
      }
    },
  };
});

eventStream.onEvent((event) => useSessions.getState().applyEvent(event));
