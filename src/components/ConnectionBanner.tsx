import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import { IonIcon } from "@ionic/react";
import { cloudOfflineOutline, keyOutline, settingsOutline, syncOutline } from "ionicons/icons";
import { useConnection } from "../core/store/connection";
import { useT } from "../core/i18n";
import { cn } from "../core/cn";

/** Prominent, app-wide banner for offline / unauthorized states. */
export function ConnectionBanner() {
  const t = useT();
  const navigate = useNavigate();
  const status = useConnection((s) => s.status);
  const authorized = useConnection((s) => s.authorized);
  const connect = useConnection((s) => s.connect);

  const kind: "offline" | "unauthorized" | "connecting" | null =
    status === "connecting"
      ? "connecting"
      : status !== "connected"
        ? "offline"
        : authorized === false
          ? "unauthorized"
          : null;

  return (
    <AnimatePresence>
      {kind && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="overflow-hidden"
        >
          <div
            className={cn(
              "flex items-center gap-2.5 border-b px-4 py-2.5 text-[13px]",
              kind === "unauthorized" ? "border-danger/40 bg-danger/10" : "border-warn/40 bg-warn/10",
            )}
          >
            <IonIcon
              icon={kind === "unauthorized" ? keyOutline : cloudOfflineOutline}
              className={cn("shrink-0 text-[18px]", kind === "unauthorized" ? "text-danger" : "text-warn")}
            />
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-fg">
                {kind === "unauthorized" ? t("conn.unauthorized.title") : kind === "connecting" ? t("status.connecting") : t("conn.offline.title")}
              </div>
              <div className="truncate text-[12px] text-muted">
                {kind === "unauthorized" ? t("conn.unauthorized.body") : t("conn.offline.body")}
              </div>
            </div>
            {kind === "connecting" ? (
              <IonIcon icon={syncOutline} className="shrink-0 animate-spin text-[18px] text-warn" />
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => void connect()}
                  className="shrink-0 rounded-lg border border-border px-2.5 py-1 text-[12px] font-medium text-fg"
                >
                  {t("common.retry")}
                </button>
                <button
                  type="button"
                  onClick={() => navigate("/settings")}
                  className="shrink-0 rounded-lg bg-accent px-2.5 py-1 text-[12px] font-semibold text-white"
                >
                  <IonIcon icon={settingsOutline} className="mr-1 text-[14px]" />
                  {t("conn.configure")}
                </button>
              </>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
