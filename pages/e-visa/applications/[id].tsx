import { assetUrl } from "@/api/endpoints";
import {
  attachVisaDocuments,
  confirmVisaPayment,
  getVisaApplication,
  getVisaDocumentLink,
  removeVisaDocument,
  saveVisaNote,
  transitionVisa,
  unmaskVisaPassport,
  VISA_MAX_FILE_BYTES,
  VISA_MAX_FILES,
  type VisaApplication,
  type VisaCancelReason,
  type VisaDocument,
  type VisaDocumentKind,
  type VisaStatus,
  type VisaTransition
} from "@/api/functions/visa.api";
import DateField, { DateTimeField } from "@/components/DateField";
import { OptionSelect } from "@/components/Form/OptionSelect";
import AdminLayout from "@/components/Layout/AdminLayout";
import QueryError from "@/components/QueryError";
import {
  day,
  regionName,
  RushBadge,
  travellerName,
  visaFee,
  VisaPaymentBadge,
  errorCode,
  VisaStatusBadge,
  visaError,
  wallClock
} from "@/components/visa/shared";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { humanize } from "@/lib/functions/labels.lib";
import { formatBytes, formatDate, formatDateTime, formatMoney } from "@/lib/functions/format.lib";
import { lz } from "@/lib/functions/localized.lib";
import type { TranslationKey } from "@/lib/i18n/messages";
import { useT } from "@/lib/i18n/useT";
import { useCan } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  CheckCircle2,
  Circle,
  CircleDot,
  Download,
  Eye,
  FileText,
  MessageCircle,
  Phone,
  Trash2,
  Upload,
  X,
  XCircle
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useRef, useState } from "react";
import { formatPhoneNumberIntl } from "react-phone-number-input";
import { toast } from "sonner";

type Translate = ReturnType<typeof useT>["t"];

const KINDS: VisaDocumentKind[] = ["VISA", "PASSPORT", "PHOTO", "HOTEL", "INVITATION", "OTHER"];
const CANCEL_REASONS: VisaCancelReason[] = [
  "CUSTOMER_REQUEST",
  "NOT_PAID",
  "INCOMPLETE",
  "DUPLICATE",
  "OTHER"
];
/** The moves the office can cancel from (the customer can too). */
const CANCELLABLE: VisaStatus[] = ["SUBMITTED", "IN_REVIEW", "INFO_REQUESTED"];
const OPEN: VisaStatus[] = [
  "SUBMITTED",
  "IN_REVIEW",
  "INFO_REQUESTED",
  "LODGED",
  "APPOINTMENT",
  "APPROVED",
  "REFUSED"
];

/** How far along each status is: received 0, review 1, lodged 2, decided 3, done 4. */
const RANK: Record<VisaStatus, number> = {
  SUBMITTED: 0,
  IN_REVIEW: 1,
  INFO_REQUESTED: 1,
  LODGED: 2,
  APPOINTMENT: 2,
  APPROVED: 3,
  REFUSED: 3,
  COMPLETED: 4,
  CANCELLED: -1
};

/** A YYYY-MM-DD `n` months later, on the calendar (UTC: a day, not an instant). */
const addMonths = (ymd: string, n: number) => {
  const d = new Date(`${ymd.slice(0, 10)}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 10);
};
/** Whole days from today to a YYYY-MM-DD. */
const daysUntil = (ymd: string) =>
  Math.round(
    (Date.parse(`${ymd.slice(0, 10)}T00:00:00Z`) -
      Date.parse(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`)) /
      86_400_000
  );
/** Full years between two YYYY-MM-DD. */
const yearsBetween = (from: string, to: string) => {
  const [y1, m1, d1] = from.slice(0, 10).split("-").map(Number);
  const [y2, m2, d2] = to.slice(0, 10).split("-").map(Number);
  return y2 - y1 - (m2 < m1 || (m2 === m1 && d2 < d1) ? 1 : 0);
};

/** A history line's words: a status by its name, anything else from visa.event.*, else title-cased. */
const eventLabel = (event: string, t: Translate) => {
  const code = event.replace(/^(STATUS_|VISA_)/, "");
  const key = (Object.hasOwn(RANK, code) ? `visa.status.${code}` : `visa.event.${code}`) as TranslationKey;
  const text = t(key);
  return text === key ? humanize(event) : text;
};

type StepState = "done" | "current" | "todo" | "cancelled";
interface Step {
  label: string;
  state: StepState;
  at?: string;
  note?: string;
  /** Happened, but not the way anyone hoped: a refusal. */
  bad?: boolean;
}

/** Received → Review → Lodged → Decision → Completed, from the status. */
function visaSteps(a: VisaApplication, t: Translate): Step[] {
  const at = (...codes: string[]) =>
    a.timeline?.find((e) => codes.some((c) => e.event === c || e.event.endsWith(`_${c}`)))?.at;
  const r = RANK[a.status];
  const refused = a.status === "REFUSED" || a.decision?.outcome === "REFUSED";
  const unpaid = a.paymentStatus !== "PAID";

  const planned = [
    { label: t("visa.step.received"), done: true, at: a.createdAt },
    {
      label: t("visa.step.review"),
      done: r >= 2,
      at: at("IN_REVIEW"),
      note:
        a.status === "INFO_REQUESTED"
          ? t("visa.step.waitingCustomer")
          : r < 2 && unpaid
            ? t("visa.step.feeUnpaid")
            : undefined
    },
    {
      label: t("visa.step.lodged"),
      done: r >= 2,
      at: at("LODGED"),
      note: a.appointment?.at
        ? t("visa.step.appointment", { date: wallClock(a.appointment.at) })
        : undefined
    },
    {
      label:
        r >= 3 ? (refused ? t("visa.status.REFUSED") : t("visa.status.APPROVED")) : t("visa.step.decision"),
      done: r >= 3,
      bad: r >= 3 && refused,
      at: a.decision?.at ?? at("APPROVED", "REFUSED")
    },
    { label: t("visa.step.completed"), done: r >= 4, at: at("COMPLETED") }
  ];

  const steps: Step[] = [];
  let current = false;
  for (const step of planned) {
    if (step.done) {
      steps.push({ ...step, state: "done" });
      continue;
    }
    if (a.status === "CANCELLED") {
      steps.push({
        label: t("visa.status.CANCELLED"),
        state: "cancelled",
        at: a.cancellation?.at ?? at("CANCELLED"),
        note: a.cancellation?.reasonCode
          ? t(`visa.cancel.${a.cancellation.reasonCode}` as TranslationKey)
          : undefined
      });
      break;
    }
    steps.push({ ...step, state: current ? "todo" : "current" });
    current = true;
  }
  return steps;
}

