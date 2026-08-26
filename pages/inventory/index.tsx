import {
  duplicateHotel,
  duplicateListing,
  importListingsCsv,
  ImportReport,
  listHotels,
  listRestaurants,
  listListings
} from "@/api/functions/admin.api";
import AssetImage from "@/components/Form/AssetImage";
import AdminLayout from "@/components/Layout/AdminLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { formatDate, formatMoney } from "@/lib/functions/format.lib";
import { cn } from "@/lib/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AxiosError } from "axios";
import { Copy, Plus, Search, Upload } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/router";
import { useState } from "react";
import { toast } from "sonner";

/**
 * §5.2: all seven verticals on one screen, switched by group — the same pattern
 * as the booking queues, so there is one place to look for inventory rather
 * than two.
 *
 * Hotels (hotel → room type → nightly lot) and restaurants (restaurant → menu
 * item) are different shapes, so each gets its own table; the other five share
 * one.
 */
const GROUPS = [
  // `singular` is explicit rather than stripping a trailing "s" — that turns
  // "Properties" into "Propertie" and "Bus" into "Bu".
  { key: "HOTEL", label: "Hotels", singular: "hotel" },
  { key: "FLIGHT", label: "Flights", singular: "flight" },
  { key: "BUS", label: "Bus", singular: "bus service" },
  { key: "CAR", label: "Cars", singular: "car" },
  { key: "ACTIVITY", label: "Activities & Tours", singular: "activity" },
  { key: "PROPERTY", label: "Properties", singular: "property" },
  { key: "RESTAURANT", label: "Restaurants", singular: "restaurant" }
];

const STATUS_STYLES: Record<string, string> = {
  PUBLISHED: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  DRAFT: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  PAUSED: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  EXPIRED: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
  SOLD_OUT: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300"
};

/** First gallery image, or a visible gap where one should be. */
const Thumb = ({ src }: { src?: string }) => (
  <AssetImage
    src={src}
    className="size-9 shrink-0"
    title={src ? undefined : "No image — required before publishing"}
  />
);

const Translations = ({ map }: { map: Record<string, boolean> }) => (
  <span className="font-mono text-xs">
    {Object.entries(map).map(([loc, done]) => (
      <span key={loc} className={done ? "text-emerald-600" : "text-muted-foreground/50"}>
        {loc.toUpperCase()}
        {done ? "✓" : "✗"}{" "}
      </span>
    ))}
  </span>
);

