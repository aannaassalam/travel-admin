import {
  archiveHotel,
  archiveListing,
  archiveRestaurant,
  CsvSeparator,
  deactivateHotel,
  deactivateListing,
  deactivateRestaurant,
  downloadInventoryCsv,
  duplicateHotel,
  duplicateListing,
  duplicateRestaurant,
  listHotels,
  listRestaurants,
  listListings,
  publishHotel,
  publishListing,
  publishRestaurant
} from "@/api/functions/admin.api";
import AssetImage from "@/components/Form/AssetImage";
import SpreadsheetImport, {
  CSV_FORMATS
} from "@/components/Inventory/SpreadsheetImport";
import AdminLayout from "@/components/Layout/AdminLayout";
import Pager, { PAGE_SIZE, usePage } from "@/components/Pager";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@/components/ui/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import { formatDate, formatMoney } from "@/lib/functions/format.lib";
import { label, LISTING_STATUS } from "@/lib/functions/labels.lib";
import { useDebounce } from "@/hooks/utils/useDebounce";
import { useCan } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient
} from "@tanstack/react-query";
import { AxiosError } from "axios";
import {
  Archive,
  ArrowDownAZ,
  ArrowUpAZ,
  ArrowUpDown,
  Copy,
  Download,
  Eye,
  EyeOff,
  Plus,
  Search,
  Upload
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
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
  // `singular` and `plural` are explicit rather than derived — stripping a
  // trailing "s" turns "Properties" into "Propertie" and "Bus" into "Bu".
  { key: "HOTEL", label: "Hotels", singular: "hotel", plural: "hotels" },
  {
    key: "RESTAURANT",
    label: "Restaurants",
    singular: "restaurant",
    plural: "restaurants"
  },
  { key: "FLIGHT", label: "Flights", singular: "flight", plural: "flights" },
  { key: "BUS", label: "Bus", singular: "bus service", plural: "bus services" },
  { key: "CAR", label: "Cars", singular: "car", plural: "cars" },
  {
    key: "PROPERTY",
    label: "Properties",
    singular: "property",
    plural: "properties"
  },
  {
    key: "ACTIVITY",
    label: "Activities & Tours",
    singular: "activity",
    plural: "activities"
  }
];

/**
 * The office chooses between two statuses, so those are the two it can filter
 * by. Expired and sold out are outcomes; they show under "All".
 */
const STATUS_FILTERS = [
  { key: "", label: "All" },
  { key: "PUBLISHED", label: "Published" },
  { key: "INACTIVE", label: "Inactive" }
];

/** On the website right now — so what it can be is taken down. */
const LIVE = ["PUBLISHED", "SOLD_OUT"];

const STATUS_STYLES: Record<string, string> = {
  PUBLISHED: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  INACTIVE: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  EXPIRED: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
  SOLD_OUT: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300"
};

/** One row of any of the three tables, as far as the actions care. */
interface Row {
  id: string;
  name: string;
  /** Where its edit screen is — "Open" on a refused publish goes here. */
  href: string;
}

type Act = (id: string) => Promise<unknown>;

const refusal = (e: unknown, fallback: string) =>
  (e as AxiosError<{ message?: string }>).response?.data?.message ?? fallback;

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

const Status = ({ value }: { value: string }) => (
  <Badge variant="secondary" className={STATUS_STYLES[value]}>
    {label(LISTING_STATUS, value)}
  </Badge>
);

