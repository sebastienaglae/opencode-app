import { useEffect, useState } from "react";
import { createBundledHighlighter } from "shiki/core";
import { createOnigurumaEngine } from "shiki/engine/oniguruma";
import { useSettings } from "../core/store/settings";
import { useT } from "../core/i18n";

const LANGS = {
  javascript: () => import("@shikijs/langs/javascript"),
  typescript: () => import("@shikijs/langs/typescript"),
  tsx: () => import("@shikijs/langs/tsx"),
  jsx: () => import("@shikijs/langs/jsx"),
  json: () => import("@shikijs/langs/json"),
  jsonc: () => import("@shikijs/langs/jsonc"),
  shellscript: () => import("@shikijs/langs/shellscript"),
  python: () => import("@shikijs/langs/python"),
  go: () => import("@shikijs/langs/go"),
  rust: () => import("@shikijs/langs/rust"),
  ruby: () => import("@shikijs/langs/ruby"),
  java: () => import("@shikijs/langs/java"),
  c: () => import("@shikijs/langs/c"),
  cpp: () => import("@shikijs/langs/cpp"),
  csharp: () => import("@shikijs/langs/csharp"),
  css: () => import("@shikijs/langs/css"),
  html: () => import("@shikijs/langs/html"),
  xml: () => import("@shikijs/langs/xml"),
  yaml: () => import("@shikijs/langs/yaml"),
  toml: () => import("@shikijs/langs/toml"),
  sql: () => import("@shikijs/langs/sql"),
  markdown: () => import("@shikijs/langs/markdown"),
  diff: () => import("@shikijs/langs/diff"),
  dockerfile: () => import("@shikijs/langs/dockerfile"),
  ini: () => import("@shikijs/langs/ini"),
  graphql: () => import("@shikijs/langs/graphql"),
  php: () => import("@shikijs/langs/php"),
  swift: () => import("@shikijs/langs/swift"),
  kotlin: () => import("@shikijs/langs/kotlin"),
  lua: () => import("@shikijs/langs/lua"),
  dart: () => import("@shikijs/langs/dart"),
  vue: () => import("@shikijs/langs/vue"),
  svelte: () => import("@shikijs/langs/svelte"),
};

const THEMES = {
  "github-dark-default": () => import("@shikijs/themes/github-dark-default"),
  "github-light-default": () => import("@shikijs/themes/github-light-default"),
};

const createHighlighter = createBundledHighlighter({
  langs: LANGS,
  themes: THEMES,
  engine: () => createOnigurumaEngine(import("shiki/wasm")),
});

type Highlighter = Awaited<ReturnType<typeof createHighlighter>>;
let highlighterPromise: Promise<Highlighter> | null = null;

function getHighlighter(): Promise<Highlighter> {
  highlighterPromise ??= createHighlighter({ themes: Object.keys(THEMES), langs: Object.keys(LANGS) });
  return highlighterPromise;
}

const ALIASES: Record<string, string> = {
  js: "javascript", ts: "typescript", py: "python", sh: "shellscript", bash: "shellscript",
  zsh: "shellscript", shell: "shellscript", yml: "yaml", md: "markdown", rs: "rust",
  rb: "ruby", cs: "csharp", kt: "kotlin", docker: "dockerfile", plaintext: "text",
};

export function CodeBlock({ code, lang, plain }: { code: string; lang?: string; plain?: boolean }) {
  const theme = useSettings((s) => s.theme);
  const t = useT();
  const [html, setHtml] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (plain) return;
    let alive = true;
    const dark = document.documentElement.getAttribute("data-theme") === "dark";
    getHighlighter()
      .then((hl) => {
        const normalized = (lang ?? "").toLowerCase();
        const mapped = ALIASES[normalized] ?? normalized;
        const loaded = hl.getLoadedLanguages();
        const use = mapped && (mapped === "text" || loaded.includes(mapped)) ? mapped : "text";
        const out = hl.codeToHtml(code, { lang: use, theme: dark ? "github-dark-default" : "github-light-default" });
        if (alive) setHtml(out);
      })
      .catch(() => alive && setHtml(null));
    return () => {
      alive = false;
    };
  }, [code, lang, theme, plain]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="oc-code group relative">
      <button
        type="button"
        onClick={copy}
        className="absolute right-2 top-2 z-10 rounded-md border border-border bg-surface/90 px-2 py-0.5 text-[11px] font-medium text-muted opacity-0 transition-opacity group-hover:opacity-100 active:opacity-100"
      >
        {copied ? t("common.copied") : t("common.copy")}
      </button>
      {!plain && html ? (
        <div dangerouslySetInnerHTML={{ __html: html }} />
      ) : (
        <pre>
          <code>{code}</code>
        </pre>
      )}
    </div>
  );
}