export default function InventoryPage() {
  const router = useRouter();
  const group = (router.query.group as string) || "HOTEL";
  const isHotels = group === "HOTEL";
  const isProperty = group === "PROPERTY";
  // Restaurants are a third shape — parent plus a menu, no per-date lots and
  // no allotment — so they get their own query and their own columns.
  const isRestaurants = group === "RESTAURANT";

  const [q, setQ] = useState("");
  const [csv, setCsv] = useState("");
  const [report, setReport] = useState<ImportReport | null>(null);
  const [showImport, setShowImport] = useState(false);
  const queryClient = useQueryClient();

  const hotels = useQuery({
    queryKey: ["hotels", q],
    queryFn: () => listHotels({ q }),
    enabled: isHotels
  });
  const listings = useQuery({
    queryKey: ["listings", group, q],
    queryFn: () => listListings({ vertical: group, q }),
    enabled: !isHotels && !isRestaurants
  });
  const restaurants = useQuery({
    queryKey: ["restaurants", q],
    queryFn: () => listRestaurants({ q }),
    enabled: isRestaurants
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["hotels"] });
    queryClient.invalidateQueries({ queryKey: ["listings"] });
    queryClient.invalidateQueries({ queryKey: ["restaurants"] });
  };

  /** §5.1: clone is the highest-leverage feature in the module. */
  const { mutate: duplicate } = useMutation({
    mutationFn: (id: string) =>
      isHotels ? duplicateHotel(id) : duplicateListing(id),
    onSuccess: invalidate
  });

  const { mutate: runImport, isPending: importing } = useMutation({
    mutationFn: (commit: boolean) =>
      importListingsCsv({ vertical: group, csv, commit }),
    meta: { showToast: false },
    onSuccess: (r, commit) => {
      setReport(r);
      if (commit) {
        invalidate();
        setCsv("");
        setShowImport(false);
        toast.success(`${r.created} listing(s) imported as drafts`);
      }
    },
    onError: (e) =>
      toast.error(
        (e as AxiosError<{ message?: string }>).response?.data?.message ??
          "Import failed"
      )
  });

  const loading = isHotels
    ? hotels.isLoading
    : isRestaurants
      ? restaurants.isLoading
      : listings.isLoading;
  const rows = isHotels
    ? hotels.data?.items
    : isRestaurants
      ? restaurants.data?.items
      : listings.data?.items;
  const newHref = isHotels
    ? "/inventory/hotel/new"
    : isRestaurants
      ? "/inventory/restaurant/new"
      : `/inventory/listing/new?vertical=${group}`;

  return (
    <AdminLayout
      title="Inventory"
      description="Seven verticals. Cost price is required on everything that sells."
    >
      <div className="flex flex-col gap-4">
        {/* Group switcher — same pattern as the booking queues. */}
        <div className="flex flex-wrap gap-1 border-b pb-2">
          {GROUPS.map(({ key, label }) => (
            <Link
              key={key}
              href={`/inventory?group=${key}`}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm transition-colors",
                group === key
                  ? "bg-foreground font-medium text-background"
                  : "text-muted-foreground hover:bg-muted"
              )}
            >
              {label}
            </Link>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative max-w-sm flex-1">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search…"
              className="pl-9"
            />
          </div>
          <div className="ml-auto flex gap-2">
            {!isHotels && !isRestaurants ? (
              <Button variant="outline" className="gap-2" onClick={() => setShowImport((s) => !s)}>
                <Upload className="size-4" />
                CSV import
              </Button>
            ) : null}
            <Link href={newHref}>
              <Button className="gap-2">
                <Plus className="size-4" />
                New {GROUPS.find((g) => g.key === group)?.singular}
              </Button>
            </Link>
          </div>
        </div>

        {showImport && !isHotels && !isRestaurants ? (
          <Card className="gap-0 p-4">
            <h2 className="mb-1 text-sm font-medium">Bulk CSV import</h2>
            <p className="mb-3 text-xs text-muted-foreground">
              Header row:{" "}
              <code className="rounded bg-muted px-1 text-[11px]">
                title,city,description_fr,cost_price_usd,sell_price_usd,quantity,valid_from,valid_until,supplier
              </code>
              . Validation runs first — nothing is written until the report is
              clean and you commit.
            </p>
            <Textarea
              rows={5}
              value={csv}
              onChange={(e) => {
                setCsv(e.target.value);
                setReport(null);
              }}
              className="font-mono text-xs"
              placeholder="title,city,description_fr,…"
            />
            <div className="mt-3 flex gap-2">
              <Button variant="outline" disabled={!csv || importing} onClick={() => runImport(false)}>
                Validate
              </Button>
              <Button disabled={!report?.canCommit || importing} onClick={() => runImport(true)}>
                Commit import
              </Button>
            </div>
            {report ? (
              <div className="mt-3 rounded-md border p-3 text-sm">
                <p>
                  {report.validRows}/{report.rows} rows valid.
                  {report.canCommit ? " Ready to commit." : " Fix the errors below."}
                </p>
                {report.errors.length ? (
                  <ul className="mt-2 max-h-40 overflow-y-auto text-xs text-red-600 dark:text-red-400">
                    {report.errors.map((e, i) => (
                      <li key={i}>
                        Row {e.row} · {e.field}: {e.message}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}
          </Card>
        ) : null}

        <div className="rounded-lg border bg-background">
          <Table>
            <TableHeader className="sticky top-0 bg-background">
              <TableRow>
                <TableHead>
                  {isHotels ? "Hotel" : isRestaurants ? "Restaurant" : "Title"}
                </TableHead>
                <TableHead>City</TableHead>
                <TableHead>Status</TableHead>
                {isHotels ? (
                  <>
                    <TableHead>Translations</TableHead>
                    <TableHead>Supplier</TableHead>
                    <TableHead>Updated</TableHead>
                  </>
                ) : isRestaurants ? (
                  <>
                    <TableHead>Translations</TableHead>
                    <TableHead className="text-right">Zones</TableHead>
                    <TableHead>Updated</TableHead>
                  </>
                ) : isProperty ? (
                  <>
                    <TableHead className="text-right">Price</TableHead>
                    <TableHead>Translations</TableHead>
                    <TableHead>Updated</TableHead>
                  </>
                ) : (
                  <>
                    <TableHead className="text-right">Cost</TableHead>
                    <TableHead className="text-right">Sell</TableHead>
                    <TableHead className="text-right">Margin</TableHead>
                    <TableHead className="text-right">Avail.</TableHead>
                    <TableHead>Valid until</TableHead>
                  </>
                )}
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                    Loading…
                  </TableCell>
                </TableRow>
              ) : !rows?.length ? (
                // §13: empty states explain what to do next.
                <TableRow>
                  <TableCell colSpan={8} className="py-10 text-center">
                    <p className="text-sm text-muted-foreground">
                      Nothing in {GROUPS.find((g) => g.key === group)?.label} yet.
                    </p>
                    <Link href={newHref}>
                      <Button size="sm" className="mt-3 gap-2">
                        <Plus className="size-4" />
                        Add the first one
                      </Button>
                    </Link>
                  </TableCell>
                </TableRow>
              ) : isRestaurants ? (
                restaurants.data!.items.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Thumb src={r.images?.[0]} />
                        <div className="min-w-0">
                          <Link
                            href={`/inventory/restaurant/${r.id}`}
                            className="font-medium hover:underline"
                          >
                            {r.displayName}
                          </Link>
                          {r.cuisines?.length ? (
                            <span className="ml-2 text-xs text-muted-foreground">
                              {r.cuisines.join(" · ")}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>{r.city}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className={STATUS_STYLES[r.status]}>
                        {r.status.replace("_", " ")}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Translations map={r.translations} />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {/* A published restaurant with no zone cannot price a
                          delivery, so zero is a defect worth showing in red. */}
                      <span className={r.deliveryZones?.length ? "" : "text-red-600"}>
                        {r.deliveryZones?.length ?? 0}
                      </span>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDate(r.updatedAt)}
                    </TableCell>
                    <TableCell />
                  </TableRow>
                ))
              ) : isHotels ? (
                hotels.data!.items.map((h) => (
                  <TableRow key={h.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Thumb src={h.images?.[0]} />
                        <div className="min-w-0">
                          <Link
                            href={`/inventory/${h.id}`}
                            className="font-medium hover:underline"
                          >
                            {h.displayName}
                          </Link>
                          <span className="ml-2 text-xs text-muted-foreground">
                            {"★".repeat(h.stars)}
                          </span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>{h.city}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className={STATUS_STYLES[h.status]}>
                        {h.status.replace("_", " ")}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Translations map={h.translations} />
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {h.supplier || "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDate(h.updatedAt)}
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" title="Duplicate" onClick={() => duplicate(h.id)}>
                        <Copy className="size-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                listings.data!.items.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Thumb src={l.images?.[0]} />
                        <Link
                          href={`/inventory/listing/${l.id}`}
                          className="font-medium hover:underline"
                        >
                          {l.displayTitle}
                        </Link>
                      </div>
                    </TableCell>
                    <TableCell>{l.city}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className={STATUS_STYLES[l.status]}>
                        {l.status.replace("_", " ")}
                      </Badge>
                    </TableCell>
                    {isProperty ? (
                      <>
                        <TableCell className="text-right tabular-nums">
                          {formatMoney(l.sellPriceBase)}
                        </TableCell>
                        <TableCell>
                          <Translations map={l.translations} />
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {formatDate(l.updatedAt)}
                        </TableCell>
                      </>
                    ) : (
                      <>
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {formatMoney(l.costPriceBase)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatMoney(l.sellPriceBase)}
                          {/* Which other currencies this is actually priced in.
                              A missing one means "not sold in that currency",
                              not "convert it". */}
                          {l.currencies.length > 1 ? (
                            <span
                              className="ml-1 text-[10px] text-muted-foreground"
                              title={`Also priced in ${l.currencies
                                .filter((c) => c !== "USD")
                                .join(", ")}`}
                            >
                              +{l.currencies.filter((c) => c !== "USD").join(",")}
                            </span>
                          ) : null}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatMoney(l.margin)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {l.available}/{l.quantityTotal}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {l.validUntil ? formatDate(l.validUntil) : "—"}
                        </TableCell>
                      </>
                    )}
                    <TableCell>
                      <Button variant="ghost" size="icon" title="Duplicate" onClick={() => duplicate(l.id)}>
                        <Copy className="size-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {isProperty ? (
          <p className="text-xs text-muted-foreground">
            Properties carry no inventory quantity and no checkout — they are
            enquiry-driven only, and need at least 3 images to publish.
          </p>
        ) : null}
      </div>
    </AdminLayout>
  );
}
