import {
  deleteCustomer,
  getCustomer,
  updateCustomer
} from "@/api/functions/admin.api";
import DeleteButton from "@/components/DeleteButton";
import AdminLayout from "@/components/Layout/AdminLayout";
import Pager, { usePaged } from "@/components/Pager";
import QueryError from "@/components/QueryError";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  formatDate,
  formatMoney,
  formatOrderTotal
} from "@/lib/functions/format.lib";
import { useT } from "@/lib/i18n/useT";
import {
  label,
  ORDER_STATUS,
  PAYMENT_STATUS
} from "@/lib/functions/labels.lib";
import { canOpenRoute, useCan } from "@/lib/permissions";
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
  const { can, admin } = useCan();
  const { t, locale } = useT();
  // Without customers:write the profile below is read-only: no save, no block.
  const canWrite = can("customers:write");
  const canOpenOrder = canOpenRoute(admin?.permissions, "/bookings/[id]");
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    internalNotes: ""
  });

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["customer", id],
    queryFn: () => getCustomer(id),
    enabled: Boolean(id)
  });
  const history = usePaged(data?.orders ?? []);


  useEffect(() => {
    if (data?.customer) {
      const c = data.customer;
      setForm({
        firstName: c.firstName ?? "",
        lastName: c.lastName ?? "",
        email: c.email ?? "",
        phone: c.phone ?? "",
        internalNotes: c.internalNotes ?? ""
      });
    }
  }, [data]);

  const onError = (e: unknown) =>
    toast.error(
      (e as AxiosError<{ message?: string }>).response?.data?.message ??
        t("ops.customer.saveFailed")
    );

  const { mutate: save, isPending } = useMutation({
    mutationFn: () => updateCustomer(id, form),
    meta: { showToast: false },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customer", id] });
      toast.success(t("ops.customer.saved"));
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
    successMessage: t("common.updated"),
    errorMessage: t("ops.customer.blockFailed")
  });

  if (isLoading) {
    return (
      <AdminLayout title={t("book.customer")}>
        <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
      </AdminLayout>
    );
  }
  // A 404 is "not found"; anything else is a load failure, offered a retry.
  if (isError && (error as AxiosError)?.response?.status !== 404) {
    return (
      <AdminLayout title={t("book.customer")}>
        <QueryError onRetry={() => refetch()} />
      </AdminLayout>
    );
  }
  if (!data) {
    return (
      <AdminLayout title={t("book.customer")}>
        <p className="text-sm text-muted-foreground">{t("ops.customer.notFound")}</p>
      </AdminLayout>
    );
  }

  const c = data.customer;

  return (
    <AdminLayout title={c.fullName} description={t("ops.customer.since", { date: formatDate(c.createdAt) })}>
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/customers">
            <Button variant="ghost" size="sm" className="gap-2">
              <ArrowLeft className="size-4 rtl:-scale-x-100" />
              {t("nav.customers")}
            </Button>
          </Link>
          {c.isBlocked ? <Badge variant="destructive">{t("ops.customers.blocked")}</Badge> : null}
          {c.noShowCount ? (
            <Badge variant="secondary" className="bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300">
              {t(c.noShowCount > 1 ? "ops.customer.noShows.other" : "ops.customer.noShows.one", {
                n: c.noShowCount
              })}
            </Badge>
          ) : null}
          <div className="ms-auto flex gap-2">
            <a href={`tel:${c.phone}`}>
              <Button variant="outline" size="sm" className="gap-2">
                <Phone className="size-3.5" />
                {t("ops.order.call")}
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
            <DeleteButton
              permission="customers:delete"
              label={t("ops.customer.delete")}
              what={t("ops.customer.deleteWhat", { name: c.fullName })}
              consequence={t("ops.customer.deleteConsequence")}
              onDelete={() => deleteCustomer(id)}
              onDeleted={() => {
                queryClient.invalidateQueries({ queryKey: ["customers"] });
                // Their page is forgotten too, once it has been left: kept, it
                // would open again from memory; dropped while still up, it
                // would be fetched again.
                router
                  .replace("/customers")
                  .then(() => queryClient.removeQueries({ queryKey: ["customer", id] }));
              }}
            />
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="gap-0 p-4 lg:col-span-2">
            <h2 className="mb-4 text-sm font-medium">{t("ops.customer.profile")}</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label className="text-xs">{t("ops.customer.firstName")}</Label>
                <Input
                  value={form.firstName}
                  onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                  disabled={!canWrite}
                />
              </div>
              <div>
                <Label className="text-xs">{t("ops.customer.lastName")}</Label>
                <Input
                  value={form.lastName}
                  onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                  disabled={!canWrite}
                />
              </div>
              <div>
                <Label className="text-xs">{t("common.phone")}</Label>
                <Input
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  disabled={!canWrite}
                  placeholder="+243 81 000 00 00"
                  dir="ltr"
                />
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {t("ops.customer.phoneHint")}
                </p>
              </div>
              <div>
                <Label className="text-xs">{t("common.email")}</Label>
                <Input
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  disabled={!canWrite}
                  placeholder={t("ops.customer.optional")}
                />
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {t("ops.customer.emailHint")}
                </p>
              </div>
            </div>
            <div className="mt-4">
              {/* §6.2: internal notes are never customer-visible. */}
              <Label className="text-xs">{t("ops.customer.notes")}</Label>
              <Textarea
                rows={3}
                value={form.internalNotes}
                onChange={(e) => setForm({ ...form, internalNotes: e.target.value })}
                disabled={!canWrite}
              />
            </div>
            {canWrite ? (
              <div className="mt-4 flex gap-2">
                <Button onClick={() => save()} disabled={isPending}>
                  {t("common.save")}
                </Button>
                <Button variant="outline" className="gap-2" onClick={() => toggleBlock()}>
                  <Ban className="size-3.5" />
                  {c.isBlocked ? t("ops.customer.unblock") : t("ops.customer.block")}
                </Button>
              </div>
            ) : null}
          </Card>

          <div className="flex flex-col gap-4">
            <Card className="gap-0 p-4">
              <p className="text-xs text-muted-foreground">{t("ops.customer.lifetimeValue")}</p>
              <p className="mt-1 text-xl font-semibold tabular-nums">
                {formatMoney(data.lifetimeValue, "CDF", locale)}
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {t("ops.customer.paidOnly")}
              </p>
            </Card>
            <Card className="gap-0 p-4">
              <p className="text-xs text-muted-foreground">{t("dash.orders")}</p>
              <p className="mt-1 text-xl font-semibold tabular-nums">
                {data.orders.length}
              </p>
            </Card>
          </div>
        </div>

        <Card className="gap-0 divide-y p-0">
          <div className="p-4">
            <h2 className="text-sm font-medium">{t("ops.customer.orderHistory")}</h2>
          </div>
          {!data.orders.length ? (
            <p className="p-4 text-sm text-muted-foreground">{t("ops.customer.noOrders")}</p>
          ) : (
            history.rows.map((o) => {
              const row = (
                <div className="flex items-center justify-between p-4">
                  <div>
                    <span className="font-mono text-sm">{o.reference}</span>
                    <span className="ms-3 text-xs text-muted-foreground">
                      {label(ORDER_STATUS, o.status)} ·{" "}
                      {label(PAYMENT_STATUS, o.paymentStatus)}
                    </span>
                  </div>
                  <span className="tabular-nums">
                    {formatOrderTotal(o, locale)}
                  </span>
                </div>
              );
              // A link only when the booking would open for this role.
              return canOpenOrder ? (
                <Link key={o.id} href={`/bookings/${o.id}`} className="block hover:bg-muted/50">
                  {row}
                </Link>
              ) : (
                <div key={o.id}>{row}</div>
              );
            })
          )}
        </Card>

        <Pager {...history.pager} noun={t("ops.noun.order")} plural={t("ops.noun.orders")} />

        <p className="text-xs text-muted-foreground">
          {t("ops.customer.footnote")}
        </p>
      </div>
    </AdminLayout>
  );
}
