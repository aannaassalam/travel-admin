import {
  Listing,
  listCustomers,
  listHotels,
  listListings,
  listOrders,
  listRestaurants
} from "@/api/functions/admin.api";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList
} from "@/components/ui/command";
import { useDebounce } from "@/hooks/utils/useDebounce";
import {
  formatDate,
  formatMoney,
  relativeTime
} from "@/lib/functions/format.lib";
import { anyStatus } from "@/lib/functions/labels.lib";
import { useT } from "@/lib/i18n/useT";
import { Permission, useCan } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  BedDouble,
  Bus,
  Car,
  ClipboardList,
  Compass,
  Home,
  Loader2,
  LucideIcon,
  Plane,
  Users,
  Utensils
} from "lucide-react";
import { useRouter } from "next/router";
import { ReactNode, useState } from "react";

/** What the search reads. With none of these there is nothing to search. */
export const SEARCH_PERMISSIONS: Permission[] = [
  "orders:read",
  "customers:read",
  "inventory:read"
];

const PER_GROUP = 5;

const VERTICALS: { key: string; label: string; icon: LucideIcon }[] = [
  { key: "FLIGHT", label: "Flights", icon: Plane },
  { key: "BUS", label: "Bus", icon: Bus },
  { key: "CAR", label: "Car hire", icon: Car },
  { key: "PROPERTY", label: "Property", icon: Home },
  { key: "ACTIVITY", label: "Activities", icon: Compass }
];

/** Same tones as the bookings / inventory tables. */
const TONE: Record<string, string> = {
  PAID: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  PUBLISHED:
    "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  CONFIRMED:
    "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  PENDING: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  PAUSED: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  SUBMITTED:
    "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  FAILED: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
  REVERSED: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
  EXPIRED: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
  CANCELLED: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
  SOLD_OUT: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300"
};

const Chip = ({ value }: { value?: string }) =>
  value ? (
    <span
      className={cn(
        "rounded px-1.5 py-0.5 text-[10px] font-medium",
        TONE[value] ??
          "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
      )}
    >
      {anyStatus(value)}
    </span>
  ) : null;

/** icon | title + subtitle (truncating) | right-aligned meta. */
const Row = ({
  icon: Icon,
  title,
  subtitle,
  meta,
  onSelect,
  value
}: {
  icon: LucideIcon;
  title: ReactNode;
  subtitle?: ReactNode;
  meta?: ReactNode;
  onSelect: () => void;
  value: string;
}) => (
  <CommandItem value={value} onSelect={onSelect}>
    <Icon />
    <div className="min-w-0 flex-1">
      <div className="truncate">{title}</div>
      {subtitle ? (
        <div className="truncate text-xs text-muted-foreground">{subtitle}</div>
      ) : null}
    </div>
    {meta ? (
      <div className="flex shrink-0 flex-col items-end gap-0.5 text-xs text-muted-foreground">
        {meta}
      </div>
    ) : null}
  </CommandItem>
);

const departure = (l: Listing) => {
  const a = l.attributes as {
    departsAt?: string;
    segments?: { departsAt?: string }[];
  };
  return a.departsAt ?? a.segments?.[0]?.departsAt;
};

/**
 * §3: global search resolves an order reference, phone number, customer name or
 * listing title from anywhere. "The reference number read out over the phone
 * will be the primary navigation method — make that the fastest path in the
 * product." So orders are listed first and the query hits them unfiltered.
 *
 * Each source is only queried, and only listed, when the signed-in admin may
 * read it — otherwise every keystroke would fire a request that 403s. Results
 * are already filtered by the server, so cmdk's own matcher is switched off:
 * with it on, rows whose value is an id were silently hidden.
 */
