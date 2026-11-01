import { getTransferSetup, type TransferSetup } from "@/api/functions/transfers.api";
import { isOne, linked, type Translate } from "@/components/Transfers/transfers.lib";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import type { TranslationKey } from "@/lib/i18n/messages";
import { useT } from "@/lib/i18n/useT";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { Check, X } from "lucide-react";
import Link from "next/link";

type Step = { ok: boolean; text: string; fix: string; href: string };
/** One city's five checks, each with how to put it right and where. */
const stepsOf = (
  t: Translate,
  city: TransferSetup["cities"][number],
  c: TransferSetup["categories"]
): Step[] => [
  {
    ok: city.servesTransfer,
    text: city.servesTransfer ? t("tr.setup.yes") : t("tr.setup.no"),
    // The server asks both: the city active and "Transfers" ticked.
    fix: t("tr.setup.fixLocation"),
    href: "/locations"
  },
  {
    ok: c.perKm + c.perHour > 0,
    text: t("tr.setup.priced", { km: c.perKm, hour: c.perHour }),
    fix: t("tr.setup.fixCategory"),
    href: "/transfers/categories"
  },
  {
    ok: city.activeVehicles > 0,
    text: t("tr.setup.nOfM", { n: city.activeVehicles, m: city.vehicles }),
    fix: city.vehicles ? t("tr.setup.fixVehicleOn") : t("tr.setup.fixVehicleAdd"),
    href: "/transfers/vehicles"
  },
  {
    ok: city.driversWithVehicle > 0,
    text: t("tr.setup.nOfM", { n: city.driversWithVehicle, m: city.drivers }),
    fix: city.drivers ? t("tr.setup.fixDriverVehicle") : t("tr.setup.fixDriverAdd"),
    href: "/transfers/drivers"
  },
  {
    ok: city.places > 0,
    text: String(city.places),
    fix: t("tr.setup.fixPlaces"),
    href: "/transfers/places"
  }
];
const STEP_NAMES: TranslationKey[] = [
  "tr.setup.sells",
  "tr.setup.pricedTypes",
  "tr.setup.activeVehicles",
  "tr.setup.drivers",
  "tr.setup.places"
];

/**
 * §9: what each city still lacks before its rides can be booked and driven.
 * Open while anything is missing; one line once all is in place.
 */
export default function SetupChecklist() {
  const { t, locale } = useT();
  const { data } = useQuery({
    queryKey: ["transfer-setup"],
    queryFn: getTransferSetup,
    // Back from fixing something, the list says so.
    refetchOnMount: "always"
  });
  if (!data) return null;
  const rows = data.cities.map((city) => ({ city, steps: stepsOf(t, city, data.categories) }));
  const missing = rows.reduce((n, r) => n + r.steps.filter((x) => !x.ok).length, 0);
  return (
    <details open={missing > 0 || !rows.length} className="rounded-lg border bg-background">
      <summary className="cursor-pointer px-4 py-3 text-sm font-medium">
        {t("tr.setup.title")}{" "}
        <span
          className={cn(
            "font-normal",
            missing || !rows.length
              ? "text-amber-700 dark:text-amber-400"
              : "text-emerald-700 dark:text-emerald-400"
          )}
        >
          {!rows.length
            ? t("tr.setup.noCity")
            : missing
              ? t(isOne(locale, missing) ? "tr.setup.todo.one" : "tr.setup.todo.other", { n: missing })
              : t("tr.setup.allDone")}
        </span>
      </summary>
      {rows.length ? (
        <div className="overflow-x-auto border-t">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("common.city")}</TableHead>
                {STEP_NAMES.map((name) => (
                  <TableHead key={name} className="whitespace-normal">
                    {t(name)}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(({ city, steps }) => (
                <TableRow key={city.name} className="align-top">
                  <TableCell className="font-medium">{city.name}</TableCell>
                  {steps.map((x, i) => (
                    <TableCell key={STEP_NAMES[i]} className="whitespace-normal text-sm">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1.5",
                          x.ok
                            ? "text-emerald-700 dark:text-emerald-400"
                            : "text-amber-700 dark:text-amber-400"
                        )}
                      >
                        {x.ok ? <Check className="size-4" /> : <X className="size-4" />}
                        <span className="sr-only">{x.ok ? t("tr.setup.done") : t("tr.setup.missing")}</span>
                        {x.text}
                      </span>
                      {x.ok ? null : (
                        <Link
                          href={x.href}
                          className="mt-0.5 block text-xs text-muted-foreground underline underline-offset-2"
                        >
                          {x.fix}
                        </Link>
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <p className="border-t px-4 py-3 text-sm text-muted-foreground">
          {linked(
            t("tr.setup.empty"),
            <Link href="/locations" className="underline underline-offset-2">
              {t("nav.locations")}
            </Link>
          )}
        </p>
      )}
    </details>
  );
}
