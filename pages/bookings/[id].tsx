import type {
  OrderDocument,
  OrderItem,
  TimelineEvent,
  Traveller
} from "@/api/functions/admin.api";
import {
  getOrder,
  markCashReceived,
  transitionOrder
} from "@/api/functions/admin.api";
import AdminLayout from "@/components/Layout/AdminLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import {
  formatDate,
  formatDateTime,
  formatMoney
} from "@/lib/functions/format.lib";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AxiosError } from "axios";
import { ArrowLeft, Bike, MessageCircle, Phone, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/router";
import { useState } from "react";
import { toast } from "sonner";

/** §6.4: fixed reason-code list. Cancellation is operational, not financial. */
const CANCELLATION_REASONS = [
  { value: "CASH_DEADLINE_EXPIRED", label: "Cash deadline expired" },
  { value: "CUSTOMER_REQUEST", label: "Customer request" },
  { value: "CANNOT_DELIVER", label: "We cannot deliver" },
  { value: "FRAUD_OR_DUPLICATE", label: "Fraud or duplicate" },
  { value: "OTHER", label: "Other" }
];

export default function OrderDetailPage() {
  const router = useRouter();
  const id = router.query.id as string;
  const queryClient = useQueryClient();
  const [reason, setReason] = useState("");
  const [cancelCode, setCancelCode] = useState("");

  const { data: order, isLoading } = useQuery({
    queryKey: ["order", id],
    queryFn: () => getOrder(id),
    enabled: Boolean(id)
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["order", id] });
    queryClient.invalidateQueries({ queryKey: ["queue-counts"] });
    setReason("");
    setCancelCode("");
  };

  const onError = (err: unknown) =>
    toast.error(
      (err as AxiosError<{ message?: string }>).response?.data?.message ??
        "Action failed"
    );

  const { mutate: transition, isPending } = useMutation({
    mutationFn: (to: string) =>
      transitionOrder(id, { to, reason, cancellationReason: cancelCode }),
    meta: { showToast: false },
    onSuccess: () => {
      refresh();
      toast.success("Order updated");
    },
    onError
  });

  const { mutate: cashReceived } = useMutation({
    mutationFn: () => markCashReceived(id, reason || "Collected at office"),
    meta: { showToast: false },
    onSuccess: () => {
      refresh();
      toast.success("Cash recorded");
    },
    onError
  });

  if (isLoading) {
    return (
      <AdminLayout title="Order">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </AdminLayout>
    );
  }
  if (!order) {
    return (
      <AdminLayout title="Order">
        <p className="text-sm text-muted-foreground">Order not found.</p>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout
      title={order.reference}
      description={`Created ${formatDate(order.createdAt)} · ${order.channel ?? "WEB"}`}
    >
      <div className="flex flex-col gap-6">
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/bookings">
            <Button variant="ghost" size="sm" className="gap-2">
              <ArrowLeft className="size-4" />
              Bookings
            </Button>
          </Link>
          {/* §6.2: three status badges — order / payment / fulfilment. */}
          <Badge variant="secondary">{order.status}</Badge>
          <Badge variant="secondary">{order.paymentStatus}</Badge>
          <Badge variant="secondary">
            {order.fulfilmentStatus?.replace(/_/g, " ")}
          </Badge>
          <span className="ml-auto text-lg font-semibold tabular-nums">
            {formatMoney(order.total, order.currency)}
          </span>
        </div>

        {/* §6.2: everything on one screen — the administrator is on a call and
            cannot navigate tabs while a customer waits. */}
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="flex flex-col gap-4 lg:col-span-2">
            <Card className="gap-0 p-4">
              <h2 className="mb-3 text-sm font-medium">Items</h2>
              {order.items?.map((i: OrderItem) => (
                <div key={i.id} className="flex items-start justify-between gap-4 border-b py-2 last:border-0">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{i.listingLabel}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(i.startDate)} → {formatDate(i.endDate)} · qty {i.quantity}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm tabular-nums">{formatMoney(i.lineTotal)}</p>
                    {/* Admin-only: cost and margin never reach the public API. */}
                    <p className="text-[11px] text-muted-foreground tabular-nums">
                      cost {formatMoney(i.unitCostPrice)}/u · margin{" "}
                      {formatMoney(i.margin)}
                    </p>
                  </div>
                </div>
              ))}
            </Card>

            {/* A food order is dispatched, not ticketed. The address and the
                driver's note are the operative facts on the record, so they go
                above the travel blocks rather than under them. */}
            {order.delivery && (
              <Card className="gap-0 border-sky-200 p-4 dark:border-sky-900">
                <h2 className="mb-2 flex items-center gap-2 text-sm font-medium">
                  <Bike className="size-4 text-sky-600" />
                  Delivery
                </h2>
                <p className="text-sm font-medium">{order.delivery.address}</p>
                {order.delivery.notes && (
                  <p className="mt-1 text-sm text-muted-foreground">
                    {order.delivery.notes}
                  </p>
                )}
                <p className="mt-2 text-xs text-muted-foreground tabular-nums">
                  {order.delivery.zoneName} · fee {formatMoney(order.delivery.fee)}
                  {order.delivery.etaMinutes ? ` · about ${order.delivery.etaMinutes} min` : ""}
                </p>
              </Card>
            )}

            <Card className="gap-0 p-4">
              <h2 className="mb-3 text-sm font-medium">Travellers</h2>
              {order.travellers?.length ? (
                order.travellers.map((t: Traveller) => (
                  <div key={t.id} className="flex items-center justify-between border-b py-2 last:border-0">
                    <span className="text-sm">
                      {t.firstName} {t.lastName}
                    </span>
                    <span className="font-mono text-xs text-muted-foreground">
                      {/* §6.2 / §14.5: masked by default; unmasking is
                          step-up gated, reason-required and logged. */}
                      {t.documentType}: {t.documentNumberMasked ?? "—"}
                    </span>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">No travellers recorded.</p>
              )}
            </Card>

            {/* §6.2 / §9.3: this is what defends a chargeback. */}
            <Card className="gap-0 border-emerald-200 p-4 dark:border-emerald-900">
              <h2 className="mb-2 flex items-center gap-2 text-sm font-medium">
                <ShieldAlert className="size-4 text-emerald-600" />
                Consent record
              </h2>
              {order.consent ? (
                <div className="text-sm">
                  <p className="font-medium">{order.consent.policyVersionLabel}</p>
                  <p className="mt-1 rounded bg-muted p-2 text-xs italic">
                    “{order.consent.textShown}”
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Accepted {formatDateTime(order.consent.acceptedAt)} · locale{" "}
                    {order.consent.locale} · IP {order.consent.ip}
                  </p>
                </div>
              ) : (
                <p className="text-sm text-red-600 dark:text-red-400">
                  No consent captured — this order cannot be defended against a
                  chargeback.
                </p>
              )}
            </Card>

            <Card className="gap-0 p-4">
              <h2 className="mb-3 text-sm font-medium">Timeline</h2>
              <ol className="flex flex-col gap-2">
                {order.timeline?.map((t: TimelineEvent, i: number) => (
                  <li key={i} className="flex gap-3 text-sm">
                    <span className="w-40 shrink-0 text-xs text-muted-foreground">
                      {formatDateTime(t.at)}
                    </span>
                    <span>
                      <span className="font-medium">{t.event.replace(/_/g, " ")}</span>
                      {t.reason ? (
                        <span className="text-muted-foreground"> — {t.reason}</span>
                      ) : null}
                      {t.actorEmail ? (
                        <span className="text-xs text-muted-foreground"> ({t.actorEmail})</span>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ol>
            </Card>
          </div>

          <div className="flex flex-col gap-4">
            <Card className="gap-0 p-4">
              <h2 className="mb-3 text-sm font-medium">Customer</h2>
              <p className="font-medium">{order.customer?.fullName}</p>
              <p className="text-sm text-muted-foreground">{order.customer?.email}</p>
              <div className="mt-3 flex gap-2">
                <a href={`tel:${order.customer?.phone}`}>
                  <Button variant="outline" size="sm" className="gap-2">
                    <Phone className="size-3.5" />
                    Call
                  </Button>
                </a>
                <a
                  href={`https://wa.me/${order.customer?.phone?.replace(/\D/g, "")}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <Button variant="outline" size="sm" className="gap-2">
                    <MessageCircle className="size-3.5" />
                    WhatsApp
                  </Button>
                </a>
              </div>
            </Card>

            <Card className="gap-0 p-4">
              <h2 className="mb-3 text-sm font-medium">Actions</h2>
              {/* §6.3: every manual override requires a reason. */}
              <Label className="text-xs">Reason (required)</Label>
              <Input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Why are you doing this?"
                className="mb-3"
              />

              <div className="flex flex-col gap-2">
                {order.status === "SUBMITTED" ? (
                  <Button
                    size="sm"
                    disabled={!reason || isPending}
                    onClick={() => transition("CONFIRMED")}
                  >
                    Confirm order
                  </Button>
                ) : null}

                {order.paymentMethod === "CASH" &&
                order.paymentStatus !== "PAID" ? (
                  <Button size="sm" variant="outline" onClick={() => cashReceived()}>
                    Mark cash received
                  </Button>
                ) : null}

                {["DRAFT", "SUBMITTED", "CONFIRMED"].includes(order.status) ? (
                  <>
                    <Select value={cancelCode} onValueChange={setCancelCode}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Cancellation reason…" />
                      </SelectTrigger>
                      <SelectContent>
                        {CANCELLATION_REASONS.map((r) => (
                          <SelectItem key={r.value} value={r.value}>
                            {r.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={!reason || !cancelCode || isPending}
                      onClick={() => transition("CANCELLED")}
                    >
                      Cancel order
                    </Button>
                    {/* §6.4: cancellation must never read as a refund. */}
                    <p className="rounded bg-amber-50 p-2 text-[11px] text-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
                      No money is returned by cancelling. Inventory is released
                      back to the lot. If money genuinely needs to move, that is
                      a payment exception.
                    </p>
                  </>
                ) : null}
              </div>
            </Card>

            <Card className="gap-0 p-4">
              <h2 className="mb-2 text-sm font-medium">Documents</h2>
              {order.documents?.length ? (
                order.documents.map((d: OrderDocument) => (
                  <p key={d.id} className="text-sm">
                    {d.kind} · v{d.version} · {formatDate(d.uploadedAt)}
                  </p>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">
                  None attached yet.
                </p>
              )}
            </Card>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
