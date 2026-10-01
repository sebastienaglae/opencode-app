import { useEffect } from "react";
import { eventStream } from "../core/events";
import { notify } from "../core/notify";
import { useT } from "../core/i18n";
import type { FormInfo } from "../core/types";

/** Surfaces permission requests and questions as local notifications. */
export function useNotifications(): void {
  const t = useT();
  useEffect(() => {
    return eventStream.onEvent((event) => {
      const data = (event.data ?? {}) as Record<string, unknown>;
      if (event.type === "permission.asked") {
        void notify(t("notif.permission.title"), String(data.action ?? t("notif.permission.body")));
      } else if (event.type === "form.created") {
        const form = data.form as FormInfo | undefined;
        void notify(t("notif.question.title"), form?.title ?? t("notif.question.body"));
      }
    });
  }, [t]);
}
