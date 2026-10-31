// Minimal, hand-written subset of the OpenCode V2 HTTP API types.
// Source of truth: https://opencode.ai/v2/openapi.json

export type MoneyUSD = number;

export type TokenUsage = {
  input: number;
  output: number;
  reasoning: number;
  cache: { read: number; write: number };
};

export const emptyTokens = (): TokenUsage => ({
  input: 0,
  output: 0,
  reasoning: 0,
  cache: { read: 0, write: 0 },
});

export type ModelRef = {
  id: string;
  providerID: string;
  variant?: string;
};

export type LocationRef = { directory: string; workspaceID?: string };
export type LocationPublicRef = { directory: string };

export type SessionInfo = {
  id: string;
  parentID?: string;
  projectID: string;
  agent?: string;
  model?: ModelRef;
  cost: MoneyUSD;
  tokens: TokenUsage;
  outcome?: "succeeded" | "failed" | "interrupted";
  time: { created: number; updated: number; idle?: number; viewed?: number; archived?: number };
  title?: string;
  subpath?: string;
  location: LocationPublicRef;
};

export type SessionStatus =
  | { type: "idle" }
  | { type: "busy" }
  | { type: "retry"; attempt: number; message: string; next: number };

export type StructuredError = { type: string; message: string; status?: number };

export type TextPart = { type: "text"; text: string };
export type ReasoningPart = { type: "reasoning"; text: string; time?: { created: number; completed?: number } };

export type ToolContent =
  | { type: "text"; text: string }
  | { type: "file"; path?: string; mime?: string; text?: string };

export type ToolState =
  | { status: "streaming"; input: string }
  | { status: "running"; input: Record<string, unknown>; metadata?: Record<string, unknown> }
  | {
      status: "completed";
      input: Record<string, unknown>;
      content: ToolContent[];
      metadata?: Record<string, unknown>;
    }
  | {
      status: "error";
      input: Record<string, unknown>;
      error: StructuredError;
      content?: ToolContent[];
      metadata?: Record<string, unknown>;
    };

export type ToolPart = {
  type: "tool";
  id: string;
  name: string;
  executed?: boolean;
  state: ToolState;
  time: { created: number; ran?: number; completed?: number };
};

export type AssistantPart = TextPart | ReasoningPart | ToolPart;

export type UserMessage = {
  type: "user";
  id: string;
  time: { created: number };
  text: string;
  files?: Array<{ name?: string; mime?: string }>;
};

export type AssistantMessage = {
  type: "assistant";
  id: string;
  time: { created: number; streamed?: number; completed?: number };
  agent?: string;
  model?: ModelRef;
  content: AssistantPart[];
  finish?: string;
  cost?: number;
  tokens?: TokenUsage;
  error?: StructuredError;
};

export type SystemMessage = { type: "system"; id: string; time: { created: number }; text?: string };
export type ShellMessage = {
  type: "shell";
  id: string;
  time: { created: number; completed?: number };
  shellID: string;
  command: string;
  status: "running" | "exited" | "timeout" | "killed";
  exit?: number | string;
  output?: { output: string; cursor: number; size: number; truncated: boolean };
};
export type SyntheticMessage = { type: "synthetic"; id: string; time: { created: number }; text?: string };
export type SkillMessage = { type: "skill"; id: string; time: { created: number }; skill?: string; name?: string; text?: string };
export type IdleMessage = { type: "idle"; id: string; time: { created: number } };
export type AgentSelectedMessage = { type: "agent-switched"; id: string; time: { created: number }; agent?: string };
export type ModelSelectedMessage = { type: "model-switched"; id: string; time: { created: number }; model?: ModelRef };
export type LocationSwitchedMessage = { type: "location-switched"; id: string; time: { created: number } };

export type MessageInfo =
  | UserMessage
  | AssistantMessage
  | SystemMessage
  | ShellMessage
  | SyntheticMessage
  | SkillMessage
  | IdleMessage
  | AgentSelectedMessage
  | ModelSelectedMessage
  | LocationSwitchedMessage;

export type SessionMessagesResponse = {
  data: MessageInfo[];
  cursor: { previous?: string | null; next?: string | null };
};

export type SessionsResponse = {
  data: SessionInfo[];
  cursor: { previous?: string | null; next?: string | null };
};

// --- Models / providers / agents -------------------------------------------