export default function InventoryPage() {
  const router = useRouter();
  const group = (router.query.group as string) || "HOTEL";
  const current = GROUPS.find((g) => g.key === group) ?? GROUPS[0];
  const isHotels = group === "HOTEL";
  const isProperty = group === "PROPERTY";
  // Restaurants are a third shape — parent plus a menu, no per-date lots and
  // no allotment — so they get their own query and their own columns.
  const isRestaurants = group === "RESTAURANT";

  const [q, setQ] = useState("");
  // Global search's "See all" row lands here with the term already applied.
  useEffect(() => {
    if (typeof router.query.q === "string") setQ(router.query.q);
  }, [router.query.q]);
  const [status, setStatus] = useState("");
  const [showImport, setShowImport] = useState(false);
  const queryClient = useQueryClient();
  // The three lists and the export are inventory:read, which is what opens
  // this page. Create, copy, publish, deactivate, archive and import (even its
  // dry run) are inventory:write.
  const { can } = useCan();
  const canWrite = can("inventory:write");

  // Newest first until the name column is clicked: then A to Z, then Z to A.
  const [sort, setSort] = useState<"" | "name" | "-name">("");
  const term = useDebounce(q.trim(), 300);
  // Searched, ordered and cut into pages by the server, so a name sorts across
  // the whole group and not only the rows that happen to be on screen.
  const [page, setPage] = usePage(`${group}|${term}|${status}|${sort}`);
  const narrowed = { q: term, status, sort, page, limit: PAGE_SIZE };
  const paged = {
    // Coming back from a detail screen, the list must show what was done there.
    refetchOnMount: "always",
    // The rows stay up while the next page loads, instead of blinking empty.
    placeholderData: keepPreviousData
  } as const;
  const hotels = useQuery({
    queryKey: ["hotels", narrowed],
    queryFn: () => listHotels(narrowed),
    enabled: isHotels,
    ...paged
  });
  const listings = useQuery({
    queryKey: ["listings", group, narrowed],
    queryFn: () => listListings({ ...narrowed, vertical: group }),
    enabled: !isHotels && !isRestaurants,
    ...paged
  });
  const restaurants = useQuery({
    queryKey: ["restaurants", narrowed],
    queryFn: () => listRestaurants(narrowed),
    enabled: isRestaurants,
    ...paged
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["hotels"] });
    queryClient.invalidateQueries({ queryKey: ["listings"] });
    queryClient.invalidateQueries({ queryKey: ["restaurants"] });
  };

  /** The same action, on whichever of the three shapes this group is. */
  const byShape = (hotel: Act, restaurant: Act, listing: Act) =>
    isHotels ? hotel : isRestaurants ? restaurant : listing;

  /** §5.1: clone is the highest-leverage feature in the module. */
  const { mutate: duplicate, isPending: duplicating } = useMutation({
    mutationFn: ({ id }: Row) =>
      byShape(duplicateHotel, duplicateRestaurant, duplicateListing)(id),
    meta: { showToast: false },
    onSuccess: (_r, row) => {
      invalidate();
      toast.success(`Copied “${row.name}” — the copy is inactive until you publish it`);
    },
    onError: (e) => toast.error(refusal(e, "Could not copy that"))
  });

  /**
   * Publishing is also how something inactive comes back. The server checks it
   * is fit to show first, and says what is missing when it is not — so the
   * refusal offers the way to the screen where that gets fixed.
   */
  const { mutate: publish, isPending: publishing } = useMutation({
    mutationFn: ({ id }: Row) =>
      byShape(publishHotel, publishRestaurant, publishListing)(id),
    meta: { showToast: false },
    onSuccess: (_r, row) => {
      invalidate();
      toast.success(`“${row.name}” is published — it shows on the website within a few minutes`);
    },
    onError: (e, row) =>
      toast.error(refusal(e, "Could not publish that"), {
        action: { label: "Open", onClick: () => router.push(row.href) }
      })
  });

  /**
   * Taking something down and archiving it both ask first.
   *
   * Deactivate is the reversible one: off the website, still in this list,
   * one click from live again. Archive is this module's "delete": the server
   * flips status to ARCHIVED and audits it, because orders reference the
   * inventory they sold and a hard delete would orphan booking history.
   */
  const [pending, setPending] = useState<
    (Row & { action: "deactivate" | "archive" }) | null
  >(null);

  const { mutate: confirm, isPending: confirming } = useMutation({
    mutationFn: ({ id, action }: NonNullable<typeof pending>) =>
      action === "archive"
        ? byShape(archiveHotel, archiveRestaurant, archiveListing)(id)
        : byShape(deactivateHotel, deactivateRestaurant, deactivateListing)(id),
    meta: { showToast: false },
    onSuccess: (_r, done) => {
      setPending(null);
      invalidate();
      toast.success(
        done.action === "archive"
          ? `“${done.name}” archived`
          : `“${done.name}” deactivated — publish it again whenever you like`
      );
    },
    onError: (e) => toast.error(refusal(e, "That did not go through"))
  });

  const { mutate: exportCsv, isPending: exporting } = useMutation({
    mutationFn: (sep: CsvSeparator) => downloadInventoryCsv(group, "export", sep),
    meta: { showToast: false },
    onSuccess: (name) => toast.success(`Saved ${name}`),
    onError: () => toast.error("Could not export")
  });

  const data = isHotels
    ? hotels.data
    : isRestaurants
      ? restaurants.data
      : listings.data;
  const loading = isHotels
    ? hotels.isLoading
    : isRestaurants
      ? restaurants.isLoading
      : listings.isLoading;
  const filtered = Boolean(term || status);
  const newHref = isHotels
    ? "/inventory/hotel/new"
    : isRestaurants
      ? "/inventory/restaurant/new"
      : `/inventory/listing/new?vertical=${group}`;

  const actions = (row: Row, rowStatus: string) =>
    canWrite ? (
      <div className="flex items-center justify-end gap-1">
        {LIVE.includes(rowStatus) ? (
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1.5 px-2 text-xs"
            title="Take it off the website"
            onClick={() => setPending({ ...row, action: "deactivate" })}
          >
            <EyeOff className="size-3.5" />
            Deactivate
          </Button>
        ) : (
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1.5 px-2 text-xs text-emerald-700 hover:text-emerald-800 dark:text-emerald-400"
            title="Put it on the website"
            disabled={publishing}
            onClick={() => publish(row)}
          >
            <Eye className="size-3.5" />
            Publish
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          title="Copy"
          aria-label="Copy"
          disabled={duplicating}
          onClick={() => duplicate(row)}
        >
          <Copy className="size-4" />
        </Button>
        <ArchiveButton onClick={() => setPending({ ...row, action: "archive" })} />
      </div>
    ) : null;

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
          <div className="relative min-w-48 max-w-sm flex-1">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search…"
              className="pl-9"
            />
          </div>

          <div
            className="flex gap-1 rounded-lg border bg-background p-1"
            role="group"
            aria-label="Filter by status"
          >
            {STATUS_FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                aria-pressed={status === f.key}
                onClick={() => setStatus(f.key)}
                className={cn(
                  "rounded-md px-3 py-1 text-sm transition-colors",
                  status === f.key
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted"
                )}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div className="ml-auto flex flex-wrap gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="gap-2" disabled={exporting}>
                  <Download className="size-4" />
                  {exporting ? "Exporting…" : "Export"}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Export all {current.plural} for…</DropdownMenuLabel>
                {CSV_FORMATS.map((f) => (
                  <DropdownMenuItem key={f.sep} onSelect={() => exportCsv(f.sep)}>
                    {f.label}
                    <span className="ml-auto pl-4 text-xs text-muted-foreground">
                      {f.hint}
                    </span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            {canWrite ? (
              <>
                <Button
                  variant="outline"
                  className="gap-2"
                  onClick={() => setShowImport((s) => !s)}
                >
                  <Upload className="size-4" />
                  Import
                </Button>
                <Link href={newHref}>
                  <Button className="gap-2">
                    <Plus className="size-4" />
                    New {current.singular}
                  </Button>
                </Link>
              </>
            ) : null}
          </div>
        </div>

        {canWrite && showImport ? (
          // Keyed by group, so switching tabs starts a clean import rather
          // than carrying one group's file over to another's columns.
          <SpreadsheetImport
            key={group}
            group={group}
            noun={current.plural}
            singular={current.singular}
            onImported={invalidate}
            onClose={() => setShowImport(false)}
          />
        ) : null}

        <div className="rounded-lg border bg-background">
          <Table>
            <TableHeader className="sticky top-0 bg-background">
              <TableRow>
                <TableHead
                  aria-sort={
                    sort === "name" ? "ascending" : sort === "-name" ? "descending" : "none"
                  }
                >
                  <button
                    type="button"
                    className="-ml-2 flex items-center gap-1.5 rounded px-2 py-1 hover:bg-muted"
                    title={
                      sort === "name"
                        ? "Sorted A to Z — click for Z to A"
                        : sort === "-name"
                          ? "Sorted Z to A — click for A to Z"
                          : "Sort by name, A to Z"
                    }
                    onClick={() => setSort(sort === "name" ? "-name" : "name")}
                  >
                    {isHotels ? "Hotel" : isRestaurants ? "Restaurant" : "Title"}
                    {sort === "name" ? (
                      <ArrowDownAZ className="size-3.5" />
                    ) : sort === "-name" ? (
                      <ArrowUpAZ className="size-3.5" />
                    ) : (
                      <ArrowUpDown className="size-3.5 text-muted-foreground" />
                    )}
                  </button>
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
                  </>
                )}
                {canWrite ? <TableHead className="text-right">Actions</TableHead> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                    Loading…
                  </TableCell>
                </TableRow>
              ) : !data?.items.length ? (
                // §13: empty states explain what to do next.
                <TableRow>
                  <TableCell colSpan={8} className="py-10 text-center">
                    <p className="text-sm text-muted-foreground">
                      {filtered
                        ? `No ${current.plural} match that.`
                        : `Nothing in ${current.label} yet.`}
                    </p>
                    {canWrite && !filtered ? (
                      <Link href={newHref}>
                        <Button size="sm" className="mt-3 gap-2">
                          <Plus className="size-4" />
                          Add the first one
                        </Button>
                      </Link>
                    ) : null}
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
                      <Status value={r.status} />
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
                    {canWrite ? (
                      <TableCell>
                        {actions(
                          {
                            id: r.id,
                            name: r.displayName,
                            href: `/inventory/restaurant/${r.id}`
                          },
                          r.status
                        )}
                      </TableCell>
                    ) : null}
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
                      <Status value={h.status} />
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
                    {canWrite ? (
                      <TableCell>
                        {actions(
                          { id: h.id, name: h.displayName, href: `/inventory/${h.id}` },
                          h.status
                        )}
                      </TableCell>
                    ) : null}
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
                      <Status value={l.status} />
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
                      </>
                    )}
                    {canWrite ? (
                      <TableCell>
                        {actions(
                          {
                            id: l.id,
                            name: l.displayTitle,
                            href: `/inventory/listing/${l.id}`
                          },
                          l.status
                        )}
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        <Pager
          page={page}
          total={data?.total ?? 0}
          onPage={setPage}
          noun={current.singular}
          plural={current.plural}
        />

        {isProperty ? (
          <p className="text-xs text-muted-foreground">
            Properties carry no inventory quantity and no checkout — they are
            enquiry-driven only, and need at least 3 images to publish.
          </p>
        ) : null}
      </div>

      <AlertDialog
        open={Boolean(pending)}
        onOpenChange={(open) => !open && setPending(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pending?.action === "archive" ? "Archive" : "Deactivate"} “
              {pending?.name}”?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pending?.action === "archive"
                ? "It leaves the public catalogue and this list, and can no longer be booked. Nothing is deleted: existing bookings keep working and the record stays in reports. To take something down for a while, deactivate it instead."
                : "It can no longer be booked from this moment, and disappears from the website within a few minutes. Existing bookings are not affected. Nothing is deleted and it stays in this list — publish it again whenever you like."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={confirming}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={confirming}
              onClick={(e) => {
                // Keep the dialog up while the request is in flight, so a slow
                // network cannot look like a no-op and invite a second click.
                e.preventDefault();
                if (pending) confirm(pending);
              }}
            >
              {confirming
                ? "Working…"
                : pending?.action === "archive"
                  ? "Archive"
                  : "Deactivate"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminLayout>
  );
}

/**
 * The archive control.
 *
 * Amber rather than red: the record survives, so dressing it as a destruction
 * warning would be a lie the first time someone needs the row back.
 */
function ArchiveButton({ onClick }: { onClick: () => void }) {
  return (
    <Button
      variant="ghost"
      size="icon"
      title="Archive"
      aria-label="Archive"
      onClick={onClick}
      className="text-amber-600 hover:bg-amber-50 hover:text-amber-700"
    >
      <Archive className="size-4" />
    </Button>
  );
}
