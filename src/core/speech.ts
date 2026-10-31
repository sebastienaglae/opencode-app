import { Capacitor, registerPlugin } from "@capacitor/core";

/**
 * Dictation for the composer.
 *
 * Native (Android/iOS-capable) path uses the in-app `Speech` plugin, which wraps
 * `android.speech.SpeechRecognizer`. On the web we fall back to the Web Speech
 * API when the browser exposes it.
 */

type NativeSpeech = {
  available(): Promise<{ available: boolean }>;
  start(opts?: { language?: string; offline?: boolean }): Promise<{ listening: boolean }>;
  stop(): Promise<void>;
  cancel(): Promise<void>;
  addListener(
    event: "partial" | "result" | "state" | "error",
    cb: (data: { text?: string; listening?: boolean; message?: string; code?: number }) => void,
  ): Promise<{ remove: () => Promise<void> }>;
};

const Native = registerPlugin<NativeSpeech>("Speech");

export type DictationHandlers = {
  onPartial?: (text: string) => void;
  onResult?: (text: string) => void;
  onState?: (listening: boolean) => void;
  onError?: (message: string) => void;
};

export type Dictation = {
  /** Stops listening but keeps the final transcript. */
  stop: () => void;
  /** Stops listening and discards the transcript. */
  cancel: () => void;
};

/** BCP-47 tag for the recognizer from the app language. */
export function speechLanguage(lang: string): string {
  if (lang === "fr") return "fr-FR";
  if (lang === "ja") return "ja-JP";
  return "en-US";
}

export async function speechAvailable(): Promise<boolean> {
  if (Capacitor.isNativePlatform()) {
    try {
      const res = await Native.available();
      return Boolean(res?.available);
    } catch {
      return false;
    }
  }
  return webRecognition() !== null;
}

type WebRecognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: any) => void) | null;
  onerror: ((event: any) => void) | null;
  onend: (() => void) | null;
};

function webRecognition(): { new (): WebRecognition } | null {
  const w = window as unknown as {
    SpeechRecognition?: { new (): WebRecognition };
    webkitSpeechRecognition?: { new (): WebRecognition };
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export async function startDictation(
  handlers: DictationHandlers,
  opts: { language?: string } = {},
): Promise<Dictation> {
  const lang = opts.language ?? "en-US";

  if (Capacitor.isNativePlatform()) {
    let released = false;
    let subs: Array<{ remove: () => Promise<void> }> = [];
    const cleanup = () => {
      if (released) return;
      released = true;
      void Promise.all(subs.map((s) => s.remove())).catch(() => undefined);
    };
    subs = await Promise.all([
      Native.addListener("partial", (d) => d.text && handlers.onPartial?.(d.text)),
      Native.addListener("result", (d) => d.text && handlers.onResult?.(d.text)),
      Native.addListener("state", (d) => {
        handlers.onState?.(Boolean(d.listening));
        if (!d.listening) cleanup();
      }),
      Native.addListener("error", (d) => {
        handlers.onState?.(false);
        handlers.onError?.(d.message ?? `error ${d.code ?? ""}`.trim());
        cleanup();
      }),
    ]);
    try {
      await Native.start({ language: lang });
    } catch (err) {
      cleanup();
      throw err;
    }
    return {
      stop: () => {
        void Native.stop().catch(() => undefined);
      },
      cancel: () => {
        void Native.cancel()
          .catch(() => undefined)
          .finally(cleanup);
      },
    };
  }

  const Recognition = webRecognition();
  if (!Recognition) throw new Error("unavailable");
  const rec = new Recognition();
  rec.lang = lang;
  rec.continuous = false;
  rec.interimResults = true;
  rec.onresult = (event: any) => {
    let finalText = "";
    let interim = "";
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i];
      if (result.isFinal) finalText += result[0]?.transcript ?? "";
      else interim += result[0]?.transcript ?? "";
    }
    if (interim) handlers.onPartial?.(interim);
    if (finalText) handlers.onResult?.(finalText);
  };
  rec.onerror = (event: any) => {
    handlers.onState?.(false);
    handlers.onError?.(String(event?.error ?? "error"));
  };
  rec.onend = () => handlers.onState?.(false);
  rec.start();
  handlers.onState?.(true);
  return {
    stop: () => {
      try {
        rec.stop();
      } catch {
        /* already stopped */
      }
    },
    cancel: () => {
      try {
        rec.abort();
      } catch {
        /* already stopped */
      }
    },
  };
}