export type ModelInfo = {
  id: string;
  modelID: string;
  providerID: string;
  name: string;
  family?: string;
  capabilities: { tools: boolean; input: string[]; output: string[] };
  variants: Array<{ id: string }>;
  limit: { context: number; input?: number; output: number };
  cost: Array<{
    input: number;
    output: number;
    cache: { read: number; write: number };
  }>;
  status: "alpha" | "beta" | "deprecated" | "active";
  enabled: boolean;
  time: { released: number };
};

export type ProviderInfo = {
  id: string;
  name: string;
  activation: "auto" | "enabled" | "disabled";
  package: string;
  integrationID?: string;
};

export type AgentInfo = {
  id: string;
  name: string;
  mode: "subagent" | "primary" | "all";
  hidden: boolean;
  description?: string;
  model?: ModelRef;
  color?: string;
};

export type CommandInfo = { name: string; description?: string };
export type SkillInfo = { id: string; name: string; description?: string; autoinvoke?: boolean; path: string; content: string };

export type ServerInfo = { version: string; pid: number; urls: string[]; paths: { tmp: string } };

export type ShellInfo = {
  id: string;
  status: "running" | "exited" | "timeout" | "killed";
  command: string;
  cwd: string;
  shell: string;
  file: string;
  pid: number;
  exit?: number | string;
  metadata?: Record<string, unknown>;
  time: { started: number; completed?: number };
};

export type ShellOutput = { output: string; cursor: number; size: number; truncated: boolean };

export type Project = {
  id: string;
  canonical: string;
  name?: string;
  vcs?: string;
  time: { created?: number; updated?: number; active?: number };
  sandboxes?: string[];
};

// --- Questions (forms) & permissions ---------------------------------------

export type FormOption = { value: string; label: string; description?: string };

export type FormField = {
  key: string;
  type: "string" | "number" | "integer" | "boolean" | "multiselect" | "external";
  title?: string;
  description?: string;
  required?: boolean;
  hidden?: boolean;
  options?: FormOption[];
  placeholder?: string;
  default?: unknown;
  url?: string;
  custom?: boolean;
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  minItems?: number;
  maxItems?: number;
};

export type FormValue = string | number | boolean | string[];
export type FormAnswer = Record<string, FormValue>;

export type FormInfo = {
  id: string;
  sessionID: string;
  title: string;
  fields: FormField[];
};

export type FormDetail = FormInfo & {
  state: { status: "pending" } | { status: "answered"; answer: FormAnswer } | { status: "cancelled"; message?: string };
};

export type PermissionRequest = {
  id: string;
  sessionID: string;
  action: string;
  resources: string[];
  save?: string[];
  message?: string;
  metadata?: Record<string, unknown>;
};

export type PermissionReply = "once" | "always" | "reject";

// --- Filesystem / VCS -------------------------------------------------------

export type FileSystemEntry = { path: string; type: "file" | "directory" };
export type FileDiff = {
  file: string;
  patch: string;
  additions: number;
  deletions: number;
  status: "added" | "deleted" | "modified";
};
export type VcsFileStatus = { file: string; additions: number; deletions: number; status: "added" | "deleted" | "modified" };
export type VcsInfo = { provider?: string; branch?: { current?: string; default?: string } };

export type SessionStats = {
  sessions: number;
  prompts: number;
  steps: number;
  tokens: TokenUsage;
  cost: number;
  activeDays: number;
  streak: number;
  activity: Array<{ date: string; steps: number }>;
  models: Array<{ model: ModelRef; steps: number; tokens: TokenUsage; cost: number }>;
};

// --- Events -----------------------------------------------------------------

export type OpenCodeEvent = {
  id?: string;
  created?: number;
  type: string;
  location?: LocationRef;
  durable?: { aggregateID: string; seq: number; version: number };
  data?: Record<string, unknown>;
};

export type PromptFileInput = {
  uri: string;
  name?: string;
  description?: string;
  mime?: string;
};

// --- Prompt stacking (session inbox) ---------------------------------------

export type InboxDelivery = "steer" | "queue";

/** A prompt the server holds until the running turn finishes ("stacked"). */
export type InboxItem = {
  id: string;
  sessionID: string;
  type: "user" | "synthetic" | "compaction" | "move";
  time: { created: number };
  delivery: InboxDelivery;
  payload?: {
    text?: string;
    description?: string;
    files?: Array<{ name?: string; mime?: string }>;
  };
};

// --- Session goal (/goal, OpenCode 2.2+) -----------------------------------

export type GoalStatus = "active" | "paused" | "complete";

export type SessionGoal = {
  id: string;
  objective: string;
  status: GoalStatus;
  reason?: string;
  rounds: number;
  maxRounds: number;
  stalls?: number;
  updatedAt: number;
};
