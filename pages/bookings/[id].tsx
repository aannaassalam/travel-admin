import type {
  OrderDetail,
  OrderDocument,
  OrderItem,
  TimelineEvent,
  Traveller
} from "@/api/functions/admin.api";
import {
  attachOrderDocuments,
  DocumentKind,
  getOrder,
  getSignedFileUrl,
  markCashReceived,
  MAX_DOCUMENTS_PER_UPLOAD,
  removeOrderDocument,
  transitionOrder
} from "@/api/functions/admin.api";
import { assetUrl } from "@/api/endpoints";
import AdminLayout from "@/components/Layout/AdminLayout";
import QueryError from "@/components/QueryError";
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
import {
  CANCELLATION_REASON,
  CHANNEL,
  DOCUMENT_KIND,
  FULFILMENT_STATUS,
  label,
  ORDER_STATUS,
  PAYMENT_METHOD,
  PAYMENT_STATUS,
  TIMELINE_EVENT
} from "@/lib/functions/labels.lib";
import { useCan } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AxiosError } from "axios";
import {
  ArrowLeft,
  Bike,
  CheckCircle2,
  Circle,
  CircleDot,
  Download,
  FileText,
  MessageCircle,
  Phone,
  ShieldAlert,
  Trash2,
  Upload,
  X,
  XCircle
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

/** §6.4: fixed reason-code list. Cancellation is operational, not financial. */
const CANCELLATION_REASONS = Object.entries(CANCELLATION_REASON);

const MAX_DOCUMENT_BYTES = 15 * 1024 * 1024;

const STATUS_STYLES: Record<string, string> = {
  CONFIRMED: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
  COMPLETED:
    "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  SUBMITTED:
    "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  CANCELLED: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
  PAID: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  PENDING: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  FAILED: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
  REVERSED: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300"
};

const fmtSize = (bytes: number) =>
  bytes >= 1048576
    ? `${(bytes / 1048576).toFixed(1)} MB`
    : `${Math.max(1, Math.ceil(bytes / 1024))} KB`;

type StepState = "done" | "current" | "todo" | "cancelled";
interface Step {
  label: string;
  state: StepState;
  at?: string;
  note?: string;
}

/**
 * The booking as a journey, derived from its three status axes rather than
 * from the history list — so every step that has happened wears a tick, the
 * one in hand is marked, and a cancellation ends the line where it stopped.
 */
function orderSteps(order: OrderDetail): Step[] {
  const at = (events: string[]) =>
    order.timeline?.find((e) => events.includes(e.event))?.at;
  const paid = order.paymentStatus === "PAID";
  const cash = order.paymentMethod === "CASH";
  const confirmed =
    order.status === "CONFIRMED" || order.status === "COMPLETED";
  const completed = order.status === "COMPLETED";
  const documents =
    order.fulfilmentStatus === "DOCUMENTS_ISSUED" ||
    order.fulfilmentStatus === "DELIVERED" ||
    (order.documents?.length ?? 0) > 0;

  const planned = [
    {
      label: "Booking created",
      done: true,
      at: order.createdAt ?? at(["ORDER_CREATED"])
    },
    cash
      ? {
          label: paid
            ? "Cash received at the office"
            : "Awaiting cash at the office",
          done: paid,
          at: at(["CASH_RECEIVED", "PAYMENT_RECEIVED"]),
          note:
            !paid && order.cashDeadline
              ? `Pay by ${formatDateTime(order.cashDeadline)}`
              : undefined
        }
      : {
          label: paid ? "Payment received" : "Awaiting payment",
          done: paid,
          at: at(["PAYMENT_RECEIVED"])
        },
    {
      label: "Confirmed",
      done: confirmed,
      at:
        at(["STATUS_CONFIRMED"]) ??
        (confirmed ? at(["CASH_RECEIVED"]) : undefined)
    },
    ...(order.delivery
      ? [{ label: "Delivered", done: completed, at: at(["STATUS_COMPLETED"]) }]
      : [
          {
            label: documents ? "Documents issued" : "Documents to issue",
            done: documents,
            at: at(["DOCUMENTS_ISSUED"])
          },
          {
            label: "Completed",
            done: completed,
            at: at(["STATUS_COMPLETED"])
          }
        ])
  ];

  const steps: Step[] = [];
  let current = false;
  for (const step of planned) {
    if (step.done) {
      steps.push({ ...step, state: "done" });
      continue;
    }
    if (order.status === "CANCELLED") {
      steps.push({
        label: "Cancelled",
        state: "cancelled",
        at: at(["STATUS_CANCELLED", "AUTO_CANCELLED"]),
        note: order.cancellationReason
          ? label(CANCELLATION_REASON, order.cancellationReason)
          : undefined
      });
      break;
    }
    steps.push({ ...step, state: current ? "todo" : "current" });
    current = true;
  }
  return steps;
}

function Progress({ order }: { order: OrderDetail }) {
  const steps = orderSteps(order);
  const icon = (state: StepState) =>
    state === "done" ? (
      <CheckCircle2 className="size-6 text-emerald-600" />
    ) : state === "current" ? (
      <CircleDot className="size-6 text-sky-600" />
    ) : state === "cancelled" ? (
      <XCircle className="size-6 text-red-600" />
    ) : (
      <Circle className="size-6 text-muted-foreground/40" />
    );
  // A rail segment is green once the step before it is done.
  const rail = (done: boolean) =>
    cn("h-0.5 flex-1 rounded-full", done ? "bg-emerald-500" : "bg-border");

  return (
    <ol className="flex flex-col sm:flex-row">
      {steps.map((s, i) => {
        const last = i === steps.length - 1;
        return (
          <li
            key={`${s.label}-${i}`}
            className="flex gap-3 sm:min-w-0 sm:flex-1 sm:flex-col sm:items-center sm:gap-2 sm:text-center"
          >
            {/* Phone: icon on the left with a thin vertical line to the next step.
                Desktop: the line runs horizontally through the icon centres. */}
            <div className="flex flex-col items-center sm:w-full sm:flex-row">
              <span
                className={cn(
                  "hidden sm:block",
                  rail(i > 0 && steps[i - 1].state === "done"),
                  i === 0 && "invisible"
                )}
              />
              <span className="shrink-0 rounded-full bg-background">{icon(s.state)}</span>
              <span
                className={cn(
                  "hidden sm:block",
                  rail(s.state === "done"),
                  last && "invisible"
                )}
              />
              {!last ? (
                <span
                  className={cn(
                    "my-1 w-0.5 flex-1 rounded-full sm:hidden",
                    s.state === "done" ? "bg-emerald-500" : "bg-border"
                  )}
                  style={{ minHeight: 14 }}
                />
              ) : null}
            </div>
            <div className={cn("min-w-0 sm:px-1", !last && "pb-4 sm:pb-0")}>
              <p
                className={cn(
                  "text-sm leading-tight",
                  s.state === "todo" && "text-muted-foreground",
                  s.state === "cancelled" && "font-medium text-red-700",
                  (s.state === "done" || s.state === "current") && "font-medium"
                )}
              >
                {s.label}
              </p>
              {s.at ? (
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {formatDateTime(s.at)}
                </p>
              ) : null}
              {s.note ? (
                <p className="mt-0.5 text-[11px] text-amber-700 dark:text-amber-400">
                  {s.note}
                </p>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

interface Staged {
  id: string;
  file: File;
  kind: DocumentKind;
  /** Object URL for an image thumbnail; PDFs get an icon. */
  preview?: string;
}

export default function OrderDetailPage() {
  const router = useRouter();
  const id = router.query.id as string;
  const queryClient = useQueryClient();
  const { can } = useCan();
  const canWrite = can("orders:write");
  const [reason, setReason] = useState("");
  const [cancelCode, setCancelCode] = useState("");
  // Irreversible actions confirm first. One dialog drives all three.
  const [confirming, setConfirming] = useState<{
    title: string;
    body: string;
    action: string;
    destructive?: boolean;
    run: () => void;
  } | null>(null);

  const {
    data: order,
    isLoading,
    isError,
    error,
    refetch
  } = useQuery({
    queryKey: ["order", id],
    queryFn: () => getOrder(id),
    enabled: Boolean(id)
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["order", id] });
    queryClient.invalidateQueries({ queryKey: ["queue-counts"] });
    setReason("");
    setCancelCode("");
    setConfirming(null);
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

  const { mutate: cashReceived, isPending: cashPending } = useMutation({
    mutationFn: () => markCashReceived(id, reason || "Collected at office"),
    meta: { showToast: false },
    onSuccess: () => {
      refresh();
      toast.success("Cash recorded");
    },
    onError
  });

  // --- Documents: pick, review, then upload — never straight from the picker.
  const [defaultKind, setDefaultKind] = useState<DocumentKind>("ETICKET");
  const [staged, setStaged] = useState<Staged[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);
  const revoke = (items: Staged[]) =>
    items.forEach((s) => s.preview && URL.revokeObjectURL(s.preview));
  // Thumbnails are object URLs: released when the page goes.
  useEffect(() => () => revoke(staged), [staged]);

  const pick = (list: FileList | null) => {
    if (!list?.length) return;
    const room = MAX_DOCUMENTS_PER_UPLOAD - staged.length;
    const files = Array.from(list);
    if (files.length > room) {
      toast.error(
        `Up to ${MAX_DOCUMENTS_PER_UPLOAD} documents at a time — the first ${room} were added.`
      );
    }
    const next: Staged[] = [];
    for (const file of files.slice(0, Math.max(room, 0))) {
      if (file.size > MAX_DOCUMENT_BYTES) {
        toast.error(`${file.name} is over 15 MB and was skipped.`);
        continue;
      }
      next.push({
        id: `${file.name}-${file.size}-${file.lastModified}-${Math.random()}`,
        file,
        kind: defaultKind,
        preview: file.type.startsWith("image/")
          ? URL.createObjectURL(file)
          : undefined
      });
    }
    setStaged((s) => [...s, ...next]);
    if (fileInput.current) fileInput.current.value = "";
  };
  const unstage = (sid: string) =>
    setStaged((s) => {
      const gone = s.find((x) => x.id === sid);
      if (gone?.preview) URL.revokeObjectURL(gone.preview);
      return s.filter((x) => x.id !== sid);
    });

  const { mutate: attach, isPending: attaching } = useMutation({
    mutationFn: () =>
      attachOrderDocuments(
        id,
        staged.map((s) => ({ file: s.file, kind: s.kind }))
      ),
    meta: { showToast: false },
    onSuccess: () => {
      const n = staged.length;
      setStaged([]);
      refresh();
      toast.success(
        n === 1
          ? "Document attached. The customer has been notified."
          : `${n} documents attached. The customer has been notified once.`
      );
    },
    onError
  });

  const [removing, setRemoving] = useState<OrderDocument | null>(null);
  const { mutate: remove, isPending: removingNow } = useMutation({
    mutationFn: (doc: OrderDocument) => removeOrderDocument(id, doc.id),
    meta: { showToast: false },
    onSuccess: () => {
      setRemoving(null);
      refresh();
      toast.success("Document removed");
    },
    onError
  });

  /** Private files have no URL: each open mints a link that expires. */
  const openDocument = async (key: string) => {
    try {
      const { url } = await getSignedFileUrl(key);
      window.open(assetUrl(url), "_blank", "noopener");
    } catch (err) {
      onError(err);
    }
  };

  if (isLoading) {
    return (
      <AdminLayout title="Order">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </AdminLayout>
    );
  }
  // A 404 is genuinely "not found"; any other failure is an error, not a
  // missing order, so it gets a retry rather than a misleading message.
  if (
    isError &&
    (error as AxiosError)?.response?.status !== 404
  ) {
    return (
      <AdminLayout title="Order">
        <QueryError onRetry={() => refetch()} />
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

  // What can still be done to this order. Completed and cancelled: nothing.
  const closed = order.status === "COMPLETED" || order.status === "CANCELLED";
  const canConfirm = order.status === "SUBMITTED";
  const canComplete =
    order.status === "CONFIRMED" && order.paymentStatus === "PAID";
  const canCash =
    order.paymentMethod === "CASH" && order.paymentStatus !== "PAID" && !closed;
  const canCancel = ["DRAFT", "SUBMITTED", "CONFIRMED"].includes(order.status);
  const hasActions = canConfirm || canComplete || canCash || canCancel;
  const canEditDocuments = canWrite && !closed;

  return (
    <AdminLayout
      title={order.reference}
      description={`Created ${formatDate(order.createdAt)} · via ${label(CHANNEL, order.channel ?? "WEB")}`}
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
          <Badge variant="secondary" className={STATUS_STYLES[order.status]}>
            {label(ORDER_STATUS, order.status)}
          </Badge>
          <Badge
            variant="secondary"
            className={STATUS_STYLES[order.paymentStatus]}
          >
            {label(PAYMENT_STATUS, order.paymentStatus)} ·{" "}
            {label(PAYMENT_METHOD, order.paymentMethod)}
          </Badge>
          <Badge variant="secondary">
            {label(FULFILMENT_STATUS, order.fulfilmentStatus)}
          </Badge>
          <span className="ml-auto text-lg font-semibold tabular-nums">
            {formatMoney(order.total, order.currency)}
          </span>
        </div>

        <Card className="gap-0 p-4">
          <h2 className="mb-4 text-sm font-medium">Progress</h2>
          <Progress order={order} />
        </Card>

        {/* §6.2: everything on one screen — the administrator is on a call and
            cannot navigate tabs while a customer waits. */}
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="flex flex-col gap-4 lg:col-span-2">
            <Card className="gap-0 p-4">
              <h2 className="mb-3 text-sm font-medium">Items</h2>
              {order.items?.map((i: OrderItem) => (
                <div
                  key={i.id}
                  className="flex items-start justify-between gap-4 border-b py-2 last:border-0"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{i.listingLabel}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(i.startDate)} → {formatDate(i.endDate)} · qty{" "}
                      {i.quantity}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm tabular-nums">
                      {formatMoney(i.lineTotal)}
                    </p>
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
                  {order.delivery.zoneName} · fee{" "}
                  {formatMoney(order.delivery.fee)}
                  {order.delivery.etaMinutes
                    ? ` · about ${order.delivery.etaMinutes} min`
                    : ""}
                </p>
              </Card>
            )}

            <Card className="gap-0 p-4">
              <h2 className="mb-3 text-sm font-medium">Travellers</h2>
              {order.travellers?.length ? (
                order.travellers.map((t: Traveller) => (
                  <div
                    key={t.id}
                    className="flex items-center justify-between border-b py-2 last:border-0"
                  >
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
                <p className="text-sm text-muted-foreground">
                  No travellers recorded.
                </p>
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
                  <p className="font-medium">
                    {order.consent.policyVersionLabel}
                  </p>
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
              <h2 className="mb-3 text-sm font-medium">History</h2>
              <ol className="flex flex-col gap-2">
                {order.timeline?.map((t: TimelineEvent, i: number) => (
                  <li key={i} className="flex gap-3 text-sm">
                    <span className="w-40 shrink-0 text-xs text-muted-foreground">
                      {formatDateTime(t.at)}
                    </span>
                    <span>
                      <span className="font-medium" title={t.event}>
                        {label(TIMELINE_EVENT, t.event)}
                      </span>
                      {t.detail && !/^\w+=/.test(t.detail) ? (
                        <span className="text-muted-foreground">
                          {" "}
                          · {t.detail}
                        </span>
                      ) : null}
                      {t.reason ? (
                        <span className="text-muted-foreground">
                          {" "}
                          — {t.reason}
                        </span>
                      ) : null}
                      {t.actorEmail ? (
                        <span className="text-xs text-muted-foreground">
                          {" "}
                          ({t.actorEmail})
                        </span>
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
              <p className="text-sm text-muted-foreground">
                {order.customer?.email}
              </p>
              {order.customer?.phone ? (
                <div className="mt-3 flex gap-2">
                  <a href={`tel:${order.customer.phone}`}>
                    <Button variant="outline" size="sm" className="gap-2">
                      <Phone className="size-3.5" />
                      Call
                    </Button>
                  </a>
                  <a
                    href={`https://wa.me/${order.customer.phone.replace(/\D/g, "")}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <Button variant="outline" size="sm" className="gap-2">
                      <MessageCircle className="size-3.5" />
                      WhatsApp
                    </Button>
                  </a>
                </div>
              ) : null}
            </Card>

            {/* Confirm, cancel and cash received all need orders:write. Once
                the order is completed or cancelled there is nothing left to
                do, so the card goes rather than sitting there empty. */}
            {canWrite && hasActions ? (
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
                  {canConfirm ? (
                    <Button
                      size="sm"
                      disabled={!reason || isPending}
                      onClick={() => transition("CONFIRMED")}
                    >
                      Confirm order
                    </Button>
                  ) : null}

                  {/* The trip happened / the order was handed over. Only a paid
                      order can be completed; the server refuses otherwise. */}
                  {canComplete ? (
                    <Button
                      size="sm"
                      disabled={!reason || isPending}
                      onClick={() =>
                        setConfirming({
                          title: "Mark this order completed?",
                          body: "This closes the booking — the trip is done or the order was handed over. It cannot be reopened.",
                          action: "Mark completed",
                          run: () => transition("COMPLETED")
                        })
                      }
                    >
                      Mark completed
                    </Button>
                  ) : null}

                  {canCash ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={cashPending}
                      onClick={() =>
                        setConfirming({
                          title: "Mark cash as received?",
                          body: "This records the cash as collected and confirms the order. Only do this once the money is in hand.",
                          action: "Mark cash received",
                          run: () => cashReceived()
                        })
                      }
                    >
                      Mark cash received
                    </Button>
                  ) : null}

                  {canCancel ? (
                    <>
                      <Select value={cancelCode} onValueChange={setCancelCode}>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Cancellation reason…" />
                        </SelectTrigger>
                        <SelectContent>
                          {CANCELLATION_REASONS.map(([value, text]) => (
                            <SelectItem key={value} value={value}>
                              {text}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={!reason || !cancelCode || isPending}
                        onClick={() =>
                          setConfirming({
                            title: "Cancel this order?",
                            body: "Inventory is released back to the lot. No money is returned by cancelling — a refund is a separate payment exception. This cannot be undone.",
                            action: "Cancel order",
                            destructive: true,
                            run: () => transition("CANCELLED")
                          })
                        }
                      >
                        Cancel order
                      </Button>
                      {/* §6.4: cancellation must never read as a refund. */}
                      <p className="rounded bg-amber-50 p-2 text-[11px] text-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
                        No money is returned by cancelling. Inventory is
                        released back to the lot. If money genuinely needs to
                        move, that is a payment exception.
                      </p>
                    </>
                  ) : null}
                </div>
              </Card>
            ) : null}

            {closed ? (
              <p className="rounded-lg border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                {order.status === "COMPLETED"
                  ? "This booking is completed — nothing more to do, and its documents are final."
                  : `This booking was cancelled${order.cancellationReason ? ` (${label(CANCELLATION_REASON, order.cancellationReason)})` : ""}.`}
              </p>
            ) : null}

            <Card className="gap-0 p-4">
              <h2 className="mb-2 text-sm font-medium">Documents</h2>
              {order.documents?.length ? (
                <ul className="flex flex-col">
                  {order.documents.map((d: OrderDocument) => (
                    <li
                      key={d.id}
                      className="flex items-center gap-1 rounded px-1 py-1 hover:bg-muted"
                    >
                      <button
                        type="button"
                        onClick={() => openDocument(d.storageKey)}
                        className="flex min-w-0 flex-1 items-center gap-2 text-left text-sm"
                      >
                        <Download className="size-3.5 shrink-0 text-muted-foreground" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate">{d.fileName}</span>
                          <span className="block text-xs text-muted-foreground">
                            {label(DOCUMENT_KIND, d.kind)} · v{d.version} ·{" "}
                            {formatDate(d.uploadedAt)}
                          </span>
                        </span>
                      </button>
                      {canEditDocuments ? (
                        <button
                          type="button"
                          onClick={() => setRemoving(d)}
                          aria-label={`Remove ${d.fileName}`}
                          title="Remove this document"
                          className="shrink-0 rounded p-1.5 text-muted-foreground hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">
                  None attached yet.
                </p>
              )}

              {/* Attaching needs orders:write and an open order. Files are
                  reviewed here first, then sent together; the customer is
                  told once. */}
              {canEditDocuments ? (
                <div className="mt-3 flex flex-col gap-2 border-t pt-3">
                  <Label className="text-xs">Kind for new files</Label>
                  <Select
                    value={defaultKind}
                    onValueChange={(v) => setDefaultKind(v as DocumentKind)}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(DOCUMENT_KIND).map(([value, text]) => (
                        <SelectItem key={value} value={value}>
                          {text}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <input
                    ref={fileInput}
                    type="file"
                    multiple
                    accept="application/pdf,image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={(e) => pick(e.target.files)}
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-2"
                    disabled={attaching || staged.length >= MAX_DOCUMENTS_PER_UPLOAD}
                    onClick={() => fileInput.current?.click()}
                  >
                    <Upload className="size-3.5" />
                    Choose files
                  </Button>

                  {staged.length ? (
                    <ul className="flex flex-col gap-2 rounded-md border p-2">
                      {staged.map((s) => (
                        <li key={s.id} className="flex items-center gap-2">
                          {s.preview ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={s.preview}
                              alt=""
                              className="size-10 shrink-0 rounded object-cover"
                            />
                          ) : (
                            <span className="flex size-10 shrink-0 items-center justify-center rounded bg-muted">
                              <FileText className="size-4 text-muted-foreground" />
                            </span>
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-xs font-medium">
                              {s.file.name}
                            </p>
                            <p className="text-[11px] text-muted-foreground">
                              {fmtSize(s.file.size)}
                            </p>
                          </div>
                          <Select
                            value={s.kind}
                            onValueChange={(v) =>
                              setStaged((all) =>
                                all.map((x) =>
                                  x.id === s.id
                                    ? { ...x, kind: v as DocumentKind }
                                    : x
                                )
                              )
                            }
                          >
                            <SelectTrigger size="sm" className="w-[110px] text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {Object.entries(DOCUMENT_KIND).map(
                                ([value, text]) => (
                                  <SelectItem key={value} value={value}>
                                    {text}
                                  </SelectItem>
                                )
                              )}
                            </SelectContent>
                          </Select>
                          <button
                            type="button"
                            onClick={() => unstage(s.id)}
                            aria-label={`Remove ${s.file.name} from the upload`}
                            className="rounded p-1 text-muted-foreground hover:bg-muted"
                          >
                            <X className="size-3.5" />
                          </button>
                        </li>
                      ))}
                      <li className="flex gap-2 pt-1">
                        <Button
                          size="sm"
                          className="flex-1"
                          disabled={attaching}
                          onClick={() => attach()}
                        >
                          {attaching
                            ? "Uploading…"
                            : `Upload ${staged.length} document${staged.length === 1 ? "" : "s"}`}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={attaching}
                          onClick={() => {
                            revoke(staged);
                            setStaged([]);
                          }}
                        >
                          Clear
                        </Button>
                      </li>
                    </ul>
                  ) : null}

                  <p className="text-[11px] text-muted-foreground">
                    PDF or image, up to 15 MB each, up to{" "}
                    {MAX_DOCUMENTS_PER_UPLOAD} at a time. Tickets and vouchers
                    need the payment recorded first. Attaching the same kind
                    again replaces what the customer sees; a wrong file can be
                    removed until the booking is completed.
                  </p>
                </div>
              ) : null}
            </Card>
          </div>
        </div>
      </div>

      <AlertDialog
        open={Boolean(confirming)}
        onOpenChange={(open) => !open && setConfirming(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirming?.title}</AlertDialogTitle>
            <AlertDialogDescription>{confirming?.body}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending || cashPending}>
              Keep it
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={isPending || cashPending}
              className={
                confirming?.destructive
                  ? "bg-red-600 text-white hover:bg-red-700"
                  : undefined
              }
              onClick={(e) => {
                // Stay open until the mutation succeeds (refresh closes it), so
                // a slow request cannot look like a no-op and invite a re-click.
                e.preventDefault();
                confirming?.run();
              }}
            >
              {confirming?.action}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={Boolean(removing)}
        onOpenChange={(open) => !open && setRemoving(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Remove this {label(DOCUMENT_KIND, removing?.kind).toLowerCase()}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              “{removing?.fileName}” will no longer be downloadable by the
              customer. If it was the only document, the booking goes back to
              “documents pending”. This cannot be undone — upload the right
              file afterwards.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removingNow}>Keep it</AlertDialogCancel>
            <AlertDialogAction
              disabled={removingNow}
              className="bg-red-600 text-white hover:bg-red-700"
              onClick={(e) => {
                e.preventDefault();
                if (removing) remove(removing);
              }}
            >
              {removingNow ? "Removing…" : "Remove document"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminLayout>
  );
}
