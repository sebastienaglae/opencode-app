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
