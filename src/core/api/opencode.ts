import { useSettings } from "../store/settings";
import type {
  AgentInfo,
  CommandInfo,
  FileDiff,
  FileSystemEntry,
  FormDetail,
  FormInfo,
  MessageInfo,
  ModelInfo,
  ModelRef,
  ProviderInfo,
  SessionInfo,
  SessionMessagesResponse,
  SessionStats,
  SessionsResponse,
  ServerInfo,
  SkillInfo,
  VcsFileStatus,
  VcsInfo,
  PermissionRequest,
  PermissionReply,
  PromptFileInput,
  ShellInfo,
  ShellOutput,
  InboxDelivery,
  InboxItem,
  SessionGoal,
} from "../types";

export class ApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export function baseUrl(): string {
  const { host, port, secure } = useSettings.getState();
  return `${secure ? "https" : "http"}://${host}:${port}`;
}

function authHeaders(): Record<string, string> {
  const { token } = useSettings.getState();
  return token ? { authorization: `Bearer ${token}` } : {};
}

export async function rawFetch(path: string, init: RequestInit = {}, timeoutMs?: number): Promise<Response> {
  const controller = new AbortController();
  const timer = timeoutMs ? setTimeout(() => controller.abort(), timeoutMs) : undefined;
  const signal = init.signal
    ? AbortSignal.any([controller.signal, init.signal])
    : controller.signal;
  try {
    const headers = {
      ...authHeaders(),
      ...(init.body ? { "content-type": "application/json" } : {}),
      ...((init.headers as Record<string, string>) ?? {}),
    };
    return await fetch(`${baseUrl()}${path}`, { ...init, headers, signal });
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function throwForStatus(res: Response): Promise<never> {
  let message = `${res.status} ${res.statusText}`;
  try {
    const body = (await res.json()) as { error?: string; message?: string; data?: { message?: string } };
    message = body.message ?? body.data?.message ?? body.error ?? message;
  } catch {
    /* ignore */
  }
  throw new ApiError(res.status, message);
}

async function request<T>(path: string, init: RequestInit = {}, timeoutMs = 30_000, raw = false): Promise<T> {
  const res = await rawFetch(path, init, timeoutMs);
  if (!res.ok) await throwForStatus(res);
  if (res.status === 204) return undefined as T;
  const body = (await res.json()) as { data?: T } | T;
  if (!raw && body && typeof body === "object" && "data" in (body as object)) {
    return (body as { data: T }).data;
  }
  return body as T;
}

const qs = (params: Record<string, string | number | undefined | null>): string => {
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") search.set(k, String(v));
  const s = search.toString();
  return s ? `?${s}` : "";
};

export const api = {
  // --- server ---------------------------------------------------------------
  serverInfo: () => request<ServerInfo>("/api/info"),

  // --- sessions -------------------------------------------------------------
  listSessions: (params: {
    limit?: number;
    order?: "asc" | "desc";
    search?: string;
    parentID?: string;
    directory?: string;
    project?: string;
    cursor?: string;
  } = {}, signal?: AbortSignal) => request<SessionsResponse>(`/api/session${qs(params)}`, { signal }, 30_000, true),

  listProjects: (signal?: AbortSignal) =>
    request<import("../types").Project[]>("/api/project", { signal }, 30_000),

  activeSessions: (signal?: AbortSignal) =>
    request<Record<string, { type: string }>>("/api/session/active", { signal }),

  createSession: (body: {
    title?: string;
    agent?: string;
    model?: ModelRef;
    location?: { directory: string };
  }) => request<SessionInfo>("/api/session", { method: "POST", body: JSON.stringify(body) }),

  getSession: (id: string) => request<SessionInfo>(`/api/session/${id}`),

  updateSession: (id: string, body: { title?: string }) =>
    request<void>(`/api/session/${id}`, { method: "PATCH", body: JSON.stringify(body) }),

  deleteSession: (id: string) => request<void>(`/api/session/${id}`, { method: "DELETE" }),

  forkSession: (id: string) => request<SessionInfo>(`/api/session/${id}/fork`, { method: "POST" }),

  setSessionModel: (id: string, model: ModelRef) =>
    request<void>(`/api/session/${id}/model`, { method: "POST", body: JSON.stringify({ model }) }),

  setSessionAgent: (id: string, agent: string) =>
    request<void>(`/api/session/${id}/agent`, { method: "POST", body: JSON.stringify({ agent }) }),

  moveSession: (id: string, directory: string) =>
    request<void>(`/api/session/${id}/move`, { method: "POST", body: JSON.stringify({ location: { directory } }) }),

  sessionContext: (id: string) => request<MessageInfo[]>(`/api/session/${id}/context`),

  sessionDiff: (id: string, params: { from?: string; to?: string; context?: number } = {}) =>
    request<FileDiff[]>(`/api/session/${id}/diff${qs(params)}`),

  sessionInbox: (id: string) => request<InboxItem[]>(`/api/session/${id}/inbox`),

  cancelInbox: (id: string, inboxID: string) =>
    request<void>(`/api/session/${id}/inbox/${inboxID}`, { method: "DELETE" }),

  setInboxDelivery: (id: string, inboxID: string, delivery: InboxDelivery) =>
    request<void>(`/api/session/${id}/inbox/${inboxID}`, {
      method: "PATCH",
      body: JSON.stringify({ delivery }),
    }),

  /** Session goal status (OpenCode 2.2+). Throws ApiError 404 on older servers. */
  goal: (sessionID: string) =>
    request<{ output: SessionGoal | null }>("/api/rpc/opencode.goal/get", {
      method: "POST",
      body: JSON.stringify({ input: { sessionID } }),
    }),

  // --- messages & prompts ---------------------------------------------------
  listMessages: (id: string, params: { limit?: number; order?: "asc" | "desc"; cursor?: string } = {}, signal?: AbortSignal) =>
    request<SessionMessagesResponse>(`/api/session/${id}/message${qs(params)}`, { signal }, 30_000, true),

  getMessage: (id: string, messageID: string) =>
    request<MessageInfo>(`/api/session/${id}/message/${messageID}`),

  prompt: (
    id: string,
    body: { text: string; files?: PromptFileInput[]; agent?: string; delivery?: "steer" | "queue" },
  ) => request<unknown>(`/api/session/${id}/prompt`, { method: "POST", body: JSON.stringify(body) }, 120_000),

  runCommand: (
    id: string,
    body: { name: string; text: string; files?: PromptFileInput[] },
  ) => request<void>(`/api/session/${id}/command`, { method: "POST", body: JSON.stringify(body) }, 120_000),

  runShell: (id: string, command: string) =>
    request<void>(`/api/session/${id}/shell`, { method: "POST", body: JSON.stringify({ command }) }),

  interrupt: (id: string, resume = false) =>
    request<{ interrupted: boolean }>(`/api/session/${id}/interrupt${qs({ resume: String(resume) })}`, {
      method: "POST",
    }),

  compact: (id: string) => request<void>(`/api/session/${id}/compact`, { method: "POST" }),

  revertStage: (id: string, messageID: string) =>
    request<void>(`/api/session/${id}/revert/stage`, { method: "POST", body: JSON.stringify({ messageID }) }),

  revertCommit: (id: string) => request<void>(`/api/session/${id}/revert/commit`, { method: "POST" }),

  revertClear: (id: string) => request<void>(`/api/session/${id}/revert`, { method: "DELETE" }),

  exportSession: (id: string) => request<unknown>(`/api/experimental/session/${id}/export`, {}, 60_000),

  // --- forms (questions) & permissions -------------------------------------
  listSessionForms: (id: string) => request<FormInfo[]>(`/api/session/${id}/form`),

  getForm: (id: string, formID: string) => request<FormDetail>(`/api/session/${id}/form/${formID}`),

  replyForm: (id: string, formID: string, answer: Record<string, unknown>) =>
    request<void>(`/api/session/${id}/form/${formID}/reply`, {
      method: "POST",
      body: JSON.stringify({ answer }),
    }),

  cancelForm: (id: string, formID: string) => request<void>(`/api/session/${id}/form/${formID}`, { method: "DELETE" }),

  listPermissionRequests: () => request<PermissionRequest[]>("/api/permission/request"),

  listSessionPermissions: (id: string) => request<PermissionRequest[]>(`/api/session/${id}/permission`),

  replyPermission: (id: string, requestID: string, decision: PermissionReply, message?: string) =>
    request<void>(`/api/session/${id}/permission/${requestID}/reply`, {
      method: "POST",
      body: JSON.stringify({ decision, message }),
    }),

  // --- catalog --------------------------------------------------------------
  listModels: () => request<ModelInfo[]>("/api/model", {}, 60_000),
  defaultModel: () => request<ModelRef>("/api/model/default"),
  listProviders: () => request<ProviderInfo[]>("/api/provider", {}, 60_000),
  listAgents: () => request<AgentInfo[]>("/api/agent"),
  listCommands: () => request<CommandInfo[]>("/api/command"),
  listSkills: () => request<SkillInfo[]>("/api/skill"),
  listMcp: (signal?: AbortSignal) =>
    request<Array<{ name: string; status?: { status: string }; integrationID?: string }>>("/api/mcp", { signal }),

  // --- filesystem -----------------------------------------------------------
  fsList: (path?: string, directory?: string) => {
    const params = new URLSearchParams();
    if (directory) params.set("location[directory]", directory);
    if (path) params.set("path", path);
    const s = params.toString();
    return request<FileSystemEntry[]>(`/api/fs/list${s ? `?${s}` : ""}`);
  },
  fsReadText: async (path: string, directory?: string): Promise<string> => {
    const params = new URLSearchParams();
    if (directory) params.set("location[directory]", directory);
    const encoded = path.split("/").map(encodeURIComponent).join("/");
    const s = params.toString();
    const res = await rawFetch(`/api/fs/read/${encoded}${s ? `?${s}` : ""}`, {}, 30_000);
    if (!res.ok) throw new ApiError(res.status, `${res.status} ${res.statusText}`);
    return res.text();
  },
  fsReadBlob: async (path: string, directory?: string): Promise<Blob> => {
    const params = new URLSearchParams();
    if (directory) params.set("location[directory]", directory);
    const encoded = path.split("/").map(encodeURIComponent).join("/");
    const s = params.toString();
    const res = await rawFetch(`/api/fs/read/${encoded}${s ? `?${s}` : ""}`, {}, 30_000);
    if (!res.ok) throw new ApiError(res.status, `${res.status} ${res.statusText}`);
    return res.blob();
  },

  // --- vcs ------------------------------------------------------------------
  vcsInfo: () => request<VcsInfo>("/api/vcs"),
  vcsStatus: () => request<VcsFileStatus[]>("/api/vcs/status"),
  vcsDiff: () => request<FileDiff[]>("/api/vcs/diff"),

  // --- stats ----------------------------------------------------------------
  sessionStats: (params: { from?: string; to?: string; tools?: "none" | "summary" | "detail" } = {}) =>
    request<SessionStats>(`/api/experimental/session/stats${qs(params)}`, {}, 60_000),

  // --- shell (remote command execution) ------------------------------------
  runShellGlobal: (body: { command: string; cwd?: string; timeout?: number }, signal?: AbortSignal) =>
    request<ShellInfo>("/api/shell", { method: "POST", body: JSON.stringify(body), signal }, 30_000),
  shellInfo: (id: string, signal?: AbortSignal) => request<ShellInfo>(`/api/shell/${id}`, { signal }),
  shellOutput: (id: string, signal?: AbortSignal) => request<ShellOutput>(`/api/shell/${id}/output`, { signal }),
  killShell: (id: string) => request<void>(`/api/shell/${id}`, { method: "DELETE" }),

  // --- preview (dev servers) ------------------------------------------------
  listServers: (signal?: AbortSignal) => request<{ servers: Array<{ port: number; url: string }> }>("/servers", { signal }),

  // --- config ---------------------------------------------------------------
  getConfig: () => request<Record<string, unknown>>("/api/config"),
};
