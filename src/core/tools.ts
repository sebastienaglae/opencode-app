import type { ToolPart } from "./types";

const LABEL_KEYS: Record<string, string> = {
  shell: "tool.shell",
  bash: "tool.bash",
  read: "tool.read",
  edit: "tool.edit",
  write: "tool.write",
  webfetch: "tool.webfetch",
  grep: "tool.grep",
  glob: "tool.glob",
  list: "tool.list",
  task: "tool.task",
  todowrite: "tool.todo",
  todo: "tool.todo",
  patch: "tool.patch",
};

export function toolLabelKey(name: string | undefined): string {
  if (!name) return "tool.other";
  return LABEL_KEYS[name.toLowerCase()] ?? "tool.other";
}

export function toolInputObject(part: ToolPart): Record<string, unknown> {
  const state = part.state;
  if (state.status === "streaming") {
    try {
      return JSON.parse(state.input || "{}") as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  return (state.input as Record<string, unknown>) ?? {};
}

/** One-line summary shown next to the tool name (command, path, url…). */
export function toolSummary(part: ToolPart): string {
  const input = toolInputObject(part);
  const name = (part.name ?? "").toLowerCase();
  const str = (v: unknown) => (typeof v === "string" ? v : undefined);

  const pick = (...keys: string[]): string | undefined => {
    for (const k of keys) {
      const v = input[k];
      if (typeof v === "string" && v) return v;
    }
    return undefined;
  };

  switch (name) {
    case "shell":
    case "bash":
      return pick("command", "cmd") ?? "";
    case "read":
    case "write":
    case "edit":
      return pick("filePath", "file_path", "path", "file") ?? "";
    case "webfetch":
      return pick("url") ?? "";
    case "grep":
      return [pick("pattern"), pick("path")].filter(Boolean).join("  ·  ");
    case "glob":
      return [pick("pattern"), pick("path")].filter(Boolean).join("  ·  ");
    case "list":
      return pick("path") ?? "";
    case "task":
      return pick("description") ?? "";
    case "todowrite":
      return "";
    default: {
      const first = Object.values(input).find((v) => typeof v === "string" && v) as string | undefined;
      return str(first) ?? "";
    }
  }
}

export function toolResultText(part: ToolPart): string {
  const state = part.state;
  if (state.status !== "completed" && state.status !== "error") return "";
  return (state.content ?? [])
    .map((c) => ("text" in c && c.text ? c.text : c.type === "file" ? `[file] ${c.path ?? ""}` : ""))
    .join("\n");
}

export type ToolField = { labelKey: string; value: string; lang?: string; kind?: "code" | "text" | "diff" };

function str(v: unknown): string {
  if (v == null) return "";
  return typeof v === "string" ? v : JSON.stringify(v);
}

function simpleDiff(oldStr: string, newStr: string): string {
  const out: string[] = [];
  if (oldStr) for (const l of oldStr.split("\n")) out.push(`-${l}`);
  if (newStr) for (const l of newStr.split("\n")) out.push(`+${l}`);
  return out.join("\n");
}

/** Readable, mapped fields for a tool call (avoids dumping raw JSON). */
export function toolFields(part: ToolPart): ToolField[] {
  const input = toolInputObject(part);
  const name = (part.name ?? "").toLowerCase();
  const get = (k: string) => str(input[k]);
  const fields: ToolField[] = [];

  switch (name) {
    case "shell":
    case "bash":
      if (get("command")) fields.push({ labelKey: "tool.command", value: get("command"), lang: "shellscript" });
      break;
    case "read":
      if (get("filePath")) fields.push({ labelKey: "tool.file", value: get("filePath"), lang: "text" });
      break;
    case "edit":
      if (get("filePath")) fields.push({ labelKey: "tool.file", value: get("filePath"), lang: "text" });
      if (get("oldString") || get("newString"))
        fields.push({ labelKey: "tool.diff", value: simpleDiff(get("oldString"), get("newString")), kind: "diff" });
      break;
    case "write":
      if (get("filePath")) fields.push({ labelKey: "tool.file", value: get("filePath"), lang: "text" });
      if (get("content")) fields.push({ labelKey: "tool.content", value: get("content"), kind: "code" });
      break;
    case "webfetch":
      if (get("url")) fields.push({ labelKey: "tool.url", value: get("url") });
      break;
    case "grep":
    case "glob":
      if (get("pattern")) fields.push({ labelKey: "tool.pattern", value: get("pattern") });
      if (get("path")) fields.push({ labelKey: "tool.path", value: get("path") });
      break;
    case "list":
      if (get("path")) fields.push({ labelKey: "tool.path", value: get("path") });
      break;
    case "task":
      if (get("description")) fields.push({ labelKey: "tool.description", value: get("description") });
      if (get("prompt")) fields.push({ labelKey: "tool.prompt", value: get("prompt"), kind: "text" });
      break;
    case "todowrite": {
      const todos = input["todos"];
      if (Array.isArray(todos))
        fields.push({
          labelKey: "tool.todo",
          value: todos.map((td) => `[${(td as { status?: string })?.status ?? ""}] ${(td as { content?: string })?.content ?? ""}`).join("\n"),
          kind: "text",
        });
      break;
    }
    default: {
      for (const [k, v] of Object.entries(input)) {
        if (typeof v === "string" && v.length > 0 && v.length < 4000) {
          fields.push({ labelKey: `#${k}`, value: v, kind: v.length > 200 ? "code" : "text" });
        } else if (typeof v === "number" || typeof v === "boolean") {
          fields.push({ labelKey: `#${k}`, value: String(v) });
        }
      }
    }
  }
  return fields;
}
