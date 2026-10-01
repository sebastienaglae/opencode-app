import { useEffect } from "react";
import { eventStream } from "../core/events";
import { ensureNotificationPermission, notify } from "../core/notify";
import { useSessions } from "../core/store/sessions";
import { useT } from "../core/i18n";
import type { FormInfo } from "../core/types";

/** Local notifications: permission prompts, questions/permissions, and
 *  "session finished" alerts. */
export function useNotifications(): void {
  const t = useT();
  useEffect(() => {
    void ensureNotificationPermission();
    return eventStream.onEvent((event) => {
      const data = (event.data ?? {}) as Record<string, unknown>;
      const sid = data.sessionID as string | undefined;
      const title = (sid && useSessions.getState().list.find((s) => s.id === sid)?.title) || "OpenCode";

      if (event.type === "permission.asked") {
        void notify(t("notif.permission.title"), String(data.action ?? t("notif.permission.body")));
      } else if (event.type === "form.created") {
        const form = data.form as FormInfo | undefined;
        void notify(t("notif.question.title"), form?.title ?? t("notif.question.body"));
      } else if (event.type === "session.execution.succeeded") {
        void notify(t("notif.finished.title"), t("notif.finished.body", { title }));
      } else if (event.type === "session.execution.failed") {
        void notify(t("notif.failed.title"), title);
      }
    });
  }, [t]);
}
