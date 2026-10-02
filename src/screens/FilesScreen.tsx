import { useEffect, useMemo, useState } from "react";
import { IonIcon, IonSpinner } from "@ionic/react";
import { useQuery } from "@tanstack/react-query";
import { arrowBackOutline, chevronForwardOutline, documentOutline, folderOutline, swapHorizontalOutline } from "ionicons/icons";
import { api } from "../core/api/opencode";
import { useSessions } from "../core/store/sessions";
import { useConnection } from "../core/store/connection";
import { useT } from "../core/i18n";
import { useViewer } from "../core/navigation";
import { CodeBlock } from "../components/CodeBlock";
import { Sheet } from "../components/Sheet";
import { AppHeader } from "../components/AppHeader";
import { basename } from "../core/format";

const EXT_LANG: Record<string, string> = {
  ts: "ts", tsx: "tsx", js: "js", jsx: "jsx", json: "json", jsonc: "jsonc", md: "markdown", mdx: "markdown",
  css: "css", scss: "css", html: "html", htm: "html", py: "python", go: "go", rs: "rust", java: "java",
  c: "c", h: "c", cpp: "cpp", cs: "csharp", rb: "ruby", php: "php", sh: "bash", bash: "bash", zsh: "bash",
  ps1: "bash", yml: "yaml", yaml: "yaml", toml: "toml", sql: "sql", xml: "xml", vue: "vue", svelte: "svelte",
  swift: "swift", kt: "kotlin", lua: "lua", dart: "dart", diff: "diff", patch: "diff", env: "bash",
};
const IMAGE_EXT = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "avif", "ico"]);

function ext(path: string): string {
  return path.split(".").pop()?.toLowerCase() ?? "";
}

