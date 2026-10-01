/** Built-in OpenCode slash commands (client-side + server commands).
 * `descKey` is an i18n key; `server` commands are executed via POST /command. */
export type BuiltinCommand = {
  name: string;
  descKey: string;
  server?: boolean;
};

export const BUILTIN_COMMANDS: BuiltinCommand[] = [
  { name: "init", descKey: "cmd.init", server: true },
  { name: "review", descKey: "cmd.review", server: true },
  { name: "new", descKey: "cmd.new" },
  { name: "undo", descKey: "cmd.undo" },
  { name: "compact", descKey: "cmd.compact" },
  { name: "fork", descKey: "cmd.fork" },
  { name: "export", descKey: "cmd.export" },
  { name: "open", descKey: "cmd.open" },
  { name: "terminal", descKey: "cmd.terminal" },
  { name: "pty", descKey: "cmd.pty" },
  { name: "mcp", descKey: "cmd.mcp" },
  { name: "model", descKey: "cmd.model" },
  { name: "connect", descKey: "cmd.connect" },
  { name: "agents", descKey: "cmd.agents" },
  { name: "skills", descKey: "cmd.skills" },
  { name: "share", descKey: "cmd.share" },
  { name: "help", descKey: "cmd.help" },
];