/** The booking page's tracker, for a visa application. */
function VisaProgress({ application }: { application: VisaApplication }) {
  const { t } = useT();
  const steps = visaSteps(application, t);
  const icon = (s: Step) =>
    s.state === "cancelled" || s.bad ? (
      <XCircle className="size-6 text-red-600" />
    ) : s.state === "done" ? (
      <CheckCircle2 className="size-6 text-emerald-600" />
    ) : s.state === "current" ? (
      <CircleDot className="size-6 text-sky-600" />
    ) : (
      <Circle className="size-6 text-muted-foreground/40" />
    );
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
            <div className="flex flex-col items-center sm:w-full sm:flex-row">
              <span
                className={cn(
                  "hidden sm:block",
                  rail(i > 0 && steps[i - 1].state === "done"),
                  i === 0 && "invisible"
                )}
              />
              <span className="shrink-0 rounded-full bg-background">{icon(s)}</span>
              <span className={cn("hidden sm:block", rail(s.state === "done"), last && "invisible")} />
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
                  (s.state === "cancelled" || s.bad) && "font-medium text-red-700 dark:text-red-400",
                  (s.state === "done" || s.state === "current") && "font-medium"
                )}
              >
                {s.label}
              </p>
              {s.at ? (
                <p className="mt-0.5 text-[11px] text-muted-foreground">{formatDateTime(s.at)}</p>
              ) : null}
              {s.note ? (
                <p className="mt-0.5 text-[11px] text-amber-700 dark:text-amber-400">{s.note}</p>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** One fact of a card: its name above, its value below. */
function Fact({
  label,
  children,
  className
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm">{children}</dd>
    </div>
  );
}

interface Staged {
  id: string;
  file: File;
  kind: VisaDocumentKind;
  preview?: string;
}

type Confirm = { title: string; body: string; action: string; run: () => void };
type Open = "info" | "appointment" | "decision" | "cancel" | null;

export default function VisaApplicationPage() {
  const router = useRouter();
  const id = router.query.id as string;
  const { can } = useCan();
  const { t, locale } = useT();
  const canWrite = can("orders:write");

  const [confirming, setConfirming] = useState<Confirm | null>(null);
  const [open, setOpen] = useState<Open>(null);
  const [infoMessage, setInfoMessage] = useState("");
  const [appointmentAt, setAppointmentAt] = useState("");
  const [appointmentPlace, setAppointmentPlace] = useState("");
  const [outcome, setOutcome] = useState<"APPROVED" | "REFUSED">("APPROVED");
  const [visaNumber, setVisaNumber] = useState("");
  const [validFrom, setValidFrom] = useState("");
  const [validTo, setValidTo] = useState("");
  const [refusalReason, setRefusalReason] = useState("");
  const [cancelCode, setCancelCode] = useState("");
  const [cancelNote, setCancelNote] = useState("");
  // The passport number, once revealed: on this screen only, never cached.
  const [passport, setPassport] = useState<string>();
  const [note, setNote] = useState<string>();

  const {
    data: a,
    isLoading,
    isError,
    error,
    refetch
  } = useQuery({
    queryKey: ["visa-application", id],
    queryFn: () => getVisaApplication(id),
    enabled: Boolean(id)
  });

  const onError = (err: unknown) => {
    toast.error(visaError(err, t, t("ops.order.actionFailed")));
    // Moved on elsewhere (the customer, another admin): show it as it is now.
    if (errorCode(err) === "TRANSITION_NOT_ALLOWED") refetch();
  };
  const done = (message: string) => {
    setOpen(null);
    setConfirming(null);
    setInfoMessage("");
    setAppointmentAt("");
    setAppointmentPlace("");
    setVisaNumber("");
    setValidFrom("");
    setValidTo("");
    setRefusalReason("");
    setCancelCode("");
    setCancelNote("");
    toast.success(message);
  };

  const { mutate: move, isPending: moving } = useMutation({
    mutationFn: (body: VisaTransition) => transitionVisa(id, body),
    meta: { showToast: false },
    onSuccess: () => done(t("visa.updated")),
    onError
  });
  const { mutate: pay, isPending: paying } = useMutation({
    mutationFn: () => confirmVisaPayment(id),
    meta: { showToast: false },
    onSuccess: () => done(t("ops.order.paymentRecorded")),
    onError
  });
  const { mutate: saveNote, isPending: savingNote } = useMutation({
    mutationFn: () => saveVisaNote(id, (note ?? "").trim()),
    meta: { showToast: false },
    onSuccess: () => {
      setNote(undefined);
      toast.success(t("visa.noteSaved"));
    },
    onError
  });
  // A read, but a logged one: needed to lodge every application, so one click. Nothing on the server changes.
  const { mutate: unmask, isPending: unmasking } = useMutation({
    mutationFn: () => unmaskVisaPassport(id),
    meta: { showToast: false, invalidate: false },
    onSuccess: (r) => setPassport(r.passportNumber),
    onError
  });

  // --- Documents: pick, review, then upload — as on a booking.
  const [staged, setStaged] = useState<Staged[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);
  const documentsCard = useRef<HTMLDivElement>(null);
  const revoke = (items: Staged[]) => items.forEach((s) => s.preview && URL.revokeObjectURL(s.preview));
  useEffect(() => () => revoke(staged), [staged]);

  const pick = (list: FileList | null) => {
    if (!list?.length) return;
    const room = VISA_MAX_FILES - staged.length;
    const files = Array.from(list);
    if (files.length > room) toast.error(t("ops.order.tooManyFiles", { max: VISA_MAX_FILES, room }));
    const next: Staged[] = [];
    for (const file of files.slice(0, Math.max(room, 0))) {
      if (file.size > VISA_MAX_FILE_BYTES) {
        toast.error(t("visa.docs.tooBig", { name: file.name }));
        continue;
      }
      next.push({
        id: `${file.name}-${file.size}-${file.lastModified}-${Math.random()}`,
        file,
        // After an approval the file is most likely the visa itself.
        kind: a?.status === "APPROVED" ? "VISA" : "OTHER",
        preview: file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined
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
    mutationFn: () => attachVisaDocuments(id, staged.map((s) => ({ file: s.file, kind: s.kind }))),
    meta: { showToast: false },
    onSuccess: () => {
      const n = staged.length;
      setStaged([]);
      toast.success(n === 1 ? t("ops.order.attached.one") : t("ops.order.attached.other", { n }));
    },
    onError
  });

  const [removing, setRemoving] = useState<VisaDocument | null>(null);
  const { mutate: remove, isPending: removingNow } = useMutation({
    mutationFn: (doc: VisaDocument) => removeVisaDocument(id, doc.id),
    meta: { showToast: false },
    onSuccess: () => {
      setRemoving(null);
      toast.success(t("ops.order.documentRemoved"));
    },
    onError
  });

  /** Private files: each open asks for a link that expires. */
  const openDocument = async (doc: VisaDocument) => {
    try {
      const { url } = await getVisaDocumentLink(id, doc.id);
      window.open(assetUrl(url), "_blank", "noopener");
    } catch (err) {
      onError(err);
    }
  };

  if (isLoading) {
    return (
      <AdminLayout title={t("visa.detail.title")}>
        <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
      </AdminLayout>
    );
  }
  if (isError || !a) {
    return (
      <AdminLayout title={t("visa.detail.title")}>
        <QueryError error={error} onRetry={() => refetch()} />
      </AdminLayout>
    );
  }

  const status = a.status;
  const paid = a.paymentStatus === "PAID";
  // The server's own list of next statuses; the status machine when it sends none.
  const canMove = (to: VisaStatus) => a.allowedTransitions?.includes(to) ?? true;
  const offered = (x: { to?: VisaStatus }) => !x.to || canMove(x.to);
  const closed = !OPEN.includes(status);
  const visaFile = a.documents?.some((d) => d.kind === "VISA");
  const busy = moving || paying;
  const customerName = a.customer?.name ?? a.contact?.name ?? "—";
  const phone = a.customer?.phone ?? a.contact?.phone;
  const email = a.customer?.email ?? a.contact?.email;

  const askPayment = () =>
    setConfirming({
      title: t("ops.order.cashTitle"),
      body: t("visa.confirm.paymentBody", { fee: visaFee(a, locale) }),
      action: t("ops.order.confirmPayment"),
      run: () => pay()
    });
  const attachVisa = () => {
    documentsCard.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    fileInput.current?.click();
  };

  /**
   * The one thing to do now (VISA.md "ONE Next step panel"): a sentence, one
   * primary button, and the other moves as quieter buttons that open dialogs.
   */
  /** `to`: the status it moves to, offered only while the server's allowedTransitions has it. */
  type Action = { label: string; run: () => void; to?: VisaStatus };
  type Next = { hint: React.ReactNode; primary?: Action; secondary: Action[] };
  const payLater =
    !paid && (status === "SUBMITTED" || status === "INFO_REQUESTED")
      ? [{ label: t("ops.order.confirmPayment"), run: askPayment }]
      : [];
  const askMore: Action = { label: t("visa.next.askMore"), run: () => setOpen("info"), to: "INFO_REQUESTED" };
  const next: Next | null =
    status === "SUBMITTED"
      ? {
          hint: t("visa.next.submitted"),
          primary: { label: t("visa.next.startReview"), run: () => move({ to: "IN_REVIEW" }), to: "IN_REVIEW" },
          secondary: payLater
        }
      : status === "IN_REVIEW" && !paid
        ? {
            hint: t("visa.next.reviewUnpaid", { fee: visaFee(a, locale) }),
            primary: { label: t("ops.order.confirmPayment"), run: askPayment },
            secondary: [askMore]
          }
        : status === "IN_REVIEW"
          ? {
              hint: t("visa.next.reviewPaid"),
              primary: {
                label: t("visa.next.lodge"),
                to: "LODGED",
                run: () =>
                  setConfirming({
                    title: t("visa.confirm.lodgeTitle"),
                    body: t("visa.confirm.lodgeBody"),
                    action: t("visa.next.lodge"),
                    run: () => move({ to: "LODGED" })
                  })
              },
              secondary: [askMore]
            }
          : status === "INFO_REQUESTED"
            ? {
                hint: (
                  <>
                    {t("visa.next.waiting")}
                    {a.infoRequest?.message ? (
                      <span className="mt-2 block rounded-md border bg-background px-3 py-2 text-foreground">
                        “{a.infoRequest.message}”
                        {a.infoRequest.at ? (
                          <span className="mt-1 block text-[11px] text-muted-foreground">
                            {formatDateTime(a.infoRequest.at)}
                          </span>
                        ) : null}
                      </span>
                    ) : null}
                  </>
                ),
                secondary: [
                  { label: t("visa.next.resume"), run: () => move({ to: "IN_REVIEW" }), to: "IN_REVIEW" },
                  ...payLater
                ]
              }
            : status === "LODGED" || status === "APPOINTMENT"
              ? {
                  hint:
                    status === "APPOINTMENT" && a.appointment
                      ? t("visa.next.appointment", {
                          date: wallClock(a.appointment.at),
                          place: a.appointment.place || "—"
                        })
                      : t("visa.next.lodged"),
                  primary: { label: t("visa.next.decision"), run: () => setOpen("decision"), to: "APPROVED" },
                  secondary: [
                    {
                      label:
                        status === "APPOINTMENT"
                          ? t("visa.next.changeAppointment")
                          : t("visa.next.recordAppointment"),
                      to: "APPOINTMENT",
                      run: () => {
                        // Rescheduling starts from the appointment as it stands.
                        setAppointmentAt(a.appointment?.at?.slice(0, 16) ?? "");
                        setAppointmentPlace(a.appointment?.place ?? "");
                        setOpen("appointment");
                      }
                    }
                  ]
                }
              : status === "APPROVED"
                ? visaFile
                  ? {
                      hint: t("visa.next.approvedWithFile"),
                      primary: {
                        label: t("visa.next.complete"),
                        to: "COMPLETED",
                        run: () =>
                          setConfirming({
                            title: t("visa.confirm.completeTitle"),
                            body: t("visa.confirm.completeBody"),
                            action: t("visa.next.complete"),
                            run: () => move({ to: "COMPLETED" })
                          })
                      },
                      secondary: []
                    }
                  : {
                      hint: t("visa.next.approved"),
                      primary: { label: t("visa.next.attachVisa"), run: attachVisa },
                      secondary: [
                        {
                          label: t("visa.next.handedOver"),
                          to: "COMPLETED",
                          run: () =>
                            setConfirming({
                              title: t("visa.confirm.handedOverTitle"),
                              body: t("visa.confirm.handedOverBody"),
                              action: t("visa.next.handedOver"),
                              run: () => move({ to: "COMPLETED", confirmHandedOver: true })
                            })
                        }
                      ]
                    }
                : status === "REFUSED"
                  ? {
                      hint: t("visa.next.refused"),
                      primary: {
                        label: t("visa.next.passportReturned"),
                        to: "COMPLETED",
                        run: () =>
                          setConfirming({
                            title: t("visa.confirm.returnedTitle"),
                            body: t("visa.confirm.returnedBody"),
                            action: t("visa.next.passportReturned"),
                            run: () => move({ to: "COMPLETED" })
                          })
                      },
                      secondary: []
                    }
                  : null;

  // The passport against the country's rule: valid N months after the stay.
  const months = a.passportValidityMonths ?? 6;
  const expiry = a.traveller?.passportExpiry;
  const needed = a.stayTo && months > 0 ? addMonths(a.stayTo, months) : undefined;
  const passportShort = Boolean(expiry && needed && expiry.slice(0, 10) < needed);
  const passportClose = Boolean(
    expiry && needed && !passportShort && expiry.slice(0, 10) < addMonths(needed, 3)
  );
  const age =
    a.traveller?.dateOfBirth && a.departureDate
      ? yearsBetween(a.traveller.dateOfBirth, a.departureDate)
      : undefined;
  const departsIn = a.departureDate ? daysUntil(a.departureDate) : undefined;
  const canEditDocuments = canWrite && !closed;

  return (
    <AdminLayout
      title={a.reference}
      description={t("visa.detail.description", { date: formatDate(a.createdAt) })}
    >
      <div className="flex flex-col gap-6">
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/e-visa/applications">
            <Button variant="ghost" size="sm" className="gap-2">
              <ArrowLeft className="size-4 rtl:-scale-x-100" />
              {t("visa.list.title")}
            </Button>
          </Link>
          <VisaStatusBadge status={status} />
          <VisaPaymentBadge paid={paid} />
          {a.rush ? <RushBadge /> : null}
          {a.minor ? <Badge variant="outline">{t("visa.minor")}</Badge> : null}
          <span className="ms-auto text-end">
            <span className="block text-lg font-semibold tabular-nums">{visaFee(a, locale)}</span>
            <span className="block text-xs text-muted-foreground">
              {paid && a.paidAt
                ? t("visa.paidOn", { date: formatDateTime(a.paidAt) })
                : t("visa.serviceFee")}
            </span>
          </span>
        </div>

        <Card className="gap-0 p-4">
          <h2 className="mb-4 text-sm font-medium">{t("ops.order.progress")}</h2>
          <VisaProgress application={a} />
          {canWrite && next ? (
            <div className="mt-5 flex flex-col gap-3 rounded-lg bg-muted/60 p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
              <div className="min-w-0 max-w-prose">
                <h3 className="text-sm font-medium">{t("ops.order.nextStep")}</h3>
                <div className="mt-1 text-sm text-muted-foreground">{next.hint}</div>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
                {next.secondary.filter(offered).map((s) => (
                  <Button key={s.label} variant="outline" disabled={busy} onClick={s.run}>
                    {s.label}
                  </Button>
                ))}
                {next.primary && offered(next.primary) ? (
                  <Button disabled={busy} onClick={next.primary.run}>
                    {next.primary.label}
                  </Button>
                ) : null}
              </div>
            </div>
          ) : null}
          {closed ? (
            <p className="mt-5 rounded-lg bg-muted/60 px-4 py-3 text-sm text-muted-foreground">
              {status === "COMPLETED"
                ? a.decision?.outcome === "REFUSED"
                  ? t("visa.closed.refused")
                  : t("visa.closed.completed")
                : t("visa.closed.cancelled", {
                    reason: a.cancellation?.reasonCode
                      ? t(`visa.cancel.${a.cancellation.reasonCode}` as TranslationKey)
                      : "—"
                  })}
              {status === "CANCELLED" && a.cancellation?.note ? ` — ${a.cancellation.note}` : ""}
            </p>
          ) : null}
          {canWrite && CANCELLABLE.includes(status) && canMove("CANCELLED") ? (
            <div className="mt-2 flex justify-end">
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5 text-muted-foreground hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950/40 dark:hover:text-red-300"
                onClick={() => setOpen("cancel")}
              >
                <XCircle className="size-3.5" />
                {t("visa.cancelApplication")}
              </Button>
            </div>
          ) : null}
        </Card>

        <div className="grid gap-4 lg:grid-cols-3">
          <div className="flex flex-col gap-4 lg:col-span-2">
            {/* The embassy's answers, once there are any. */}
            {a.appointment || a.decision ? (
              <Card
                className={cn(
                  "gap-0 p-4",
                  a.decision?.outcome === "APPROVED" && "border-emerald-200 dark:border-emerald-900",
                  a.decision?.outcome === "REFUSED" && "border-red-200 dark:border-red-900"
                )}
              >
                <h2 className="mb-3 text-sm font-medium">{t("visa.embassy")}</h2>
                <dl className="grid gap-3 sm:grid-cols-2">
                  {a.appointment ? (
                    <Fact label={t("visa.appointment")}>
                      {wallClock(a.appointment.at)}
                      {a.appointment.place ? ` · ${a.appointment.place}` : ""}
                    </Fact>
                  ) : null}
                  {a.decision ? (
                    <Fact label={t("visa.decision")}>
                      <span
                        className={cn(
                          "font-medium",
                          a.decision.outcome === "APPROVED"
                            ? "text-emerald-700 dark:text-emerald-400"
                            : "text-red-700 dark:text-red-400"
                        )}
                      >
                        {t(`visa.status.${a.decision.outcome}` as TranslationKey)}
                      </span>
                      {a.decision.at ? ` · ${formatDate(a.decision.at)}` : ""}
                      {a.decision.reason ? (
                        <span className="mt-1 block text-muted-foreground">{a.decision.reason}</span>
                      ) : null}
                    </Fact>
                  ) : null}
                  {a.decision?.visaNumber ? (
                    <Fact label={t("visa.visaNumber")}>
                      <span className="font-mono" dir="ltr">
                        {a.decision.visaNumber}
                      </span>
                    </Fact>
                  ) : null}
                  {a.decision?.validFrom || a.decision?.validTo ? (
                    <Fact label={t("visa.validity")}>
                      {day(a.decision.validFrom)} <span className="inline-block rtl:-scale-x-100">→</span>{" "}
                      {day(a.decision.validTo)}
                    </Fact>
                  ) : null}
                </dl>
              </Card>
            ) : null}

            <Card className="gap-0 p-4">
              <h2 className="mb-3 text-sm font-medium">{t("visa.traveller.title")}</h2>
              <dl className="grid gap-3 sm:grid-cols-2">
                <Fact label={t("visa.traveller.name")}>
                  <span className="font-medium">{travellerName(a)}</span>
                </Fact>
                <Fact label={t("visa.traveller.dob")}>
                  {day(a.traveller?.dateOfBirth)}
                  {age !== undefined ? (
                    <span className="text-muted-foreground"> · {t("visa.traveller.age", { n: age })}</span>
                  ) : null}
                </Fact>
                <Fact label={t("visa.traveller.nationality")}>
                  {regionName(a.traveller?.nationality, locale)}
                </Fact>
                <Fact label={t("visa.traveller.passport")}>
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-mono" dir="ltr">
                      {passport ?? a.traveller?.passportNumberMasked ?? "—"}
                    </span>
                    {passport ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={() => setPassport(undefined)}
                      >
                        {t("visa.traveller.hide")}
                      </Button>
                    ) : canWrite && a.traveller?.passportNumberMasked ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 gap-1.5 px-2 text-xs"
                        disabled={unmasking}
                        onClick={() => unmask()}
                      >
                        <Eye className="size-3.5" />
                        {t("visa.traveller.show")}
                      </Button>
                    ) : null}
                  </span>
                </Fact>
                <Fact label={t("visa.traveller.expiry")}>
                  <span
                    className={cn(
                      passportShort && "font-medium text-red-700 dark:text-red-400",
                      passportClose && "font-medium text-amber-700 dark:text-amber-400"
                    )}
                  >
                    {day(expiry)}
                  </span>
                  {(passportShort || passportClose) && needed ? (
                    <span
                      className={cn(
                        "mt-1 block text-xs",
                        passportShort
                          ? "text-red-700 dark:text-red-400"
                          : "text-amber-700 dark:text-amber-400"
                      )}
                    >
                      {t(passportShort ? "visa.traveller.expiryShort" : "visa.traveller.expiryClose", {
                        months,
                        date: day(needed)
                      })}
                    </span>
                  ) : null}
                </Fact>
                <Fact label={t("visa.personType")}>
                  {lz(a.personTypeName) || "—"}
                  {a.minor ? (
                    <span className="mt-1 block text-xs text-amber-700 dark:text-amber-400">
                      {t("visa.minorNote")}
                    </span>
                  ) : null}
                </Fact>
              </dl>
            </Card>

            <Card className="gap-0 p-4">
              <h2 className="mb-3 text-sm font-medium">{t("visa.trip.title")}</h2>
              <dl className="grid gap-3 sm:grid-cols-2">
                <Fact label={t("visa.trip.destination")}>
                  <span className="font-medium">{lz(a.country?.name) || a.country?.code || "—"}</span>
                  {a.townName ? ` · ${lz(a.townName)}` : ""}
                </Fact>
                <Fact label={t("visa.visaType")}>
                  {lz(a.visaTypeName) || "—"}
                  {a.processingDays ? (
                    <span className="text-muted-foreground">
                      {" "}
                      · {t("visa.trip.processing", { n: a.processingDays })}
                    </span>
                  ) : null}
                </Fact>
                <Fact label={t("visa.trip.schedule")}>
                  {day(a.departureDate)} <span className="inline-block rtl:-scale-x-100">→</span>{" "}
                  {day(a.returnDate)}
                  {departsIn !== undefined && !closed ? (
                    <span
                      className={cn(
                        "mt-1 flex flex-wrap items-center gap-1.5 text-xs",
                        a.rush ? "text-red-700 dark:text-red-400" : "text-muted-foreground"
                      )}
                    >
                      {departsIn >= 0
                        ? t("visa.trip.departsIn", { n: departsIn })
                        : t("visa.trip.departed")}
                      {a.rush ? <RushBadge /> : null}
                    </span>
                  ) : null}
                </Fact>
                <Fact label={t("visa.trip.stay")}>
                  {day(a.stayFrom)} <span className="inline-block rtl:-scale-x-100">→</span> {day(a.stayTo)}
                </Fact>
                <Fact label={t("visa.trip.address")} className="sm:col-span-2">
                  {a.stayAddress || "—"}
                </Fact>
                <Fact label={t("visa.trip.purpose")} className="sm:col-span-2">
                  <span className="whitespace-pre-line">{a.purpose || "—"}</span>
                </Fact>
                <Fact label={t("visa.trip.invitation")}>
                  {a.invitationLetter ? t("visa.yes") : t("visa.no")}
                </Fact>
                <Fact label={t("visa.trip.booking")}>
                  {a.bookingReference ? (
                    <Link
                      href={
                        a.bookingOrderId
                          ? `/bookings/${a.bookingOrderId}`
                          : `/bookings?queue=all&q=${encodeURIComponent(a.bookingReference)}`
                      }
                      className="font-mono underline underline-offset-2"
                    >
                      {a.bookingReference}
                    </Link>
                  ) : (
                    "—"
                  )}
                </Fact>
                {a.embassyFee?.CDF ? (
                  <Fact label={t("visa.embassyFee")} className="sm:col-span-2">
                    {formatMoney(a.embassyFee.CDF)}{" "}
                    <span className="text-muted-foreground">· {t("visa.embassyFeeHint")}</span>
                  </Fact>
                ) : null}
              </dl>
            </Card>

            {a.consent?.textShown ? (
              <Card className="gap-0 p-4">
                <h2 className="mb-2 text-sm font-medium">{t("ops.order.consent")}</h2>
                <p className="rounded bg-muted p-2 text-xs italic">“{a.consent.textShown}”</p>
                {a.consent.acceptedAt ? (
                  <p className="mt-2 text-xs text-muted-foreground">
                    {formatDateTime(a.consent.acceptedAt)}
                    {a.consent.locale ? ` · ${a.consent.locale}` : ""}
                  </p>
                ) : null}
              </Card>
            ) : null}

            <Card className="gap-0 p-4">
              <h2 className="mb-3 text-sm font-medium">{t("ops.order.history")}</h2>
              <ol className="flex flex-col gap-2">
                {a.timeline?.map((ev, i) => (
                  <li key={i} className="flex gap-3 text-sm">
                    <span className="w-40 shrink-0 text-xs text-muted-foreground">
                      {formatDateTime(ev.at)}
                    </span>
                    <span>
                      <span className="font-medium" title={ev.event}>
                        {eventLabel(ev.event, t)}
                      </span>
                      {ev.detail ? (
                        <span className="text-muted-foreground">
                          {" "}
                          ·{" "}
                          {(CANCEL_REASONS as string[]).includes(ev.detail)
                            ? t(`visa.cancel.${ev.detail}` as TranslationKey)
                            : ev.detail}
                        </span>
                      ) : null}
                      {ev.reason ? <span className="text-muted-foreground"> — {ev.reason}</span> : null}
                      {ev.actorEmail ? (
                        <span className="text-xs text-muted-foreground"> ({ev.actorEmail})</span>
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
              {/* The number beside the name: read out while the file is handled. */}
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                {a.customer?.id ? (
                  <Link
                    href={`/customers/${a.customer.id}`}
                    className="font-medium underline-offset-2 hover:underline"
                  >
                    {customerName}
                  </Link>
                ) : (
                  <p className="font-medium">{customerName}</p>
                )}
                {phone ? (
                  <a
                    href={`tel:${phone}`}
                    dir="ltr"
                    className="text-sm tabular-nums underline-offset-2 hover:underline"
                  >
                    {formatPhoneNumberIntl(phone) || phone}
                  </a>
                ) : null}
              </div>
              {email ? <p className="text-sm text-muted-foreground">{email}</p> : null}
              {phone ? (
                <div className="mt-3 flex gap-2">
                  <a href={`tel:${phone}`}>
                    <Button variant="outline" size="sm" className="gap-2">
                      <Phone className="size-3.5" />
                      {t("ops.order.call")}
                    </Button>
                  </a>
                  <a
                    href={`https://wa.me/${phone.replace(/\D/g, "")}`}
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

            <Card className="gap-0 p-4" ref={documentsCard}>
              <h2 className="mb-2 text-sm font-medium">{t("book.documents")}</h2>
              {a.documents?.length ? (
                <ul className="flex flex-col">
                  {a.documents.map((d) => (
                    <li key={d.id} className="flex items-center gap-1 rounded px-1 py-1 hover:bg-muted">
                      <button
                        type="button"
                        onClick={() => openDocument(d)}
                        className="flex min-w-0 flex-1 items-center gap-2 text-start text-sm"
                      >
                        <Download className="size-3.5 shrink-0 text-muted-foreground" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate">{d.fileName}</span>
                          <span className="block text-xs text-muted-foreground">
                            <span className={cn(d.kind === "VISA" && "font-medium text-emerald-700 dark:text-emerald-400")}>
                              {t(`visa.kind.${d.kind}` as TranslationKey)}
                            </span>{" "}
                            · {d.fromOffice ? t("visa.docs.fromOffice") : t("visa.docs.fromCustomer")} ·{" "}
                            {formatDate(d.uploadedAt)}
                          </span>
                        </span>
                      </button>
                      {canEditDocuments && d.fromOffice ? (
                        <button
                          type="button"
                          onClick={() => setRemoving(d)}
                          aria-label={t("ops.order.removeFile", { name: d.fileName })}
                          className="shrink-0 rounded p-1.5 text-muted-foreground hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">{t("ops.order.noDocuments")}</p>
              )}
              {a.documentsPurgedAt ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  {t("visa.docs.purged", { date: formatDate(a.documentsPurgedAt) })}
                </p>
              ) : null}

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
                    disabled={attaching || staged.length >= VISA_MAX_FILES}
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
                            <img src={s.preview} alt="" className="size-10 shrink-0 rounded object-cover" />
                          ) : (
                            <span className="flex size-10 shrink-0 items-center justify-center rounded bg-muted">
                              <FileText className="size-4 text-muted-foreground" />
                            </span>
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-xs font-medium">{s.file.name}</p>
                            <p className="text-[11px] text-muted-foreground">{formatBytes(s.file.size)}</p>
                          </div>
                          <OptionSelect
                            size="sm"
                            className="w-[120px] text-xs"
                            aria-label={t("visa.docs.kind")}
                            value={s.kind}
                            onChange={(v) =>
                              setStaged((all) =>
                                all.map((x) => (x.id === s.id ? { ...x, kind: v as VisaDocumentKind } : x))
                              )
                            }
                            options={KINDS.map((k) => ({
                              value: k,
                              label: t(`visa.kind.${k}` as TranslationKey)
                            }))}
                          />
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
                        <Button size="sm" className="flex-1" disabled={attaching} onClick={() => attach()}>
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
                    {t("visa.docs.hint", { max: VISA_MAX_FILES })}
                  </p>
                </div>
              ) : null}
            </Card>

            <Card className="gap-0 p-4">
              <h2 className="mb-1 text-sm font-medium">{t("visa.notes.title")}</h2>
              <p className="mb-2 text-xs text-muted-foreground">{t("visa.notes.hint")}</p>
              <Textarea
                rows={4}
                disabled={!canWrite}
                value={note ?? a.internalNotes ?? ""}
                onChange={(e) => setNote(e.target.value)}
              />
              {canWrite && note !== undefined && note !== (a.internalNotes ?? "") ? (
                <div className="mt-2 flex justify-end gap-2">
                  <Button size="sm" variant="ghost" disabled={savingNote} onClick={() => setNote(undefined)}>
                    {t("common.cancel")}
                  </Button>
                  <Button size="sm" disabled={savingNote} onClick={() => saveNote()}>
                    {t("common.save")}
                  </Button>
                </div>
              ) : null}
            </Card>
          </div>
        </div>
      </div>

      {/* Irreversible steps ask first. One dialog drives them all. */}
      <AlertDialog open={Boolean(confirming)} onOpenChange={(o) => !o && setConfirming(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirming?.title}</AlertDialogTitle>
            <AlertDialogDescription>{confirming?.body}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>{t("ops.order.keepIt")}</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={(e) => {
                // Stays open until the call succeeds, so a slow one cannot invite a second click.
                e.preventDefault();
                confirming?.run();
              }}
            >
              {confirming?.action}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Ask the customer for more. */}
      <Dialog open={open === "info"} onOpenChange={(o) => !moving && setOpen(o ? "info" : null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("visa.info.title")}</DialogTitle>
            <DialogDescription>{t("visa.info.body")}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="visa-info" className="text-xs">
              {t("visa.info.message")} *
            </Label>
            <Textarea
              id="visa-info"
              rows={4}
              maxLength={1000}
              value={infoMessage}
              placeholder={t("visa.info.placeholder")}
              onChange={(e) => setInfoMessage(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" disabled={moving} onClick={() => setOpen(null)}>
              {t("common.cancel")}
            </Button>
            <Button
              disabled={moving || !infoMessage.trim()}
              onClick={() => move({ to: "INFO_REQUESTED", infoMessage: infoMessage.trim() })}
            >
              {t("visa.info.send")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* The embassy's appointment. */}
      <Dialog open={open === "appointment"} onOpenChange={(o) => !moving && setOpen(o ? "appointment" : null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("visa.appointment.title")}</DialogTitle>
            <DialogDescription>{t("visa.appointment.body")}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">{t("visa.appointment.when")} *</Label>
              <DateTimeField
                aria-label={t("visa.appointment.when")}
                value={appointmentAt}
                onChange={setAppointmentAt}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="visa-place" className="text-xs">
                {t("visa.appointment.place")}
              </Label>
              <Input
                id="visa-place"
                maxLength={200}
                value={appointmentPlace}
                placeholder={t("visa.appointment.placePlaceholder")}
                onChange={(e) => setAppointmentPlace(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" disabled={moving} onClick={() => setOpen(null)}>
              {t("common.cancel")}
            </Button>
            <Button
              disabled={moving || !appointmentAt}
              onClick={() =>
                move({
                  to: "APPOINTMENT",
                  // The embassy's own clock, as typed: the server keeps it as wall-clock time.
                  appointmentAt,
                  appointmentPlace: appointmentPlace.trim() || undefined
                })
              }
            >
              {t("common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* The decision: final, and the customer is told. */}
      <Dialog open={open === "decision"} onOpenChange={(o) => !moving && setOpen(o ? "decision" : null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("visa.decision.title")}</DialogTitle>
            <DialogDescription>{t("visa.decision.body")}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <RadioGroup
              value={outcome}
              onValueChange={(v) => setOutcome(v as "APPROVED" | "REFUSED")}
              className="grid grid-cols-2 gap-2"
            >
              {(["APPROVED", "REFUSED"] as const).map((o) => (
                <Label
                  key={o}
                  htmlFor={`outcome-${o}`}
                  className={cn(
                    "flex cursor-pointer items-center gap-2 rounded-md border p-3 text-sm",
                    outcome === o &&
                      (o === "APPROVED"
                        ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40"
                        : "border-red-500 bg-red-50 dark:bg-red-950/40")
                  )}
                >
                  <RadioGroupItem id={`outcome-${o}`} value={o} />
                  {t(`visa.status.${o}` as TranslationKey)}
                </Label>
              ))}
            </RadioGroup>
            {outcome === "APPROVED" ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5 sm:col-span-2">
                  <Label htmlFor="visa-number" className="text-xs">
                    {t("visa.visaNumber")}
                  </Label>
                  <Input
                    id="visa-number"
                    dir="ltr"
                    maxLength={60}
                    value={visaNumber}
                    onChange={(e) => setVisaNumber(e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs">{t("visa.decision.validFrom")}</Label>
                  <DateField aria-label={t("visa.decision.validFrom")} value={validFrom} onChange={setValidFrom} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs">{t("visa.decision.validTo")}</Label>
                  <DateField
                    aria-label={t("visa.decision.validTo")}
                    value={validTo}
                    min={validFrom || undefined}
                    onChange={setValidTo}
                  />
                </div>
                <p className="text-xs text-muted-foreground sm:col-span-2">{t("visa.decision.optional")}</p>
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="visa-refusal" className="text-xs">
                  {t("visa.decision.reason")} *
                </Label>
                <Textarea
                  id="visa-refusal"
                  rows={3}
                  maxLength={500}
                  value={refusalReason}
                  placeholder={t("visa.decision.reasonPlaceholder")}
                  onChange={(e) => setRefusalReason(e.target.value)}
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" disabled={moving} onClick={() => setOpen(null)}>
              {t("common.cancel")}
            </Button>
            <Button
              variant={outcome === "REFUSED" ? "destructive" : "default"}
              disabled={
                moving ||
                (outcome === "REFUSED" && !refusalReason.trim()) ||
                Boolean(validFrom && validTo && validTo < validFrom)
              }
              onClick={() =>
                move(
                  outcome === "APPROVED"
                    ? {
                        to: "APPROVED",
                        visaNumber: visaNumber.trim() || undefined,
                        validFrom: validFrom || undefined,
                        validTo: validTo || undefined
                      }
                    : { to: "REFUSED", refusalReason: refusalReason.trim() }
                )
              }
            >
              {outcome === "APPROVED" ? t("visa.decision.saveApproved") : t("visa.decision.saveRefused")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel: rare and final, with its reason. */}
      <Dialog open={open === "cancel"} onOpenChange={(o) => !moving && setOpen(o ? "cancel" : null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("visa.cancel.title")}</DialogTitle>
            <DialogDescription>{t("visa.cancel.body")}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <OptionSelect
              aria-label={t("ops.order.cancelReasonPlaceholder")}
              placeholder={t("ops.order.cancelReasonPlaceholder")}
              value={cancelCode}
              onChange={setCancelCode}
              options={CANCEL_REASONS.map((c) => ({
                value: c,
                label: t(`visa.cancel.${c}` as TranslationKey)
              }))}
            />
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="visa-cancel-note" className="text-xs">
                {t("common.reasonRequired")}
              </Label>
              <Input
                id="visa-cancel-note"
                maxLength={500}
                value={cancelNote}
                placeholder={t("ops.order.reasonPlaceholder")}
                onChange={(e) => setCancelNote(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" disabled={moving} onClick={() => setOpen(null)}>
              {t("ops.order.keepIt")}
            </Button>
            <Button
              variant="destructive"
              disabled={moving || !cancelCode || !cancelNote.trim()}
              onClick={() =>
                move({
                  to: "CANCELLED",
                  cancelReasonCode: cancelCode as VisaCancelReason,
                  cancelNote: cancelNote.trim()
                })
              }
            >
              {t("visa.cancelApplication")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Showing the passport number: a reason, the password, and a line in the audit log. */}
      <AlertDialog open={Boolean(removing)} onOpenChange={(o) => !o && setRemoving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("visa.docs.removeTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("visa.docs.removeBody", { name: removing?.fileName ?? "" })}
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
