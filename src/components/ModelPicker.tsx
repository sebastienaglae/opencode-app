import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { IonIcon } from "@ionic/react";
import { checkmarkOutline, searchOutline } from "ionicons/icons";
import type { ModelInfo, ModelRef } from "../core/types";
import { useT } from "../core/i18n";
import { providerLabel, sortProviders } from "../core/models";
import { cn } from "../core/cn";

export function ModelPicker({
  open,
  onClose,
  models,
  current,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  models: ModelInfo[];
  current?: ModelRef;
  onSelect: (model: ModelRef) => void;
}) {
  const t = useT();
  const [q, setQ] = useState("");

  const grouped = useMemo(() => {
    const query = q.toLowerCase();
    const byProvider = new Map<string, ModelInfo[]>();
    for (const m of models) {
      if (query && !m.name.toLowerCase().includes(query) && !m.modelID.toLowerCase().includes(query)) continue;
      const list = byProvider.get(m.providerID) ?? [];
      list.push(m);
      byProvider.set(m.providerID, list);
    }
    return [...byProvider.entries()]
      .sort((a, b) => sortProviders(a[0], b[0]))
      .map(([provider, list]) => [provider, list.sort((a, b) => a.name.localeCompare(b.name))] as const);
  }, [models, q]);

  const isSelected = (m: ModelInfo, variant?: string) =>
    current?.id === m.modelID && current?.providerID === m.providerID && (current?.variant ?? undefined) === variant;

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
            className="fixed inset-x-0 bottom-0 z-50 flex max-h-[68vh] flex-col rounded-t-2xl border-t border-border bg-elevated"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 32, stiffness: 320 }}
          >
            <div className="flex items-center gap-2 border-b border-border p-3">
              <IonIcon icon={searchOutline} className="text-muted" />
              <input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={t("models.search")}
                className="w-full bg-transparent text-[15px] text-fg outline-none placeholder:text-faint"
              />
            </div>
            <div className="oc-scroll overflow-y-auto p-2 pb-6">
              {grouped.length === 0 && <div className="p-4 text-center text-[13px] text-muted">{t("models.empty")}</div>}
              {grouped.map(([provider, list]) => (
                <div key={provider} className="mb-1">
                  <div className="px-2 py-2 text-[12px] font-bold uppercase tracking-wide text-faint">
                    {providerLabel(provider)}
                  </div>
                  {list.map((m) =>
                    (m.variants?.length ? m.variants.map((v) => v.id) : [undefined]).map((variant) => {
                      const selected = isSelected(m, variant);
                      return (
                        <button
                          key={`${m.providerID}/${m.modelID}/${variant ?? ""}`}
                          type="button"
                          onClick={() => {
                            onSelect({ id: m.modelID, providerID: m.providerID, variant });
                            onClose();
                          }}
                          className={cn(
                            "flex w-full items-center gap-2 rounded-lg px-3 py-3 text-left",
                            selected ? "bg-accentsoft" : "hover:bg-surface2",
                          )}
                        >
                          <span className="flex-1">
                            <span className="text-[15px] text-fg">{m.name}</span>
                            {variant && <span className="ml-1.5 text-[13px] font-medium text-accent">{variant}</span>}
                          </span>
                          {selected && <IonIcon icon={checkmarkOutline} className="text-accent" />}
                        </button>
                      );
                    }),
                  )}
                </div>
              ))}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
