import { getCustomer, updateCustomer } from "@/api/functions/admin.api";
import AdminLayout from "@/components/Layout/AdminLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  formatDate,
  formatMoney
} from "@/lib/functions/format.lib";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useOptimisticMutation } from "@/hooks/useOptimisticMutation";
import { AxiosError } from "axios";
import { ArrowLeft, Ban, MessageCircle, Phone } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import { toast } from "sonner";

/** §8 customer detail. This is where the full phone number is legitimately shown. */
export default function CustomerDetailPage() {
  const router = useRouter();
  const id = router.query.id as string;
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    city: "",
    internalNotes: ""
  });

  const { data, isLoading } = useQuery({
    queryKey: ["customer", id],
    queryFn: () => getCustomer(id),
    enabled: Boolean(id)
  });

  useEffect(() => {
    if (data?.customer) {
      const c = data.customer;
      setForm({
        firstName: c.firstName ?? "",
        lastName: c.lastName ?? "",
        email: c.email ?? "",
        phone: c.phone ?? "",
        city: c.city ?? "",
        internalNotes: c.internalNotes ?? ""
      });
    }
  }, [data]);

  const onError = (e: unknown) =>
    toast.error(
      (e as AxiosError<{ message?: string }>).response?.data?.message ??
        "Could not save"
    );

  const { mutate: save, isPending } = useMutation({
    mutationFn: () => updateCustomer(id, form),
    meta: { showToast: false },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customer", id] });
      toast.success("Customer saved");
    },
    onError
  });

  /**
   * A pure toggle: the result is exactly the input, so there is nothing to wait
   * for. The badge and the button label flip on click and roll back only if the
   * server refuses.
   */
  const { mutate: toggleBlock } = useOptimisticMutation<
    unknown,
    void,
    { customer: { isBlocked: boolean } }
  >({
    mutationFn: () => updateCustomer(id, { isBlocked: !data?.customer.isBlocked }),
    queryKey: ["customer", id],
    apply: (previous) =>
      previous && {
        ...previous,
        customer: { ...previous.customer, isBlocked: !previous.customer.isBlocked }
      },
    successMessage: "Updated",
    errorMessage: "Could not change that customer"
  });

  if (isLoading) {
    return (
      <AdminLayout title="Customer">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </AdminLayout>
    );
  }
  if (!data) {
    return (
      <AdminLayout title="Customer">
        <p className="text-sm text-muted-foreground">Customer not found.</p>
      </AdminLayout>
    );
  }

  const c = data.customer;

  return (
    <AdminLayout title={c.fullName} description={`Customer since ${formatDate(c.createdAt)}`}>
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/customers">
            <Button variant="ghost" size="sm" className="gap-2">
              <ArrowLeft className="size-4" />
              Customers
            </Button>
          </Link>
          {c.isBlocked ? <Badge variant="destructive">Blocked</Badge> : null}
          {c.noShowCount ? (
            <Badge variant="secondary" className="bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300">
              {c.noShowCount} no-show{c.noShowCount > 1 ? "s" : ""}
            </Badge>
          ) : null}
          <div className="ml-auto flex gap-2">
            <a href={`tel:${c.phone}`}>
              <Button variant="outline" size="sm" className="gap-2">
                <Phone className="size-3.5" />
                Call
              </Button>
            </a>
            <a
              href={`https://wa.me/${c.phone?.replace(/\D/g, "")}`}
              target="_blank"
              rel="noreferrer"
            >
              <Button variant="outline" size="sm" className="gap-2">
                <MessageCircle className="size-3.5" />
                WhatsApp
              </Button>
            </a>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="gap-0 p-4 lg:col-span-2">
            <h2 className="mb-4 text-sm font-medium">Profile</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label className="text-xs">First name</Label>
                <Input
                  value={form.firstName}
                  onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                />
              </div>
              <div>
                <Label className="text-xs">Last name</Label>
                <Input
                  value={form.lastName}
                  onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                />
              </div>
              <div>
                <Label className="text-xs">Phone (E.164)</Label>
                <Input
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  placeholder="+243810000000"
                />
              </div>
              <div>
                <Label className="text-xs">Email</Label>
                <Input
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </div>
              <div>
                <Label className="text-xs">City</Label>
                <Input
                  value={form.city}
                  onChange={(e) => setForm({ ...form, city: e.target.value })}
                />
              </div>
            </div>
            <div className="mt-4">
              {/* §6.2: internal notes are never customer-visible. */}
              <Label className="text-xs">Internal notes (never shown to the customer)</Label>
              <Textarea
                rows={3}
                value={form.internalNotes}
                onChange={(e) => setForm({ ...form, internalNotes: e.target.value })}
              />
            </div>
            <div className="mt-4 flex gap-2">
              <Button onClick={() => save()} disabled={isPending}>
                Save
              </Button>
              <Button variant="outline" className="gap-2" onClick={() => toggleBlock()}>
                <Ban className="size-3.5" />
                {c.isBlocked ? "Unblock" : "Block"}
              </Button>
            </div>
          </Card>

          <div className="flex flex-col gap-4">
            <Card className="gap-0 p-4">
              <p className="text-xs text-muted-foreground">Lifetime value</p>
              <p className="mt-1 text-xl font-semibold tabular-nums">
                {formatMoney(data.lifetimeValue)}
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Paid orders only.
              </p>
            </Card>
            <Card className="gap-0 p-4">
              <p className="text-xs text-muted-foreground">Orders</p>
              <p className="mt-1 text-xl font-semibold tabular-nums">
                {data.orders.length}
              </p>
            </Card>
          </div>
        </div>

        <Card className="gap-0 divide-y p-0">
          <div className="p-4">
            <h2 className="text-sm font-medium">Order history</h2>
          </div>
          {!data.orders.length ? (
            <p className="p-4 text-sm text-muted-foreground">No orders yet.</p>
          ) : (
            data.orders.map((o) => (
              <Link key={o.id} href={`/bookings/${o.id}`} className="block hover:bg-muted/50">
                <div className="flex items-center justify-between p-4">
                  <div>
                    <span className="font-mono text-sm">{o.reference}</span>
                    <span className="ml-3 text-xs text-muted-foreground">
                      {o.status} · {o.paymentStatus}
                    </span>
                  </div>
                  <span className="tabular-nums">
                    {formatMoney(o.total, o.currency)}
                  </span>
                </div>
              </Link>
            ))
          )}
        </Card>

        <p className="text-xs text-muted-foreground">
          Merge-on-phone and per-customer data export are not built yet.
        </p>
      </div>
    </AdminLayout>
  );
}
