import { useState } from "react";
import { IonIcon } from "@ionic/react";
import { alertCircleOutline, helpCircleOutline, shieldCheckmarkOutline } from "ionicons/icons";
import type { FormField, FormInfo, FormValue, PermissionReply, PermissionRequest } from "../core/types";
import { useT } from "../core/i18n";
import { cn } from "../core/cn";

function defaultFor(field: FormField): FormValue | undefined {
  if (field.default !== undefined) return field.default as FormValue;
  if (field.type === "boolean") return false;
  if (field.type === "multiselect") return [];
  return undefined;
}

const inputCls =
  "w-full rounded-lg border border-border bg-surface px-3 py-2 text-[14px] text-fg outline-none placeholder:text-faint focus:border-borderstrong";

function FieldInput({ field, value, onChange }: { field: FormField; value: FormValue | undefined; onChange: (v: FormValue) => void }) {
  if (field.hidden) return null;
  return (
    <div className="my-2.5 flex flex-col gap-1">
      <label className="text-[13px] font-semibold text-fg">
        {field.title ?? field.key}
        {field.required && <span className="text-danger"> *</span>}
      </label>
      {field.description && <span className="text-[12px] text-muted">{field.description}</span>}

      {field.type === "boolean" ? (
        <button
          type="button"
          onClick={() => onChange(!value)}
          className={cn(
            "mt-0.5 flex h-6 w-11 items-center rounded-full border border-border transition-colors",
            value ? "bg-accent" : "bg-surface2",
          )}
        >
          <span className={cn("h-5 w-5 rounded-full bg-bg transition-transform", value ? "translate-x-[22px]" : "translate-x-0.5")} />
        </button>
      ) : (field.type === "string" || field.type === "number" || field.type === "integer") && field.options ? (
        <select value={String(value ?? "")} onChange={(e) => onChange(field.type === "string" ? e.target.value : Number(e.target.value))} className={inputCls}>
          <option value="">—</option>
          {field.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ) : field.type === "multiselect" ? (
        <div className="flex flex-wrap gap-1.5">
          {(field.options ?? []).map((o) => {
            const selected = Array.isArray(value) && value.includes(o.value);
            return (
              <button
                key={o.value}
                type="button"
                onClick={() => {
                  const list = Array.isArray(value) ? value.slice() : [];
                  const idx = list.indexOf(o.value);
                  if (idx >= 0) list.splice(idx, 1);
                  else list.push(o.value);
                  onChange(list);
                }}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-[12.5px]",
                  selected ? "border-accent bg-accentsoft text-accent" : "border-border bg-surface2 text-fg",
                )}
              >
                {o.label}
              </button>
            );
          })}
        </div>
      ) : field.type === "external" ? (
        <a href={field.url} target="_blank" rel="noreferrer noopener" className="text-[13px] text-accent">
          {field.url}
        </a>
      ) : (field.maxLength ?? 0) > 120 || field.key === "text" ? (
        <textarea value={String(value ?? "")} placeholder={field.placeholder} onChange={(e) => onChange(e.target.value)} rows={3} className={inputCls} />
      ) : (
        <input
          type={field.type === "number" || field.type === "integer" ? "number" : "text"}
          value={value === undefined ? "" : String(value)}
          placeholder={field.placeholder}
          onChange={(e) => onChange(field.type === "number" || field.type === "integer" ? Number(e.target.value) : e.target.value)}
          className={inputCls}
        />
      )}
    </div>
  );
}

function FormCard({ form, onSubmit, onCancel }: { form: FormInfo; onSubmit: (answers: Record<string, unknown>) => void; onCancel: () => void }) {
  const t = useT();
  const [answers, setAnswers] = useState<Record<string, unknown>>(() => {
    const init: Record<string, unknown> = {};
    for (const f of form.fields) {
      const def = defaultFor(f);
      if (def !== undefined) init[f.key] = def;
    }
    return init;
  });
  const missing = form.fields.filter((f) => f.required && !f.hidden && (answers[f.key] === undefined || answers[f.key] === ""));

  return (
    <div className="rounded-xl border border-border bg-surface p-3">
      <div className="mb-1 flex items-center gap-2">
        <IonIcon icon={helpCircleOutline} className="text-[18px] text-accent" />
        <strong className="text-[14px] text-fg">{form.title}</strong>
      </div>
      {form.fields.map((f) => (
        <FieldInput key={f.key} field={f} value={answers[f.key] as FormValue | undefined} onChange={(v) => setAnswers((a) => ({ ...a, [f.key]: v }))} />
      ))}
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          disabled={missing.length > 0}
          onClick={() => onSubmit(answers)}
          className={cn("rounded-lg bg-accent px-3 py-1.5 text-[13px] font-semibold text-white", missing.length > 0 && "opacity-50")}
        >
          {t("q.reply")}
        </button>
        <button type="button" onClick={onCancel} className="rounded-lg px-3 py-1.5 text-[13px] font-semibold text-muted">
          {t("common.cancel")}
        </button>
      </div>
    </div>
  );
}

function PermissionCard({ request, onReply }: { request: PermissionRequest; onReply: (decision: PermissionReply) => void }) {
  const t = useT();
  return (
    <div className="rounded-xl border border-warn/50 bg-warn/5 p-3">
      <div className="mb-1.5 flex items-center gap-2">
        <IonIcon icon={shieldCheckmarkOutline} className="text-[18px] text-warn" />
        <strong className="text-[14px] text-fg">{t("q.permission", { action: request.action })}</strong>
      </div>
      {request.message && <div className="mb-1.5 text-[13px] text-fg">{request.message}</div>}
      <div className="mb-2.5 whitespace-pre-wrap break-words font-mono text-[12px] text-muted">{request.resources.join("\n")}</div>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => onReply("once")} className="rounded-lg bg-accent px-3 py-1.5 text-[13px] font-semibold text-white">
          {t("q.once")}
        </button>
        <button type="button" onClick={() => onReply("always")} className="rounded-lg border border-border px-3 py-1.5 text-[13px] font-semibold text-fg">
          {t("q.always")}
        </button>
        <button type="button" onClick={() => onReply("reject")} className="rounded-lg px-3 py-1.5 text-[13px] font-semibold text-danger">
          {t("q.reject")}
        </button>
      </div>
    </div>
  );
}

export function QuestionBanner({
  forms,
  permissions,
  onReplyForm,
  onCancelForm,
  onReplyPermission,
}: {
  forms: FormInfo[];
  permissions: PermissionRequest[];
  onReplyForm: (formID: string, answers: Record<string, unknown>) => void;
  onCancelForm: (formID: string) => void;
  onReplyPermission: (requestID: string, decision: PermissionReply) => void;
}) {
  const t = useT();
  if (forms.length === 0 && permissions.length === 0) return null;
  return (
    <div className="flex flex-col gap-2.5 px-3 pb-2">
      <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-faint">
        <IonIcon icon={alertCircleOutline} className="text-[13px]" />
        <span>{t("q.actionRequired")}</span>
      </div>
      {permissions.map((p) => (
        <PermissionCard key={p.id} request={p} onReply={(d) => onReplyPermission(p.id, d)} />
      ))}
      {forms.map((f) => (
        <FormCard key={f.id} form={f} onSubmit={(a) => onReplyForm(f.id, a)} onCancel={() => onCancelForm(f.id)} />
      ))}
    </div>
  );
}