function ImagePreview({ path, directory }: { path: string; directory?: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    let objectUrl: string | null = null;
    api
      .fsReadBlob(path, directory)
      .then((blob) => {
        objectUrl = URL.createObjectURL(blob);
        if (alive) setUrl(objectUrl);
      })
      .catch((e) => alive && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      alive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [path, directory]);
  if (error) return <div className="p-8 text-center text-[13px] text-danger">{error}</div>;
  if (!url) return <div className="flex justify-center p-8"><IonSpinner name="crescent" /></div>;
  return <img src={url} alt={basename(path)} className="mx-auto max-h-[70vh] rounded-lg object-contain" />;
}

export default function FilesScreen() {
  const t = useT();
  const status = useConnection((s) => s.status);
  const sessions = useSessions((s) => s.list);

  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: () => api.listProjects(),
    enabled: status === "connected",
    retry: false,
  });

  const [directory, setDirectory] = useState<string | undefined>(undefined);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [stack, setStack] = useState<Array<string | undefined>>([undefined]);
  const current = stack[stack.length - 1];
  const [openFile, setOpenFile] = useState<string | null>(null);

  useEffect(() => {
    if (directory === undefined) {
      const first = sessions.find((s) => s.location?.directory)?.location.directory ?? projects.find((p) => p.canonical)?.canonical;
      if (first) setDirectory(first);
    }
  }, [sessions, projects, directory]);

  useEffect(() => setStack([undefined]), [directory]);

  const pendingFile = useViewer((s) => s.pendingFile);
  const pendingDir = useViewer((s) => s.pendingDir);
  const clearPending = useViewer((s) => s.clear);
  useEffect(() => {
    if (pendingFile) {
      if (pendingDir) setDirectory(pendingDir);
      setOpenFile(pendingFile);
      clearPending();
    }
  }, [pendingFile, pendingDir, clearPending]);

  const { data: entries = [], isLoading, error } = useQuery({
    queryKey: ["fs", directory, current],
    queryFn: () => api.fsList(current, directory),
    enabled: status === "connected",
    retry: false,
  });

  const projectOptions = useMemo(() => {
    const withSessions = new Set(sessions.map((s) => s.projectID));
    const seen = new Set<string>();
    const opts: Array<{ path: string; name: string }> = [];
    for (const p of projects) {
      if (!p.canonical || seen.has(p.canonical)) continue;
      if (!withSessions.has(p.id) && p.vcs !== "git") continue;
      seen.add(p.canonical);
      opts.push({ path: p.canonical, name: p.name || basename(p.canonical) });
    }
    return opts.sort((a, b) => a.name.localeCompare(b.name));
  }, [projects, sessions]);

  const isImage = openFile ? IMAGE_EXT.has(ext(openFile)) : false;
  const lang = openFile ? EXT_LANG[ext(openFile)] : undefined;

  const { data: fileContent, isLoading: fileLoading } = useQuery({
    queryKey: ["fs-read", directory, openFile],
    queryFn: () => api.fsReadText(openFile!, directory),
    enabled: Boolean(openFile) && !isImage && status === "connected",
    retry: false,
  });

  return (
    <div className="flex h-full flex-col bg-bg">
      <AppHeader
        left={
          stack.length > 1 ? (
            <button type="button" onClick={() => setStack((s) => s.slice(0, -1))} className="p-1.5 text-muted active:text-fg" aria-label={t("common.back")}>
              <IonIcon icon={arrowBackOutline} className="text-[20px]" />
            </button>
          ) : undefined
        }
        subtitle={current ? basename(current) : t("files.title")}
        right={
          <button type="button" onClick={() => setPickerOpen(true)} className="flex items-center gap-1 p-1.5 text-muted active:text-fg" aria-label={t("files.chooseProject")}>
            <IonIcon icon={swapHorizontalOutline} className="text-[18px]" />
          </button>
        }
      />

      <div className="oc-scroll min-h-0 flex-1 overflow-y-auto">
        {status !== "connected" ? (
          <div className="p-10 text-center text-[13px] text-muted">{t("files.noConnection")}</div>
        ) : isLoading ? (
          <div className="flex justify-center p-10">
            <IonSpinner name="crescent" />
          </div>
        ) : error ? (
          <div className="p-10 text-center text-[13px] text-danger">{(error as Error).message}</div>
        ) : entries.length === 0 ? (
          <div className="p-10 text-center text-[13px] text-muted">{t("files.empty")}</div>
        ) : (
          <div className="py-1">
            {entries
              .slice()
              .sort((a, b) => (a.type === b.type ? a.path.localeCompare(b.path) : a.type === "directory" ? -1 : 1))
              .map((entry) => (
                <button
                  key={entry.path}
                  type="button"
                  onClick={() => (entry.type === "directory" ? setStack((s) => [...s, entry.path]) : setOpenFile(entry.path))}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-left active:bg-surface2"
                >
                  <IonIcon icon={entry.type === "directory" ? folderOutline : documentOutline} className="text-[18px] text-muted" />
                  <span className="min-w-0 flex-1 truncate font-mono text-[13px] text-fg">{basename(entry.path)}</span>
                  {entry.type === "directory" && <IonIcon icon={chevronForwardOutline} className="text-[16px] text-faint" />}
                </button>
              ))}
          </div>
        )}
      </div>

      <Sheet open={pickerOpen} onClose={() => setPickerOpen(false)} title={t("files.chooseProject")}>
        <div className="flex flex-col p-2">
          {projectOptions.map((p) => (
            <button
              key={p.path}
              type="button"
              onClick={() => {
                setDirectory(p.path);
                setPickerOpen(false);
              }}
              className={`rounded-lg px-3 py-3 text-left active:bg-surface2 ${directory === p.path ? "bg-accentsoft" : ""}`}
            >
              <div className="text-[15px] font-medium text-fg">{p.name}</div>
              <div className="mt-0.5 truncate font-mono text-[11.5px] text-faint">{p.path}</div>
            </button>
          ))}
        </div>
      </Sheet>

      <Sheet
        open={openFile !== null}
        onClose={() => setOpenFile(null)}
        title={<span className="font-mono text-[13px]">{openFile ? basename(openFile) : ""}</span>}
      >
        <div className="p-3">
          {isImage ? (
            <ImagePreview path={openFile!} directory={directory} />
          ) : fileLoading ? (
            <div className="flex justify-center p-8">
              <IonSpinner name="crescent" />
            </div>
          ) : fileContent && fileContent.includes("\u0000") ? (
            <div className="p-8 text-center text-[13px] text-muted">{t("files.binary")}</div>
          ) : (
            <CodeBlock code={fileContent ?? ""} lang={lang} />
          )}
        </div>
      </Sheet>
    </div>
  );
}
