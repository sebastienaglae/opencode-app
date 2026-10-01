import { AnimatePresence, motion } from "motion/react";
import { IonIcon } from "@ionic/react";
import { alertCircleOutline, checkmarkCircleOutline, informationCircleOutline } from "ionicons/icons";
import { useToast } from "../core/store/toast";
import { cn } from "../core/cn";

export function Toaster() {
  const toasts = useToast((s) => s.toasts);
  const dismiss = useToast((s) => s.dismiss);
  return (
    <div className="pointer-events-none fixed inset-x-0 top-[calc(10px+env(safe-area-inset-top))] z-[100] flex flex-col items-center gap-2 px-4">
      <AnimatePresence initial={false}>
        {toasts.map((t) => (
          <motion.button
            key={t.id}
            type="button"
            layout
            initial={{ opacity: 0, y: -16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12, scale: 0.96 }}
            transition={{ type: "spring", damping: 26, stiffness: 320 }}
            onClick={() => dismiss(t.id)}
            className={cn(
              "pointer-events-auto flex max-w-[92%] items-center gap-2 rounded-xl border px-3.5 py-2.5 text-[13px] shadow-lg backdrop-blur",
              t.type === "success" && "border-success/40 bg-success/15 text-fg",
              t.type === "error" && "border-danger/40 bg-danger/15 text-fg",
              t.type === "info" && "border-border bg-elevated/95 text-fg",
            )}
          >
            <IonIcon
              icon={t.type === "success" ? checkmarkCircleOutline : t.type === "error" ? alertCircleOutline : informationCircleOutline}
              className={cn("shrink-0 text-[17px]", t.type === "success" && "text-success", t.type === "error" && "text-danger", t.type === "info" && "text-accent")}
            />
            <span className="min-w-0 text-left">{t.message}</span>
          </motion.button>
        ))}
      </AnimatePresence>
    </div>
  );
}
