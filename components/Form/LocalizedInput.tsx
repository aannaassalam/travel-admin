import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  CONTENT_LOCALES,
  LOCALE_LABELS,
  type ContentLocale
} from "@/lib/i18n/dictionaries";
import { cn } from "@/lib/utils";
import { useState } from "react";

export type Localized = Partial<Record<string, string>>;

/**
 * One field, one tab per language.
 *
 * Tabs rather than four stacked boxes: the administrator types French for
 * everything and fills other languages later, so the common case should be a
 * single visible input. A dot on the tab shows which languages already have
 * text, which is the same signal the FR ✓ EN ✗ column gives in the list.
 */
export default function LocalizedInput({
  label,
  value,
  onChange,
  multiline,
  placeholder,
  required,
  disabled
}: {
  label: string;
  value: Localized;
  onChange: (next: Localized) => void;
  multiline?: boolean;
  placeholder?: string;
  required?: boolean;
  /** Read-only: the language tabs still switch, the text cannot be changed. */
  disabled?: boolean;
}) {
  const [active, setActive] = useState<ContentLocale>(CONTENT_LOCALES[0]);
  const Field = multiline ? Textarea : Input;

  return (
    <div>
      <div className="mb-1 flex items-center gap-2">
        <Label className="text-xs">
          {label}
          {required ? " *" : ""}
        </Label>
        <div className="ml-auto flex gap-0.5">
          {CONTENT_LOCALES.map((l) => {
            const filled = Boolean(value?.[l]);
            return (
              <button
                key={l}
                type="button"
                onClick={() => setActive(l)}
                title={LOCALE_LABELS[l]}
                className={cn(
                  "flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] uppercase transition-colors",
                  active === l
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:bg-muted"
                )}
              >
                {l}
                <span
                  className={cn(
                    "size-1 rounded-full",
                    filled ? "bg-emerald-500" : "bg-muted-foreground/30"
                  )}
                />
              </button>
            );
          })}
        </div>
      </div>
      <Field
        value={value?.[active] ?? ""}
        rows={multiline ? 3 : undefined}
        disabled={disabled}
        placeholder={
          active === CONTENT_LOCALES[0]
            ? placeholder
            : `${placeholder ?? label} (${LOCALE_LABELS[active]})`
        }
        onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
          onChange({ ...value, [active]: e.target.value })
        }
      />
      {required && !value?.[CONTENT_LOCALES[0]] ? (
        <p className="mt-1 text-[11px] text-amber-600 dark:text-amber-400">
          {LOCALE_LABELS[CONTENT_LOCALES[0]]} is required — it is what other languages
          fall back to.
        </p>
      ) : null}
    </div>
  );
}
