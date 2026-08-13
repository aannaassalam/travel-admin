import { listCustomers, listOrders } from "@/api/functions/admin.api";
import { listHotels } from "@/api/functions/admin.api";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList
} from "@/components/ui/command";
import { useT } from "@/lib/i18n/useT";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/router";
import { useState } from "react";

/**
 * §3: global search resolves an order reference, phone number, customer name or
 * listing title from anywhere. "The reference number read out over the phone
 * will be the primary navigation method — make that the fastest path in the
 * product." So orders are listed first and the query hits them unfiltered.
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
  const [q, setQ] = useState("");
  const enabled = open && q.trim().length >= 2;

  const { data: orders } = useQuery({
    queryKey: ["search", "orders", q],
    queryFn: () => listOrders("all", q),
    enabled
  });
  const { data: customers } = useQuery({
    queryKey: ["search", "customers", q],
    queryFn: () => listCustomers(q),
    enabled
  });
  const { data: hotels } = useQuery({
    queryKey: ["search", "hotels", q],
    queryFn: () => listHotels({ q }),
    enabled
  });

  const go = (href: string) => {
    onOpenChange(false);
    setQ("");
    router.push(href);
  };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput
        value={q}
        onValueChange={setQ}
        placeholder="Order reference, phone, customer or listing…"
      />
      <CommandList>
        {enabled ? (
          <CommandEmpty>{t("common.noResults")}</CommandEmpty>
        ) : (
          <div className="p-6 text-center text-sm text-muted-foreground">
            Type at least two characters.
          </div>
        )}

        {orders?.items.length ? (
          <CommandGroup heading="Orders">
            {orders.items.slice(0, 6).map((o) => (
              <CommandItem
                key={o.id}
                value={`order-${o.reference}`}
                onSelect={() => go(`/bookings/${o.id}`)}
              >
                <span className="font-mono">{o.reference}</span>
                <span className="ml-2 text-muted-foreground">
                  {o.customer?.fullName}
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null}

        {customers?.items.length ? (
          <CommandGroup heading="Customers">
            {customers.items.slice(0, 6).map((c) => (
              <CommandItem
                key={c.id}
                value={`customer-${c.id}`}
                onSelect={() => go(`/customers/${c.id}`)}
              >
                {c.fullName}
                <span className="ml-2 font-mono text-xs text-muted-foreground">
                  {c.phoneMasked}
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null}

        {hotels?.items.length ? (
          <CommandGroup heading="Inventory">
            {hotels.items.slice(0, 6).map((h) => (
              <CommandItem
                key={h.id}
                value={`hotel-${h.id}`}
                onSelect={() => go(`/inventory/${h.id}`)}
              >
                {h.displayName}
                <span className="ml-2 text-xs text-muted-foreground">
                  {h.city}
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null}
      </CommandList>
    </CommandDialog>
  );
}
