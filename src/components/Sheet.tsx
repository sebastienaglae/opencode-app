import type { ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";

export function Sheet({
  open,
  onClose,
  title,
  children,
  maxHeight = "80vh",
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  maxHeight?: string;
}) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 z-40 bg-black/45"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            className="fixed inset-x-0 bottom-0 z-50 flex flex-col overflow-hidden rounded-t-2xl border-t border-border bg-elevated"
            style={{ maxHeight }}
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 32, stiffness: 320 }}
          >
            <div className="flex items-center gap-2 border-b border-border px-4 py-3">
              <div className="text-[15px] font-semibold text-fg">{title}</div>
            </div>
            <div className="oc-scroll overflow-y-auto pb-3">{children}</div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

export type SheetAction = { label: string; onClick: () => void; destructive?: boolean };

export function ActionSheet({ open, onClose, actions }: { open: boolean; onClose: () => void; actions: SheetAction[] }) {
  return (
    <Sheet open={open} onClose={onClose}>
      <div className="flex flex-col p-2">
        {actions.map((a, i) => (
          <button
            key={i}
            type="button"
            onClick={() => {
              onClose();
              a.onClick();
            }}
            className={`rounded-lg px-4 py-3 text-left text-[15px] active:bg-surface2 ${
              a.destructive ? "text-danger" : "text-fg"
            }`}
          >
            {a.label}
          </button>
        ))}
      </div>
    </Sheet>
  );
}
