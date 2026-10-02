import { create } from "zustand";

export type DraftAttachment = { name: string; mime: string; uri: string; size: number };
type Draft = { text: string; attachments: DraftAttachment[] };

const KEY = "opencode-remote.drafts.v1";
/** Only persist attachments if the encoded payload stays small (localStorage quota). */
const MAX_ATTACH_BYTES = 1_000_000;

function load(): Record<string, Draft> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<string, Draft>;
  } catch {
    return {};
  }
}

function persist(drafts: Record<string, Draft>): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(drafts));
  } catch {
    /* quota */
  }
}

type DraftState = {
  drafts: Record<string, Draft>;
  save: (sessionID: string, text: string, attachments: DraftAttachment[]) => void;
  clear: (sessionID: string) => void;
};

/** Per-session composer drafts, persisted so a prompt survives an app crash/close. */
export const useDrafts = create<DraftState>((set, get) => ({
  drafts: load(),
  save: (sessionID, text, attachments) => {
    const total = attachments.reduce((n, a) => n + a.uri.length, 0);
    const stored = total <= MAX_ATTACH_BYTES ? attachments : [];
    const next = { ...get().drafts, [sessionID]: { text, attachments: stored } };
    persist(next);
    set({ drafts: next });
  },
  clear: (sessionID) => {
    const next = { ...get().drafts };
    delete next[sessionID];
    persist(next);
    set({ drafts: next });
  },
}));
