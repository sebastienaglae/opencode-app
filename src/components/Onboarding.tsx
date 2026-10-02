import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { IonIcon, IonSpinner } from "@ionic/react";
import { notificationsOutline, shieldCheckmarkOutline } from "ionicons/icons";
import { useSettings } from "../core/store/settings";
import { useT } from "../core/i18n";
import { ensureNotificationPermission } from "../core/notify";
import { Mark } from "./Mark";

/** First-launch landing that requests permissions. */
export function Onboarding() {
  const t = useT();
  const onboarded = useSettings((s) => s.onboarded);
  const update = useSettings((s) => s.update);
  const [busy, setBusy] = useState(false);

  const finish = async (grant: boolean) => {
    setBusy(true);
    if (grant) await ensureNotificationPermission();
    update({ onboarded: true });
    setBusy(false);
  };

  return (
    <AnimatePresence>
      {!onboarded && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[90] flex flex-col items-center justify-center gap-6 bg-bg px-8 text-center"
        >
          <Mark className="h-14 w-11 text-accent" />
          <div>
            <h1 className="text-[20px] font-bold text-fg">{t("onboarding.title")}</h1>
            <p className="mt-2 max-w-sm text-[14px] leading-relaxed text-muted">{t("onboarding.body")}</p>
          </div>
          <div className="flex w-full max-w-sm flex-col gap-2.5">
            <button
              type="button"
              disabled={busy}
              onClick={() => void finish(true)}
              className="flex items-center justify-center gap-2 rounded-xl bg-accent py-3 text-[15px] font-semibold text-white disabled:opacity-60"
            >
              {busy ? <IonSpinner name="crescent" /> : <IonIcon icon={notificationsOutline} className="text-[18px]" />}
              {t("onboarding.enable")}
            </button>
            <button type="button" onClick={() => void finish(false)} className="rounded-xl py-2.5 text-[14px] font-medium text-muted">
              {t("onboarding.skip")}
            </button>
          </div>
          <div className="flex max-w-sm items-start gap-2 text-left text-[12px] text-faint">
            <IonIcon icon={shieldCheckmarkOutline} className="mt-0.5 shrink-0 text-[15px]" />
            <span>{t("onboarding.notifications")}</span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
