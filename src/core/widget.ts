import { Capacitor, registerPlugin } from "@capacitor/core";

export type WidgetSession = { project: string; startedAt: number };
export type SessionWidgetState = {
  running: number;
  finished: number;
  project: string;
  startedAt: number;
  sessions: WidgetSession[];
};

type SessionWidgetPlugin = {
  updateState(state: {
    running: number;
    finished: number;
    project: string;
    startedAt: number;
    sessions: string;
  }): Promise<void>;
};

const plugin = registerPlugin<SessionWidgetPlugin>("SessionWidget");

/** Updates the Android home-screen widget (no-op on web). */
export async function updateSessionWidget(state: SessionWidgetState): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await plugin.updateState({
      running: state.running,
      finished: state.finished,
      project: state.project,
      startedAt: state.startedAt,
      sessions: JSON.stringify(state.sessions),
    });
  } catch {
    /* widget plugin unavailable */
  }
}
