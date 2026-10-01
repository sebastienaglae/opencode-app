import { useEffect, useMemo, useRef, useState } from "react";
import { IonIcon, IonSpinner } from "@ionic/react";
import { useQuery } from "@tanstack/react-query";
import { addOutline, cameraOutline, closeCircle, paperPlaneOutline, stopCircleOutline } from "ionicons/icons";
import { Camera, CameraResultType, CameraSource } from "@capacitor/camera";
import { api } from "../core/api/opencode";
import { BUILTIN_COMMANDS } from "../core/builtinCommands";
import type { PromptFileInput } from "../core/types";
import { useConnection } from "../core/store/connection";
import { useT } from "../core/i18n";
import { cn } from "../core/cn";

export type Attachment = { name: string; mime: string; uri: string; size: number };

const MAX_BYTES = 20 * 1024 * 1024;
const MAX_HEIGHT = 168;

function fileToDataUrl(file: File): Promise<Attachment> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      resolve({ name: file.name, mime: file.type || "application/octet-stream", uri: String(reader.result), size: file.size });
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function Composer({
  running,
  onSend,
  onStop,
  onShell,
  modelLabel,
  agentLabel,
  onOpenModel,
  onOpenAgent,
}: {
  running: boolean;
  onSend: (text: string, files: PromptFileInput[]) => Promise<void> | void;
  onStop: () => void;
  onShell?: (command: string) => void;
  modelLabel?: string;
  agentLabel?: string;
  onOpenModel?: () => void;
  onOpenAgent?: () => void;
}) {
  const t = useT();
  const [text, setText] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const status = useConnection((s) => s.status);

  const { data: commands = [] } = useQuery({
    queryKey: ["commands"],
    queryFn: api.listCommands,
    enabled: status === "connected",
    retry: false,
    staleTime: 5 * 60_000,
  });

  const allCommands = useMemo(() => {
    const builtins = BUILTIN_COMMANDS.map((b) => ({ name: b.name, description: t(b.descKey) }));
    const known = new Set(builtins.map((b) => b.name));
    const extra = commands
      .filter((c) => !known.has(c.name))
      .map((c) => ({ name: c.name, description: c.description ?? "" }));
    return [...builtins, ...extra];
  }, [commands, t]);

  const commandQuery = useMemo(() => {
    const trimmed = text.trimStart();
    if (!trimmed.startsWith("/") || trimmed.includes(" ")) return null;
    return trimmed.slice(1).toLowerCase();
  }, [text]);

  const suggestions = useMemo(() => {
    if (commandQuery === null) return [];
    return allCommands.filter((c) => c.name.toLowerCase().includes(commandQuery)).slice(0, 20);
  }, [allCommands, commandQuery]);

  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    const next = Math.min(el.scrollHeight, MAX_HEIGHT);
    el.style.height = `${next}px`;
    el.style.overflowY = el.scrollHeight > MAX_HEIGHT ? "auto" : "hidden";
  }, [text]);

  const addFiles = async (files: FileList | null) => {
    if (!files) return;
    const added: Attachment[] = [];
    for (const file of Array.from(files)) {
      if (file.size > MAX_BYTES) {
        setError(`${file.name} > 20 Mo`);
        continue;
      }
      added.push(await fileToDataUrl(file));
    }
    if (added.length) setAttachments((prev) => [...prev, ...added]);
  };

  const pickCamera = async () => {
    try {
      const photo = await Camera.getPhoto({ resultType: CameraResultType.DataUrl, source: CameraSource.Prompt, quality: 90 });
      if (photo.dataUrl) {
        setAttachments((prev) => [
          ...prev,
          {
            name: photo.path?.split("/").pop() ?? `photo.${photo.format}`,
            mime: `image/${photo.format}`,
            uri: photo.dataUrl!,
            size: Math.round((photo.dataUrl!.length * 3) / 4),
          },
        ]);
      }
    } catch {
      /* cancelled */
    }
  };

  const submit = async () => {
    const trimmed = text.trim();
    if (sending) return;
    if (trimmed.startsWith("!") && trimmed.length > 1) {
      onShell?.(trimmed.slice(1).trim());
      setText("");
      return;
    }
    if ((!trimmed && attachments.length === 0)) return;
    setSending(true);
    setError(null);
    try {
      await onSend(trimmed, attachments.map((a) => ({ uri: a.uri, name: a.name, mime: a.mime })));
      setText("");
      setAttachments([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSending(false);
    }
  };

  const canSend = (text.trim().length > 0 || attachments.length > 0) && !sending;

  return (
    <div className="relative border-t border-border bg-bg px-3 pb-[calc(8px+env(safe-area-inset-bottom))] pt-2">
      {suggestions.length > 0 && (
        <div className="absolute bottom-full left-3 right-3 z-20 mb-1 max-h-64 overflow-y-auto oc-scroll rounded-xl border border-border bg-elevated shadow-xl">
          {suggestions.map((c) => (
            <button
              key={c.name}
              type="button"
              onClick={() => {
                setText(`/${c.name} `);
                taRef.current?.focus();
              }}
              className="flex w-full items-baseline gap-3 border-b border-border px-3 py-2.5 text-left last:border-b-0 active:bg-surface2"
            >
              <span className="shrink-0 font-mono text-[14px] font-semibold text-accent">/{c.name}</span>
              <span className="truncate text-[12.5px] text-muted">{c.description ?? ""}</span>
            </button>
          ))}
        </div>
      )}

      {attachments.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {attachments.map((a, i) => (
            <span key={i} className="inline-flex max-w-[190px] items-center gap-1.5 rounded-lg border border-border bg-surface2 px-2 py-1 text-[12px]">
              {a.mime.startsWith("image/") && <img src={a.uri} alt={a.name} className="h-7 w-7 rounded object-cover" />}
              <span className="truncate">{a.name}</span>
              <IonIcon
                icon={closeCircle}
                className="shrink-0 text-[15px] text-faint"
                onClick={() => setAttachments((prev) => prev.filter((_, idx) => idx !== i))}
              />
            </span>
          ))}
        </div>
      )}

      {error && <div className="pb-1.5 text-[12px] text-danger">{error}</div>}

      <textarea
        ref={taRef}
        rows={1}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={t("conv.input.placeholder")}
        className="block w-full resize-none overflow-hidden rounded-2xl border border-border bg-surface px-3.5 py-2.5 text-[15px] leading-6 text-fg outline-none transition-colors placeholder:text-faint focus:border-borderstrong"
      />

      <div className="mt-1.5 flex items-center gap-0.5">
        <input
          ref={fileInput}
          type="file"
          multiple
          hidden
          onChange={(e) => {
            void addFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <IconBtn onClick={() => fileInput.current?.click()} label={t("conv.attach")} icon={addOutline} />
        <IconBtn onClick={pickCamera} label={t("conv.camera")} icon={cameraOutline} />
        {modelLabel !== undefined && (
          <button
            type="button"
            onClick={onOpenModel}
            className="ml-1 min-w-0 max-w-[42%] truncate rounded-full border border-border bg-surface2 px-3 py-1.5 text-[12.5px] font-medium text-fg active:bg-surface"
          >
            {modelLabel || t("conv.model")}
          </button>
        )}
        {agentLabel !== undefined && (
          <button
            type="button"
            onClick={onOpenAgent}
            className="min-w-0 max-w-[26%] truncate rounded-full border border-border bg-surface2 px-3 py-1.5 text-[12.5px] font-medium text-muted active:bg-surface"
          >
            {agentLabel || t("conv.agent")}
          </button>
        )}
        <span className="flex-1" />
        {running && <IconBtn onClick={onStop} label={t("conv.stop")} icon={stopCircleOutline} className="text-danger" />}
        <button
          type="button"
          disabled={!canSend}
          onClick={submit}
          aria-label={t("conv.send")}
          className={cn(
            "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[22px] transition-colors",
            canSend ? "text-accent" : "text-faint opacity-50",
          )}
        >
          {sending ? <IonSpinner name="crescent" style={{ width: 20, height: 20 }} /> : <IonIcon icon={paperPlaneOutline} />}
        </button>
      </div>
    </div>
  );
}

function IconBtn({ icon, label, onClick, className }: { icon: string; label: string; onClick: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={cn("inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[22px] text-muted active:bg-surface2", className)}
    >
      <IonIcon icon={icon} />
    </button>
  );
}
