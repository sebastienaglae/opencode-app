import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { IonIcon } from "@ionic/react";
import { closeOutline } from "ionicons/icons";
import jsQR from "jsqr";
import { Camera } from "@capacitor/camera";
import { useT } from "../core/i18n";

/** Full-screen real-time QR scanner (camera stream + jsQR). */
export function QrScanner({
  open,
  onClose,
  onResult,
}: {
  open: boolean;
  onClose: () => void;
  onResult: (text: string) => void;
}) {
  const t = useT();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let stream: MediaStream | null = null;
    let raf = 0;
    let cancelled = false;
    const canvas = document.createElement("canvas");
    setError(null);

    const start = async () => {
      try {
        await Camera.requestPermissions({ permissions: ["camera"] }).catch(() => undefined);
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((tr) => tr.stop());
          return;
        }
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        video.setAttribute("playsinline", "true");
        await video.play().catch(() => undefined);

        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) return;

        const tick = () => {
          if (cancelled) return;
          const v = videoRef.current;
          if (v && v.readyState === v.HAVE_ENOUGH_DATA && v.videoWidth > 0) {
            canvas.width = v.videoWidth;
            canvas.height = v.videoHeight;
            ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
            const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const res = jsQR(img.data, img.width, img.height);
            if (res?.data) {
              onResult(res.data);
              return;
            }
          }
          raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    };
    void start();

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((tr) => tr.stop());
    };
  }, [open, onResult]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[110] flex flex-col bg-black"
        >
          <div className="pt-safe flex items-center justify-between px-4 py-3">
            <span className="text-[15px] font-semibold text-white">{t("scan.title")}</span>
            <button type="button" onClick={onClose} aria-label={t("common.close")} className="p-1 text-white">
              <IonIcon icon={closeOutline} className="text-[24px]" />
            </button>
          </div>

          <div className="relative flex-1 overflow-hidden">
            <video ref={videoRef} className="h-full w-full object-cover" muted playsInline />
            {!error && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="h-56 w-56 rounded-2xl border-2 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]" />
              </div>
            )}
            {error && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-8 text-center">
                <span className="text-[14px] text-danger">{t("scan.permission")}</span>
                <span className="text-[12px] text-white/60">{error}</span>
              </div>
            )}
          </div>

          <div className="pb-safe px-6 py-4 text-center text-[13px] text-white/70">{t("scan.hint")}</div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
