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
  markDocumentsDelivered,
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
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
  BASE_CURRENCY,
  formatBytes,
  formatDate,
  formatDateTime,
  formatFrancs,
  formatMoney,
  formatOrderTotal
} from "@/lib/functions/format.lib";
import { lz } from "@/lib/functions/localized.lib";
import { intlLocale } from "@/components/DateField";
import type { TranslationKey } from "@/lib/i18n/messages";
import { useT } from "@/lib/i18n/useT";
import {
  CANCELLATION_REASON,
  CHANNEL,
  DOCUMENT_KIND,
  label,
  ORDER_STAGE,
  ORDER_STATUS,
  PAYMENT_METHOD,
  PAYMENT_STATUS,
  STAGE_STYLES,
  TIMELINE_EVENT
} from "@/lib/functions/labels.lib";
import { useCan } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AxiosError } from "axios";
import { formatPhoneNumberIntl } from "react-phone-number-input";
import {
  ArrowLeft,
  Bike,
  CarFront,
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
import { Fragment, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

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
function orderSteps(
  order: OrderDetail,
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string
): Step[] {
  const at = (events: string[]) =>
    order.timeline?.find((e) => events.includes(e.event))?.at;
  const paid = order.paymentStatus === "PAID";
  const cash = order.paymentMethod === "CASH";
  // A ride's cash goes to the driver at the end of the ride, not to the
  // office; its deadline (the ride + 24 h) only says when an unpaid one lapses.
  const ride = Boolean(order.items?.some((i) => i.vertical === "TRANSFER"));
  // A vehicle sale: its papers issued is "ready to collect", completed is "collected".
  const sale = Boolean(order.items?.some((i) => i.vertical === "VEHICLE_SALE"));
  const completed = order.status === "COMPLETED";
  // Handed over: a ticket or voucher attached, or confirmed given another way.
  const documents =
    order.fulfilmentStatus === "DOCUMENTS_ISSUED" ||
    order.fulfilmentStatus === "DELIVERED";

  const planned = [
    {
      label: t("ops.order.step.created"),
      done: true,
      at: order.createdAt ?? at(["ORDER_CREATED"])
    },
    cash
      ? {
          label: paid
            ? ride
              ? t("ops.order.step.cashReceived")
              : t("ops.order.step.cashReceivedOffice")
            : ride
              ? t("ops.order.step.cashToDriver")
              : t("ops.order.step.awaitingCash"),
          done: paid,
          at: at(["CASH_RECEIVED", "PAYMENT_RECEIVED"]),
          note:
            !paid && order.cashDeadline
              ? ride
                ? t("ops.order.step.driverNote", { date: formatDateTime(order.cashDeadline) })
                : t("ops.order.step.payBy", { date: formatDateTime(order.cashDeadline) })
              : undefined
        }
      : {
          label: paid ? t("ops.order.step.paymentReceived") : t("ops.order.step.awaitingPayment"),
          done: paid,
          at: at(["PAYMENT_RECEIVED"])
        },
    ...(order.delivery
      ? [{ label: t("ops.order.step.delivered"), done: completed, at: at(["STATUS_COMPLETED"]) }]
      : ride
        ? // A ride has no ticket or voucher to issue: the driver is the delivery.
          [
            {
              label: t("ops.order.step.completed"),
              done: completed,
              at: at(["STATUS_COMPLETED"])
            }
          ]
        : [
            {
              label: sale
                ? t("vs.order.step.ready")
                : documents
                  ? t("ops.order.step.documentsIssued")
                  : t("ops.order.step.documentsToIssue"),
              done: documents,
              at: at(["DOCUMENTS_ISSUED", "DOCUMENTS_DELIVERED"])
            },
            {
              label: sale ? t("vs.order.step.collected") : t("ops.order.step.completed"),
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
        label: t("ops.order.step.cancelled"),
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
  const { t } = useT();
  const steps = orderSteps(order, t);
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

/** What a new file most likely is, from what was booked; each file can still be changed. */
const kindFor = (order?: OrderDetail): DocumentKind => {
  const v = order?.items?.[0]?.vertical;
  return v === "FLIGHT" || v === "BUS" ? "ETICKET" : v === "RESTAURANT" ? "INVOICE" : "VOUCHER";
};

interface Staged {
  id: string;
  file: File;
  kind: DocumentKind;
  /** Object URL for an image thumbnail; PDFs get an icon. */
  preview?: string;
}

/**
 * A bus or flight departure as timetabled, or a car's pick-up or return: the
 * date and the wall-clock time, stored without a zone — so read in UTC, never
 * moved by this computer's zone.
 */
const departure = (iso: string | undefined, locale: string) => {
  if (!iso) return "—";
  // English day first, as before; the other languages as they write dates.
  const day = new Date(iso).toLocaleDateString(locale === "en" ? "en-GB" : intlLocale(locale), {
    timeZone: "UTC",
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric"
  });
  return `${day}, ${iso.slice(11, 16)}`;
};

/** A translation with React nodes in its {placeholders}: a date in bold, say. */
const rich = (text: string, nodes: Record<string, React.ReactNode>) =>
  text.split(/(\{\w+\})/).map((part, i) => {
    const name = /^\{(\w+)\}$/.exec(part)?.[1];
    return <Fragment key={i}>{name && name in nodes ? nodes[name] : part}</Fragment>;
  });

/** "2 adults, 1 child, 1 baby". */
const travellers = (
  p: { adults: number; children: number; infants: number },
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string
) =>
  [
    p.adults ? t(p.adults > 1 ? "ops.order.adults.other" : "ops.order.adults.one", { n: p.adults }) : "",
    p.children
      ? t(p.children > 1 ? "ops.order.children.other" : "ops.order.children.one", { n: p.children })
      : "",
    p.infants
      ? t(p.infants > 1 ? "ops.order.babies.other" : "ops.order.babies.one", { n: p.infants })
      : ""
  ]
    .filter(Boolean)
    .join(", ");

export default function OrderDetailPage() {
  const router = useRouter();
  const id = router.query.id as string;
  const queryClient = useQueryClient();
  const { can } = useCan();
  const { t, locale } = useT();
  const canWrite = can("orders:write");
  // The MaxiCash reference of an online payment confirmed by hand.
  const [reason, setReason] = useState("");
  // Cancelling asks for its own reason, in its own dialog.
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelCode, setCancelCode] = useState("");
  const [cancelNote, setCancelNote] = useState("");
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
    setCancelNote("");
    setCancelOpen(false);
    setConfirming(null);
  };

  const onError = (err: unknown) =>
    toast.error(
      (err as AxiosError<{ message?: string }>).response?.data?.message ??
        t("ops.order.actionFailed")
    );

  const { mutate: transition, isPending } = useMutation({
    mutationFn: (to: string) =>
      transitionOrder(id, {
        to,
        reason: to === "CANCELLED" ? cancelNote.trim() : undefined,
        cancellationReason: to === "CANCELLED" ? cancelCode : undefined
      }),
    meta: { showToast: false },
    onSuccess: () => {
      refresh();
      toast.success(t("ops.order.updated"));
    },
    onError
  });

  // Cash in hand — or, for an online order, a payment the office has found in
  // its MaxiCash account. The server tells the two apart, and for the second
  // refuses an empty reason: no stand-in is sent for it.
  const { mutate: cashReceived, isPending: cashPending } = useMutation({
    mutationFn: (cashOrder: boolean) =>
      markCashReceived(
        id,
        reason ||
          (cashOrder &&
          // A ride's cash is handed to the driver. Otherwise no note: it may have
          // come in at the counter or by mobile money, and the history says "received".
          order?.items?.some((i) => i.vertical === "TRANSFER")
            ? "Collected by the driver"
            : "")
      ),
    meta: { showToast: false },
    onSuccess: () => {
      refresh();
      toast.success(t("ops.order.paymentRecorded"));
    },
    onError
  });

  // "Confirm document submission": handed over, attached here or another way.
  const { mutate: documentsDelivered, isPending: docsPending } = useMutation({
    mutationFn: () => markDocumentsDelivered(id, reason || undefined),
    meta: { showToast: false },
    onSuccess: () => {
      refresh();
      toast.success(t("ops.order.updated"));
    },
    onError
  });

  // --- Documents: pick, review, then upload — never straight from the picker.
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
      toast.error(t("ops.order.tooManyFiles", { max: MAX_DOCUMENTS_PER_UPLOAD, room }));
    }
    const next: Staged[] = [];
    for (const file of files.slice(0, Math.max(room, 0))) {
      if (file.size > MAX_DOCUMENT_BYTES) {
        toast.error(t("ops.order.fileTooBig", { name: file.name }));
        continue;
      }
      next.push({
        id: `${file.name}-${file.size}-${file.lastModified}-${Math.random()}`,
        file,
        kind: kindFor(order),
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
        n === 1 ? t("ops.order.attached.one") : t("ops.order.attached.other", { n })
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
      toast.success(t("ops.order.documentRemoved"));
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
      <AdminLayout title={t("ops.order.title")}>
        <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
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
      <AdminLayout title={t("ops.order.title")}>
        <QueryError onRetry={() => refetch()} />
      </AdminLayout>
    );
  }
  if (!order) {
    return (
      <AdminLayout title={t("ops.order.title")}>
        <p className="text-sm text-muted-foreground">{t("ops.order.notFound")}</p>
      </AdminLayout>
    );
  }

  // What can still be done to this order. Completed and cancelled: nothing.
  const closed = order.status === "COMPLETED" || order.status === "CANCELLED";
  const cashOrder = order.paymentMethod === "CASH";
  /**
   * The workflow (2026-11-06), one step forward at a time — the server says
   * which stage the booking is in:
   *   cash pending → "Confirm the payment"
   *   cash paid, pending document → "Confirm document submission"
   *   document delivered, pending completion → "Confirm the reservation is completed"
   * A meal or a ride has no documents: once paid, it goes straight to completion.
   *
   * Confirming the payment by hand: for a cash order the money is at the
   * counter; for an online one MaxiCash has it and its notice never reached
   * the site — the office has seen it in its MaxiCash account.
   */
  const stage = order.stage ?? "";
  const canPay =
    (stage === "CASH_PENDING" || stage === "PAYMENT_PENDING") &&
    order.paymentStatus !== "REVERSED";
  const canDocuments = stage.endsWith("PENDING_DOCUMENT");
  const canComplete = stage.endsWith("PENDING_COMPLETION");
  const canCancel = ["DRAFT", "SUBMITTED", "CONFIRMED"].includes(order.status);
  // A transfer booking is its ride: cancelling one cancels the other (server hook).
  const hasRide = Boolean(order.items?.some((i) => i.vertical === "TRANSFER"));
  const hasTickets = Boolean(order.documents?.some((d) => d.kind !== "INVOICE"));
  // The one thing to do now: what it is, in plain words, and its button.
  const next = canPay
    ? {
        hint: cashOrder ? t("ops.order.next.cash") : t("ops.order.next.online"),
        label: t("ops.order.confirmPayment"),
        busy: cashPending,
        needsReference: !cashOrder,
        run: () =>
          setConfirming(
            cashOrder
              ? {
                  title: t("ops.order.cashTitle"),
                  body: t("ops.order.cashBody"),
                  action: t("ops.order.confirmPayment"),
                  run: () => cashReceived(true)
                }
              : {
                  title: t("ops.order.onlineTitle"),
                  body: t("ops.order.onlineBody"),
                  action: t("ops.order.confirmPayment"),
                  run: () => cashReceived(false)
                }
          )
      }
    : canDocuments
      ? {
          hint: t("ops.order.next.documents"),
          label: t("ops.order.confirmDocuments"),
          busy: docsPending,
          needsReference: false,
          run: () =>
            setConfirming({
              title: t("ops.order.docsTitle"),
              // Nothing attached: say so, so it is a choice, not a slip.
              body: hasTickets ? t("ops.order.docsBody") : t("ops.order.docsBodyNone"),
              action: t("ops.order.confirmDocuments"),
              run: () => documentsDelivered()
            })
        }
      : canComplete
        ? {
            hint: t("ops.order.next.complete"),
            label: t("ops.order.confirmCompleted"),
            busy: isPending,
            needsReference: false,
            run: () =>
              setConfirming({
                title: t("ops.order.completeTitle"),
                // An ended ride was announced then: the server does not text its booking again.
                body: hasRide ? t("ops.order.completeBodyRide") : t("ops.order.completeBody"),
                action: t("ops.order.confirmCompleted"),
                run: () => transition("COMPLETED")
              })
          }
        : null;
  const canEditDocuments = canWrite && !closed;

  return (
    <AdminLayout
      title={order.reference}
      description={t("ops.order.description", {
        date: formatDate(order.createdAt),
        channel: label(CHANNEL, order.channel ?? "WEB")
      })}
    >
      <div className="flex flex-col gap-6">
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/bookings">
            <Button variant="ghost" size="sm" className="gap-2">
              <ArrowLeft className="size-4 rtl:-scale-x-100" />
              {t("book.title")}
            </Button>
          </Link>
          {/* Where the booking is in the workflow, then how it is paid. */}
          <Badge
            variant="secondary"
            className={stage ? STAGE_STYLES[stage] : STATUS_STYLES[order.status]}
          >
            {stage ? label(ORDER_STAGE, stage) : label(ORDER_STATUS, order.status)}
          </Badge>
          <Badge
            variant="secondary"
            className={STATUS_STYLES[order.paymentStatus]}
          >
            {label(PAYMENT_STATUS, order.paymentStatus)} ·{" "}
            {label(PAYMENT_METHOD, order.paymentMethod)}
          </Badge>
          <span className="ms-auto text-end">
            {/* What the customer was charged, with its francs when that was
                dollars or euros. */}
            <span className="block text-lg font-semibold tabular-nums">
              {formatOrderTotal(order, locale)}
            </span>
            {/* And at which rate. An order the conversion to francs has not
                reached yet (still USD) has its rate the other way round. */}
            {order.fxRate &&
            order.currency === BASE_CURRENCY &&
            order.chargedCurrency &&
            order.chargedCurrency !== BASE_CURRENCY ? (
              <span className="block text-xs text-muted-foreground tabular-nums">
                {t("ops.order.rateWhenBooked", {
                  currency: order.chargedCurrency,
                  rate: formatFrancs(order.fxRate, locale, 2)
                })}
              </span>
            ) : null}
          </span>
        </div>

        {/* Where the booking is and the one thing to do next, at the top:
            the office works down the steps, one button at a time. */}
        <Card className="gap-0 p-4">
          <h2 className="mb-4 text-sm font-medium">{t("ops.order.progress")}</h2>
          <Progress order={order} />
          {canWrite && next ? (
            <div className="mt-5 flex flex-col gap-3 rounded-lg bg-muted/60 p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
              <div className="min-w-0 max-w-prose">
                <h3 className="text-sm font-medium">{t("ops.order.nextStep")}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{next.hint}</p>
                {next.needsReference ? (
                  <div className="mt-3 flex max-w-xs flex-col gap-1.5">
                    <Label htmlFor="maxicash-ref" className="text-xs">
                      {t("ops.order.maxicashRef")}
                    </Label>
                    <Input
                      id="maxicash-ref"
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      className="bg-background"
                    />
                  </div>
                ) : null}
              </div>
              <Button
                className="shrink-0"
                disabled={next.busy || (next.needsReference && !reason.trim())}
                onClick={next.run}
              >
                {next.label}
              </Button>
            </div>
          ) : null}
          {closed ? (
            <p className="mt-5 rounded-lg bg-muted/60 px-4 py-3 text-sm text-muted-foreground">
              {order.status === "COMPLETED"
                ? t("ops.order.closedCompleted")
                : order.cancellationReason
                  ? t("ops.order.closedCancelledWhy", {
                      reason: label(CANCELLATION_REASON, order.cancellationReason)
                    })
                  : t("ops.order.closedCancelled")}
            </p>
          ) : null}
          {/* Rare and irreversible: quiet, apart from the next step, and
              behind its own dialog with its reason. */}
          {canWrite && canCancel ? (
            <div className="mt-2 flex justify-end">
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5 text-muted-foreground hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950/40 dark:hover:text-red-300"
                onClick={() => setCancelOpen(true)}
              >
                <XCircle className="size-3.5" />
                {t("ops.order.cancel")}
              </Button>
            </div>
          ) : null}
        </Card>

        {/* §6.2: everything on one screen — the administrator is on a call and
            cannot navigate tabs while a customer waits. */}
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="flex flex-col gap-4 lg:col-span-2">
            <Card className="gap-0 p-4">
              <h2 className="mb-3 text-sm font-medium">{t("ops.order.items")}</h2>
              {order.items?.map((i: OrderItem) => (
                <div
                  key={i.id}
                  className="flex items-start justify-between gap-4 border-b py-2 last:border-0"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium">
                      {i.listingLabel}
                      {(i.vertical === "FLIGHT" || i.vertical === "BUS") &&
                      i.tripScope === "INTERNATIONAL" ? (
                        <Badge
                          variant="outline"
                          className="ms-2 border-sky-300 align-middle text-sky-700 dark:text-sky-300"
                        >
                          {t("trip.INTERNATIONAL")}
                        </Badge>
                      ) : null}
                    </p>
                    {i.vertical === "TRANSFER" ? (
                      // A ride with a driver: the pick-up time, and the ride
                      // itself — where it is assigned, followed and cancelled.
                      <p className="text-xs text-muted-foreground">
                        {rich(t("ops.order.ridePickup"), {
                          date: (
                            <span className="font-medium text-foreground">
                              {departure(i.startDate, locale)}
                            </span>
                          )
                        })}
                        {i.rideId ? (
                          <>
                            {" · "}
                            <Link
                              href={`/transfers/rides/${i.rideId}`}
                              className="underline underline-offset-2"
                            >
                              {t("ops.order.openRide")}
                            </Link>
                          </>
                        ) : null}
                      </p>
                    ) : i.vertical === "VEHICLE_SALE" ? (
                      // A vehicle for sale: its stock ref, its parking, and the vehicle itself.
                      <p className="text-xs text-muted-foreground">
                        {i.stockRef ? (
                          <span className="font-mono" dir="ltr">
                            {i.stockRef}
                          </span>
                        ) : null}
                        {order.pickup ? ` · ${lz(order.pickup.name)}, ${order.pickup.city}` : ""}
                        {i.vehicleId || i.stockRef ? (
                          <>
                            {" · "}
                            <Link
                              href={
                                i.vehicleId
                                  ? `/vehicle-sales/vehicles/${i.vehicleId}`
                                  : `/vehicle-sales?q=${encodeURIComponent(i.stockRef ?? "")}`
                              }
                              className="underline underline-offset-2"
                            >
                              {t("vs.order.openVehicle")}
                            </Link>
                          </>
                        ) : null}
                      </p>
                    ) : i.passengers ? (
                      <>
                        {/* A bus or flight: the departure the customer chose,
                            and who is travelling — each fare is its own price. */}
                        <p className="text-xs text-muted-foreground">
                          {i.origin} <span className="inline-block rtl:-scale-x-100">→</span> {i.destination} ·{" "}
                          {rich(t("ops.order.departs"), {
                            date: (
                              <span className="font-medium text-foreground">
                                {departure(i.startDate, locale)}
                              </span>
                            )
                          })}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {travellers(i.passengers, t)}
                          {i.baggage
                            ? ` · ${t("ops.order.bags", { cabin: i.baggage.cabinKg, checked: i.baggage.checkedKg })}`
                            : ""}
                        </p>
                      </>
                    ) : i.rentalHours ? (
                      // A car rented by the hour: pick-up and return are times, not just days.
                      <p className="text-xs text-muted-foreground">
                        {rich(t("ops.order.hourlyRental"), {
                          from: (
                            <span className="font-medium text-foreground">
                              {departure(i.startDate, locale)}
                            </span>
                          ),
                          to: (
                            <span className="font-medium text-foreground">
                              {departure(i.endDate, locale)}
                            </span>
                          ),
                          arrow: <span className="inline-block rtl:-scale-x-100">→</span>
                        })}{" "}
                        · {t("ops.order.hoursQty", { hours: i.rentalHours, qty: i.quantity })}
                      </p>
                    ) : i.startDate ? (
                      <p className="text-xs text-muted-foreground">
                        {formatDate(i.startDate)} <span className="inline-block rtl:-scale-x-100">→</span>{" "}
                        {formatDate(i.endDate)} · {t("ops.order.qty", { qty: i.quantity })}
                      </p>
                    ) : (
                      // A meal or a Duty Free product has no dates: just how many.
                      <p className="text-xs text-muted-foreground">
                        {t("ops.order.qty", { qty: i.quantity })}
                      </p>
                    )}
                    {i.supplier ? (
                      <p className="mt-1.5 rounded-md bg-muted/60 px-2 py-1 text-xs">
                        {t("ops.order.supplier")} <span className="font-medium">{i.supplier.name}</span>
                        {i.supplier.contactName ? ` · ${i.supplier.contactName}` : ""}
                        {i.supplier.phone ? (
                          <>
                            {" · "}
                            <a
                              href={`tel:${i.supplier.phone.replace(/\s/g, "")}`}
                              className="underline underline-offset-2"
                            >
                              {i.supplier.phone}
                            </a>
                          </>
                        ) : null}
                        {i.supplier.email ? (
                          <>
                            {" · "}
                            <a
                              href={`mailto:${i.supplier.email}`}
                              className="underline underline-offset-2"
                            >
                              {i.supplier.email}
                            </a>
                          </>
                        ) : null}
                        {i.supplier.address ? ` · ${i.supplier.address}` : ""}
                      </p>
                    ) : null}
                  </div>
                  <div className="shrink-0 text-end">
                    <p className="text-sm tabular-nums">
                      {formatMoney(i.lineTotal, order.currency, locale)}
                    </p>
                    {/* Admin-only: cost and margin never reach the public API. */}
                    <p className="text-[11px] text-muted-foreground tabular-nums">
                      {t(i.passengers ? "ops.order.costMarginAdult" : "ops.order.costMarginUnit", {
                        cost: formatMoney(i.unitCostPrice, order.currency, locale),
                        margin: formatMoney(i.margin, order.currency, locale)
                      })}
                    </p>
                  </div>
                </div>
              ))}
              {/* Once per order, whatever the quantity: in the total, not an item. */}
              {order.processingFee ? (
                <div className="flex items-center justify-between gap-4 border-t py-2 text-sm">
                  <span>{t("ops.order.processingFees")}</span>
                  <span className="tabular-nums">
                    {formatOrderTotal(
                      {
                        total: order.processingFee,
                        currency: order.currency,
                        chargedTotal: order.processingFeeCharged,
                        chargedCurrency: order.chargedCurrency
                      },
                      locale
                    )}
                  </span>
                </div>
              ) : null}
            </Card>

            {/* A food order is dispatched, not ticketed. The address and the
                driver's note are the operative facts on the record, so they go
                above the travel blocks rather than under them. */}
            {order.delivery && (
              <Card className="gap-0 border-sky-200 p-4 dark:border-sky-900">
                <h2 className="mb-2 flex items-center gap-2 text-sm font-medium">
                  <Bike className="size-4 text-sky-600" />
                  {t("ops.order.delivery")}
                </h2>
                <p className="text-sm font-medium">{order.delivery.address}</p>
                {order.delivery.notes && (
                  <p className="mt-1 text-sm text-muted-foreground">
                    {order.delivery.notes}
                  </p>
                )}
                <p className="mt-2 text-xs text-muted-foreground tabular-nums">
                  {lz(order.delivery.zoneName)} · {t("ops.order.fee")}{" "}
                  {formatOrderTotal(
                    {
                      total: order.delivery.fee,
                      currency: order.currency,
                      chargedTotal: order.delivery.feeCharged,
                      chargedCurrency: order.chargedCurrency
                    },
                    locale
                  )}
                  {order.delivery.etaMinutes
                    ? ` · ${t("ops.order.eta", { n: order.delivery.etaMinutes })}`
                    : ""}
                </p>
              </Card>
            )}

            {/* A vehicle sale is collected, not delivered: the parking as the customer was told it. */}
            {order.pickup && (
              <Card className="gap-0 border-sky-200 p-4 dark:border-sky-900">
                <h2 className="mb-2 flex items-center gap-2 text-sm font-medium">
                  <CarFront className="size-4 text-sky-600" />
                  {t("vs.order.pickup")}
                </h2>
                <p className="text-sm font-medium">
                  {order.pickup.parkingId ? (
                    <Link
                      href={`/vehicle-sales/parkings/${order.pickup.parkingId}`}
                      className="underline-offset-2 hover:underline"
                    >
                      {lz(order.pickup.name)}
                    </Link>
                  ) : (
                    lz(order.pickup.name)
                  )}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {[order.pickup.address, order.pickup.city].filter(Boolean).join(", ")}
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  {[
                    lz(order.pickup.openingHours),
                    order.pickup.phone
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                  {order.pickup.geo ? (
                    <>
                      {" · "}
                      <a
                        href={`https://maps.google.com/?q=${order.pickup.geo.lat},${order.pickup.geo.lng}`}
                        target="_blank"
                        rel="noreferrer"
                        className="underline underline-offset-2"
                      >
                        {t("vs.order.map")}
                      </a>
                    </>
                  ) : null}
                </p>
              </Card>
            )}

            <Card className="gap-0 p-4">
              <h2 className="mb-3 text-sm font-medium">{t("ops.order.travellers")}</h2>
              {order.travellers?.length ? (
                order.travellers.map((tr: Traveller) => (
                  <div
                    key={tr.id}
                    className="flex items-center justify-between border-b py-2 last:border-0"
                  >
                    <span className="text-sm">
                      {tr.firstName} {tr.lastName}
                    </span>
                    <span className="font-mono text-xs text-muted-foreground">
                      {/* §6.2 / §14.5: masked by default; unmasking is
                          step-up gated, reason-required and logged. */}
                      {tr.documentType}: {tr.documentNumberMasked ?? "—"}
                    </span>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">
                  {t("ops.order.noTravellers")}
                </p>
              )}
            </Card>

            {/* §6.2 / §9.3: this is what defends a chargeback. */}
            <Card className="gap-0 border-emerald-200 p-4 dark:border-emerald-900">
              <h2 className="mb-2 flex items-center gap-2 text-sm font-medium">
                <ShieldAlert className="size-4 text-emerald-600" />
                {t("ops.order.consent")}
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
                    {t("ops.order.consentAccepted", {
                      date: formatDateTime(order.consent.acceptedAt),
                      locale: order.consent.locale,
                      ip: order.consent.ip
                    })}
                  </p>
                </div>
              ) : (
                <p className="text-sm text-red-600 dark:text-red-400">
                  {t("ops.order.noConsent")}
                </p>
              )}
              {/* An international flight or bus: the box the customer ticked to book it. */}
              {order.visaConfirmedAt ? (
                <p className="mt-2 border-t pt-2 text-xs">
                  {t("trip.visaConfirmed", { date: formatDateTime(order.visaConfirmedAt) })}
                </p>
              ) : null}
            </Card>

            <Card className="gap-0 p-4">
              <h2 className="mb-3 text-sm font-medium">{t("ops.order.history")}</h2>
              <ol className="flex flex-col gap-2">
                {order.timeline?.map((ev: TimelineEvent, i: number) => (
                  <li key={i} className="flex gap-3 text-sm">
                    <span className="w-40 shrink-0 text-xs text-muted-foreground">
                      {formatDateTime(ev.at)}
                    </span>
                    <span>
                      <span className="font-medium" title={ev.event}>
                        {label(TIMELINE_EVENT, ev.event)}
                      </span>
                      {ev.detail && !/^\w+=/.test(ev.detail) ? (
                        <span className="text-muted-foreground">
                          {" "}
                          · {ev.detail}
                        </span>
                      ) : null}
                      {ev.reason ? (
                        <span className="text-muted-foreground">
                          {" "}
                          — {ev.reason}
                        </span>
                      ) : null}
                      {ev.actorEmail ? (
                        <span className="text-xs text-muted-foreground">
                          {" "}
                          ({ev.actorEmail})
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
              <h2 className="mb-3 text-sm font-medium">{t("book.customer")}</h2>
              {/* The number beside the name: read out while the booking is handled. */}
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <p className="font-medium">{order.customer?.fullName}</p>
                {order.customer?.phone ? (
                  <a
                    href={`tel:${order.customer.phone}`}
                    dir="ltr"
                    className="text-sm tabular-nums underline-offset-2 hover:underline"
                  >
                    {formatPhoneNumberIntl(order.customer.phone) || order.customer.phone}
                  </a>
                ) : null}
              </div>
              {order.customer?.email ? (
                <p className="text-sm text-muted-foreground">{order.customer.email}</p>
              ) : null}
              {order.customer?.phone ? (
                <div className="mt-3 flex gap-2">
                  <a href={`tel:${order.customer.phone}`}>
                    <Button variant="outline" size="sm" className="gap-2">
                      <Phone className="size-3.5" />
                      {t("ops.order.call")}
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

            <Card className="gap-0 p-4">
              <h2 className="mb-2 text-sm font-medium">{t("book.documents")}</h2>
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
                        className="flex min-w-0 flex-1 items-center gap-2 text-start text-sm"
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
                          aria-label={t("ops.order.removeFile", { name: d.fileName })}
                          title={t("ops.order.removeDocumentHint")}
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
                  {t("ops.order.noDocuments")}
                </p>
              )}

              {/* Attaching needs orders:write and an open order. Files are
                  reviewed here first, then sent together; the customer is
                  told once. */}
              {canEditDocuments ? (
                <div className="mt-3 flex flex-col gap-2 border-t pt-3">
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
                    {t("ops.order.chooseFiles")}
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
                              {formatBytes(s.file.size)}
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
                            aria-label={t("ops.order.unstage", { name: s.file.name })}
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
                            ? t("ops.order.uploading")
                            : t(staged.length === 1 ? "ops.order.upload.one" : "ops.order.upload.other", {
                                n: staged.length
                              })}
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
                          {t("ops.order.clear")}
                        </Button>
                      </li>
                    </ul>
                  ) : null}

                  <p className="text-[11px] text-muted-foreground">
                    {t("ops.order.uploadHint", { max: MAX_DOCUMENTS_PER_UPLOAD })}
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
              {t("ops.order.keepIt")}
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

      <Dialog
        open={cancelOpen}
        onOpenChange={(open) => !isPending && setCancelOpen(open)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("ops.order.cancelTitle")}</DialogTitle>
            {/* §6.4: cancellation must never read as a refund. */}
            <DialogDescription>
              {hasRide ? t("ops.order.cancelBodyRide") : t("ops.order.cancelBody")}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            {/* §6.4: fixed reason-code list. Cancellation is operational, not financial. */}
            <Select value={cancelCode} onValueChange={setCancelCode}>
              <SelectTrigger className="w-full" aria-label={t("ops.order.cancelReasonPlaceholder")}>
                <SelectValue placeholder={t("ops.order.cancelReasonPlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(CANCELLATION_REASON).map(([value, text]) => (
                  <SelectItem key={value} value={value}>
                    {text}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cancel-note" className="text-xs">
                {t("common.reasonRequired")}
              </Label>
              <Input
                id="cancel-note"
                value={cancelNote}
                onChange={(e) => setCancelNote(e.target.value)}
                placeholder={t("ops.order.reasonPlaceholder")}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" disabled={isPending} onClick={() => setCancelOpen(false)}>
              {t("ops.order.keepIt")}
            </Button>
            <Button
              variant="destructive"
              disabled={!cancelCode || !cancelNote.trim() || isPending}
              onClick={() => transition("CANCELLED")}
            >
              {t("ops.order.cancel")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={Boolean(removing)}
        onOpenChange={(open) => !open && setRemoving(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("ops.order.removeTitle", { kind: label(DOCUMENT_KIND, removing?.kind).toLowerCase() })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("ops.order.removeBody", { name: removing?.fileName ?? "" })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removingNow}>{t("ops.order.keepIt")}</AlertDialogCancel>
            <AlertDialogAction
              disabled={removingNow}
              className="bg-red-600 text-white hover:bg-red-700"
              onClick={(e) => {
                e.preventDefault();
                if (removing) remove(removing);
              }}
            >
              {removingNow ? t("ops.order.removing") : t("ops.order.removeDocument")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminLayout>
  );
}
