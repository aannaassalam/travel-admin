import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export interface Option {
  value: string;
  label: ReactNode;
  disabled?: boolean;
}

/**
 * The panel's dropdown for a plain list of choices: the shadcn Select, never
 * the browser's own list. It cannot hold an empty value, which is what "All
 * drivers", "Anyone" or "Choose…" are, so "" travels as a stand-in and is
 * handed back as "".
 */
const NONE = "__none__";
const inSelect = (v: string) => (v === "" ? NONE : v);

export function OptionSelect({
  value,
  onChange,
  options,
  placeholder,
  disabled,
  required,
  id,
  className,
  size,
  "aria-label": ariaLabel
}: {
  value: string;
  onChange: (value: string) => void;
  options: Option[];
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  id?: string;
  className?: string;
  size?: "sm" | "default";
  "aria-label"?: string;
}) {
  const hasNone = options.some((o) => o.value === "");
  return (
    <Select
      // No "" choice in the list: "" is "nothing chosen yet", the placeholder.
      value={value === "" && !hasNone ? "" : inSelect(value)}
      onValueChange={(v) => onChange(v === NONE ? "" : v)}
      disabled={disabled}
      required={required}
    >
      <SelectTrigger id={id} size={size} aria-label={ariaLabel} className={cn("w-full", className)}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent className="max-h-72">
        {options.map((o) => (
          <SelectItem key={inSelect(o.value)} value={inSelect(o.value)} disabled={o.disabled}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
