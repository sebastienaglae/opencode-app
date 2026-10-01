import { Capacitor, registerPlugin } from "@capacitor/core";

export type SessionWidgetState = { running: number; finished: number; project: string; startedAt: number };

type SessionWidgetPlugin = {
  updateState(state: SessionWidgetState): Promise<void>;
};

const plugin = registerPlugin<SessionWidgetPlugin>("SessionWidget");

/** Updates the Android home-screen widget (no-op on web). */
export async function updateSessionWidget(state: SessionWidgetState): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await plugin.updateState(state);
  } catch {
    /* widget plugin unavailable */
  }
}
