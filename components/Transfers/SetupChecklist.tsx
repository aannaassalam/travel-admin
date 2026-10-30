import { getTransferSetup, type TransferSetup } from "@/api/functions/transfers.api";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { Check, X } from "lucide-react";
import Link from "next/link";

type Step = { ok: boolean; text: string; fix: string; href: string };
/** One city's five checks, each with how to put it right and where. */
const stepsOf = (city: TransferSetup["cities"][number], c: TransferSetup["categories"]): Step[] => [
  {
    ok: city.servesTransfer,
    text: city.servesTransfer ? "Yes" : "No",
    // The server asks both: the city active and "Transfers" ticked.
    fix: "Activate it and tick “Transfers” for it under Locations",
    href: "/locations"
  },
  {
    ok: c.perKm + c.perHour > 0,
    text: `${c.perKm} per km / ${c.perHour} per hour`,
    fix: "Give a category a price per km or per hour",
    href: "/transfers/categories"
  },
  {
    ok: city.activeVehicles > 0,
    text: `${city.activeVehicles} of ${city.vehicles}`,
    fix: city.vehicles ? "Switch one on under Vehicles" : "Add one under Vehicles, with this city",
    href: "/transfers/vehicles"
  },
  {
    ok: city.driversWithVehicle > 0,
    text: `${city.driversWithVehicle} of ${city.drivers}`,
    fix: city.drivers
      ? "Give a driver a vehicle under Drivers"
      : "Add one under Drivers, with this city",
    href: "/transfers/drivers"
  },
  {
    ok: city.places > 0,
    text: String(city.places),
    fix: "Save the usual pick-up points under Places",
    href: "/transfers/places"
  }
];
const STEP_NAMES = [
  "Sells transfers",
  "Priced vehicle types (per km / per hour)",
  "Active vehicles",
  "Drivers with a vehicle",
  "Pick-up places"
];

/**
 * §9: what each city still lacks before its rides can be booked and driven.
 * Open while anything is missing; one line once all is in place.
 */
export default function SetupChecklist() {
  const { data } = useQuery({
    queryKey: ["transfer-setup"],
    queryFn: getTransferSetup,
    // Back from fixing something, the list says so.
    refetchOnMount: "always"
  });
  if (!data) return null;
  const rows = data.cities.map((city) => ({ city, steps: stepsOf(city, data.categories) }));
  const missing = rows.reduce((n, r) => n + r.steps.filter((x) => !x.ok).length, 0);
  return (
    <details open={missing > 0 || !rows.length} className="rounded-lg border bg-background">
      <summary className="cursor-pointer px-4 py-3 text-sm font-medium">
        Set-up checklist{" "}
        <span
          className={cn(
            "font-normal",
            missing || !rows.length
              ? "text-amber-700 dark:text-amber-400"
              : "text-emerald-700 dark:text-emerald-400"
          )}
        >
          {!rows.length
            ? "— no city sells transfers yet"
            : missing
              ? `— ${missing} thing${missing === 1 ? "" : "s"} to do`
              : "— everything is in place"}
        </span>
      </summary>
      {rows.length ? (
        <div className="overflow-x-auto border-t">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>City</TableHead>
                {STEP_NAMES.map((name) => (
                  <TableHead key={name} className="whitespace-normal">
                    {name}
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
                        <span className="sr-only">{x.ok ? "Done:" : "Missing:"}</span>
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
          Tick “Transfers” for a city under{" "}
          <Link href="/locations" className="underline underline-offset-2">
            Locations
          </Link>
          , then add its vehicles, drivers and pick-up places.
        </p>
      )}
    </details>
  );
}