export default function GlobalSearch({
  open,
  onOpenChange
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const router = useRouter();
  const { t } = useT();
  const [text, setText] = useState("");
  const q = useDebounce(text.trim(), 300);
  const { can } = useCan();
  const enabled = open && q.length >= 2 && text.trim().length >= 2;
  const canOrders = can("orders:read");
  const canCustomers = can("customers:read");
  const canInventory = can("inventory:read");

  const orders = useQuery({
    queryKey: ["search", "orders", q],
    queryFn: () => listOrders("all", q),
    enabled: enabled && canOrders
  });
  const customers = useQuery({
    queryKey: ["search", "customers", q],
    queryFn: () => listCustomers(q),
    enabled: enabled && canCustomers
  });
  const hotels = useQuery({
    queryKey: ["search", "hotels", q],
    queryFn: () => listHotels({ q }),
    enabled: enabled && canInventory
  });
  const listings = useQuery({
    queryKey: ["search", "listings", q],
    queryFn: () => listListings({ q }),
    enabled: enabled && canInventory
  });
  const restaurants = useQuery({
    queryKey: ["search", "restaurants", q],
    queryFn: () => listRestaurants({ q }),
    enabled: enabled && canInventory
  });

  const all = [orders, customers, hotels, listings, restaurants];
  const searching =
    (enabled && text.trim() !== q) || all.some((r) => r.isFetching);
  const settledEmpty =
    enabled && !searching && all.every((r) => !r.data?.items.length);

  const close = (o: boolean) => {
    if (!o) setText("");
    onOpenChange(o);
  };
  const go = (href: string) => {
    close(false);
    router.push(href);
  };
  const qs = (extra = "") => `?q=${encodeURIComponent(q)}${extra}`;

  /** "See all 25+ bookings" — the list is capped, so a cursor means more. */
  const seeAll = (
    page: { items: unknown[]; nextCursor?: string | null } | undefined,
    label: string,
    href: string
  ) =>
    page && page.items.length > PER_GROUP ? (
      <CommandItem value={`all-${href}`} onSelect={() => go(href)}>
        <ArrowRight />
        <span className="text-muted-foreground">
          See all {page.items.length}
          {page.nextCursor ? "+" : ""} {label}
        </span>
      </CommandItem>
    ) : null;

  const byVertical = (key: string) =>
    listings.data?.items.filter((l) => l.vertical === key) ?? [];

  return (
    <CommandDialog
      open={open}
      onOpenChange={close}
      shouldFilter={false}
      title="Search"
      description="Bookings, customers and inventory"
    >
      <CommandInput
        value={text}
        onValueChange={setText}
        placeholder="Reference, phone, customer, city, carrier, listing…"
      />
      <CommandList className="max-h-[70vh] sm:max-h-[420px]">
        {!enabled ? (
          <div className="p-6 text-center text-sm text-muted-foreground">
            Type at least two characters.
          </div>
        ) : null}
        {searching ? (
          <div className="flex items-center justify-center gap-2 py-2 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" /> Searching…
          </div>
        ) : null}
        {settledEmpty ? (
          <CommandEmpty>{t("common.noResults")}</CommandEmpty>
        ) : null}

        {canOrders && orders.data?.items.length ? (
          <CommandGroup heading="Bookings">
            {orders.data.items.slice(0, PER_GROUP).map((o) => (
              <Row
                key={o.id}
                value={`order-${o.id}`}
                icon={ClipboardList}
                onSelect={() => go(`/bookings/${o.id}`)}
                title={
                  <span className="flex items-center gap-2">
                    <span className="font-mono">{o.reference}</span>
                    <span className="truncate text-muted-foreground">
                      {o.customer?.fullName}
                    </span>
                  </span>
                }
                subtitle={
                  <span className="flex items-center gap-1">
                    <Chip value={o.status} />
                    <Chip value={o.paymentStatus} />
                  </span>
                }
                meta={
                  <>
                    <span className="font-medium text-foreground">
                      {formatMoney(o.total, o.currency)}
                    </span>
                    <span>{relativeTime(o.createdAt)}</span>
                  </>
                }
              />
            ))}
            {seeAll(orders.data, "bookings", `/bookings${qs("&queue=all")}`)}
          </CommandGroup>
        ) : null}

        {canCustomers && customers.data?.items.length ? (
          <CommandGroup heading="Customers">
            {customers.data.items.slice(0, PER_GROUP).map((c) => (
              <Row
                key={c.id}
                value={`customer-${c.id}`}
                icon={Users}
                onSelect={() => go(`/customers/${c.id}`)}
                title={c.fullName}
                subtitle={
                  <span className="font-mono">{c.phoneMasked}</span>
                }
                meta={c.city}
              />
            ))}
            {seeAll(customers.data, "customers", `/customers${qs()}`)}
          </CommandGroup>
        ) : null}

        {canInventory && hotels.data?.items.length ? (
          <CommandGroup heading="Hotels">
            {hotels.data.items.slice(0, PER_GROUP).map((h) => (
              <Row
                key={h.id}
                value={`hotel-${h.id}`}
                icon={BedDouble}
                onSelect={() => go(`/inventory/${h.id}`)}
                title={h.displayName}
                subtitle={h.city}
                meta={<Chip value={h.status} />}
              />
            ))}
            {seeAll(hotels.data, "hotels", `/inventory${qs("&group=HOTEL")}`)}
          </CommandGroup>
        ) : null}

        {canInventory
          ? VERTICALS.map(({ key, label, icon }) => {
              const items = byVertical(key);
              if (!items.length) return null;
              const when = (l: Listing) => {
                const d = departure(l);
                return d ? formatDate(d) : null;
              };
              return (
                <CommandGroup key={key} heading={label}>
                  {items.slice(0, PER_GROUP).map((l) => (
                    <Row
                      key={l.id}
                      value={`listing-${l.id}`}
                      icon={icon}
                      onSelect={() => go(`/inventory/listing/${l.id}`)}
                      title={l.displayTitle}
                      subtitle={l.city}
                      meta={
                        <>
                          <Chip value={l.status} />
                          {when(l)}
                        </>
                      }
                    />
                  ))}
                  {seeAll(
                    { items, nextCursor: listings.data?.nextCursor },
                    label.toLowerCase(),
                    `/inventory${qs(`&group=${key}`)}`
                  )}
                </CommandGroup>
              );
            })
          : null}

        {canInventory && restaurants.data?.items.length ? (
          <CommandGroup heading="Restaurants">
            {restaurants.data.items.slice(0, PER_GROUP).map((r) => (
              <Row
                key={r.id}
                value={`restaurant-${r.id}`}
                icon={Utensils}
                onSelect={() => go(`/inventory/restaurant/${r.id}`)}
                title={r.displayName}
                subtitle={[r.city, r.cuisines?.join(", ")]
                  .filter(Boolean)
                  .join(" · ")}
                meta={<Chip value={r.status} />}
              />
            ))}
            {seeAll(
              restaurants.data,
              "restaurants",
              `/inventory${qs("&group=RESTAURANT")}`
            )}
          </CommandGroup>
        ) : null}
      </CommandList>
    </CommandDialog>
  );
}
