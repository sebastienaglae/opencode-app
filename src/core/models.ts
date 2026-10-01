import type { ModelInfo, ModelRef } from "./types";

const PROVIDER_LABELS: Record<string, string> = {
  "opencode-go": "OpenCode Go",
  opencode: "OpenCode",
  anthropic: "Anthropic",
  openai: "OpenAI",
  google: "Google",
  "github-copilot": "GitHub Copilot",
  "opencode-zen": "OpenCode Zen",
};

export function providerLabel(id: string | undefined): string {
  if (!id) return "";
  return PROVIDER_LABELS[id] ?? id;
}

/** OpenCode Go first, then OpenCode, then everything else alphabetically. */
export function providerRank(id: string): number {
  if (id === "opencode-go") return 0;
  if (id === "opencode") return 1;
  if (id.startsWith("opencode")) return 2;
  return 10;
}

export function sortProviders(a: string, b: string): number {
  return providerRank(a) - providerRank(b) || a.localeCompare(b);
}

export function modelLabel(model: ModelRef | undefined, models: ModelInfo[]): string {
  if (!model) return "";
  const info = models.find((m) => m.modelID === model.id && m.providerID === model.providerID);
  const name = info?.name ?? model.id;
  const base = `${providerLabel(model.providerID)} · ${name}`;
  return model.variant ? `${base} · ${model.variant}` : base;
}

type Translator = (key: string, vars?: Record<string, string | number>) => string;

export function effortLabel(variant: string | undefined, t: Translator): string {
  if (!variant) return "";
  const key = `effort.${variant.toLowerCase().replace(/[^a-z]/g, "")}`;
  const translated = t(key);
  return translated === key ? variant : translated;
}

export function statusLabel(status: string | undefined, t: Translator): string {
  if (!status) return "";
  const key = `model.status.${status}`;
  const translated = t(key);
  return translated === key ? status : translated;
}
