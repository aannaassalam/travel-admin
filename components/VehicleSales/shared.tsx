import type { Availability, SaleVehicle, StatusAction } from "@/api/functions/admin.api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { deactivatePrompt, label, LISTING_STATUS } from "@/lib/functions/labels.lib";
import { lz } from "@/lib/functions/localized.lib";
import type { TranslationKey } from "@/lib/i18n/messages";
import { useT } from "@/lib/i18n/useT";
import { cn } from "@/lib/utils";
import { Archive } from "lucide-react";

/** The words and small parts the Vehicles for sale screens share. */

export const STATUS_STYLES: Record<string, string> = {
  PUBLISHED: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  INACTIVE: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  DRAFT: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
};

export const StatusBadge = ({ value }: { value: string }) => (
  <Badge variant="secondary" className={STATUS_STYLES[value]}>
    {label(LISTING_STATUS, value)}
  </Badge>
);

export const AVAILABILITY: Record<Availability, TranslationKey> = {
  AVAILABLE: "vs.availability.AVAILABLE",
  RESERVED: "vs.availability.RESERVED",
  SOLD: "vs.availability.SOLD"
};

const AVAILABILITY_STYLES: Record<string, string> = {
  AVAILABLE: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  RESERVED: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
  SOLD: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
};

export function AvailabilityBadge({ value }: { value?: string }) {
  const { t } = useT();
  const key = AVAILABILITY[value as Availability];
  return (
    <Badge variant="secondary" className={AVAILABILITY_STYLES[value ?? ""]}>
      {key ? t(key) : label({}, value)}
    </Badge>
  );
}

/** Its title, else "Make Model Year" — as the website names it. */
export const vehicleName = (v: Pick<SaleVehicle, "title" | "make" | "model" | "year">) =>
  lz(v.title) || [v.make, v.model, v.year].filter(Boolean).join(" ");

/** The status filters of both lists: "" is all of them. (No draft: a new one starts inactive, as restaurants.) */
const STATUS_FILTERS = ["", "PUBLISHED", "INACTIVE", "ARCHIVED"];

export function StatusFilter({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { t } = useT();
  return (
    <div
      className="flex gap-1 rounded-lg border bg-background p-1"
      role="group"
      aria-label={t("inv.list.filterByStatus")}
    >
      {STATUS_FILTERS.map((key) => (
        <button
          key={key}
          type="button"
          aria-pressed={value === key}
          onClick={() => onChange(key)}
          className={cn(
            "rounded-md px-3 py-1 text-sm transition-colors",
            value === key
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-muted"
          )}
        >
          {key ? label(LISTING_STATUS, key) : t("inv.list.filter.all")}
        </button>
      ))}
    </div>
  );
}

/**
 * Publish / Deactivate / Archive on a record's own page. Not while it holds
 * unsaved changes: the website would get the version that was saved.
 */
export function StatusActions({
  status,
  name,
  dirty,
  blockers = [],
  busy,
  onAction
}: {
  status?: string;
  name: string;
  dirty: boolean;
  blockers?: string[];
  busy: boolean;
  onAction: (action: StatusAction) => void;
}) {
  const { t } = useT();
  return (
    <>
      {status !== "PUBLISHED" ? (
        <Button
          variant="secondary"
          disabled={blockers.length > 0 || busy || dirty}
          title={blockers.join("; ") || undefined}
          onClick={() => onAction("publish")}
        >
          {t("common.publish")}
        </Button>
      ) : (
        <Button
          variant="outline"
          disabled={busy || dirty}
          onClick={() => window.confirm(deactivatePrompt(name)) && onAction("deactivate")}
        >
          {t("inv.restaurant.deactivate")}
        </Button>
      )}
      {status !== "ARCHIVED" ? (
        <Button
          variant="outline"
          className="gap-2 text-amber-600 hover:bg-amber-50 hover:text-amber-700"
          disabled={busy || dirty}
          onClick={() =>
            window.confirm(
              `${t("inv.list.confirm.archive", { name })}\n\n${t("inv.list.confirm.archiveBody")}`
            ) && onAction("archive")
          }
        >
          <Archive className="size-4" />
          {t("common.archive")}
        </Button>
      ) : null}
    </>
  );
}

/** The toast once a status action has gone through. */
export const STATUS_DONE: Record<StatusAction, TranslationKey> = {
  publish: "inv.list.published",
  deactivate: "inv.list.deactivated",
  archive: "inv.list.archived"
};
