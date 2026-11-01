import {
  addEnquiryNote,
  deleteEnquiry,
  quoteEnquiry,
  type Enquiry,
  type EnquiryLogEntry
} from "@/api/functions/admin.api";
import { Badge } from "@/components/ui/badge";
import DateField, { intlLocale } from "@/components/DateField";
import DeleteButton from "@/components/DeleteButton";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatDate, formatDateTime, relativeTime } from "@/lib/functions/format.lib";
import { label, VERTICAL } from "@/lib/functions/labels.lib";
import type { TranslationKey } from "@/lib/i18n/messages";
import { useT } from "@/lib/i18n/useT";
import { cn } from "@/lib/utils";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Eye,
  Mail,
  MessageCircle,
  Phone,
  Receipt,
  StickyNote
} from "lucide-react";
import { useEffect, useState } from "react";
import {
  LOSS_REASONS,
  STAGES,
  STAGE_STYLES,
  quoteText,
  telHref,
  waHref
} from "./enquiry.lib";

const LOG_ICONS: Record<EnquiryLogEntry["kind"], typeof Phone> = {
  CALL: Phone,
  NOTE: StickyNote,
  QUOTE: Receipt,
  VIEWING: Eye
};

const LOG_LABELS: Record<EnquiryLogEntry["kind"], TranslationKey> = {
  CALL: "ops.enquiry.log.CALL",
  NOTE: "ops.enquiry.log.NOTE",
  QUOTE: "ops.enquiry.log.QUOTE",
  VIEWING: "ops.enquiry.log.VIEWING"
};

const STAGE_KEYS: Record<string, TranslationKey> = {
  NEW: "ops.enquiry.stage.NEW",
  CONTACTED: "ops.enquiry.stage.CONTACTED",
  QUALIFIED: "ops.enquiry.stage.QUALIFIED",
  QUOTED: "ops.enquiry.stage.QUOTED",
  WON: "ops.enquiry.stage.WON",
  LOST: "ops.enquiry.stage.LOST"
};

const KIND_KEYS: Record<string, TranslationKey> = {
  PROPERTY: "ops.enquiry.kind.PROPERTY",
  REQUEST_TO_BOOK: "ops.enquiry.kind.REQUEST_TO_BOOK"
};

const LOSS_KEYS: Record<string, TranslationKey> = {
  PRICE: "ops.enquiry.loss.PRICE",
  NO_AVAILABILITY: "ops.enquiry.loss.NO_AVAILABILITY",
  UNRESPONSIVE: "ops.enquiry.loss.UNRESPONSIVE",
  CHOSE_COMPETITOR: "ops.enquiry.loss.CHOSE_COMPETITOR",
  NOT_SERIOUS: "ops.enquiry.loss.NOT_SERIOUS",
  OTHER: "ops.enquiry.loss.OTHER"
};

const hm = (d: Date) =>
  `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

/**
 * The words enquiry.lib writes in English (stage, kind, loss reason, the
 * about, trip and time lines), in the panel's language. Same rules as there.
 */
export function useEnquiryWords() {
  const { t, locale } = useT();
  const pick = (keys: Record<string, TranslationKey>, code?: string) =>
    code && keys[code] ? t(keys[code]) : (code ?? "");
  /** "in 25m" below an hour, otherwise hours, then days. */
  const span = (ms: number) => {
    const abs = Math.abs(ms);
    if (abs < 3600000) return t("ops.enquiry.minutes", { n: Math.max(1, Math.round(abs / 60000)) });
    const h = Math.round(abs / 3600000);
    return h < 24 ? t("ops.enquiry.hours", { n: h }) : t("ops.enquiry.days", { n: Math.round(h / 24) });
  };
  return {
    stage: (code?: string) => pick(STAGE_KEYS, code),
    kind: (code?: string) => pick(KIND_KEYS, code),
    loss: (code?: string) => pick(LOSS_KEYS, code),
    /** What the customer asked about, in one short line. */
    about: (e: Enquiry) =>
      e.listingLabel || (e.vertical ? label(VERTICAL, e.vertical) : t("ops.enquiry.general")),
    /**
     * A bus or flight request's trip: "Thu 5 Nov · 06:30 · 2 adults, 1 child".
     * The day is as written, with no zone — read in UTC. Empty when none.
     */
    trip: (e: Enquiry) => {
      const trip = e.trip;
      if (!trip) return "";
      const day = new Date(`${trip.date}T00:00:00Z`).toLocaleDateString(
        locale === "en" ? "en-GB" : intlLocale(locale),
        { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" }
      );
      const who = (
        [
          [trip.adults, "ops.enquiry.adults.one", "ops.enquiry.adults.other"],
          [trip.children, "ops.enquiry.children.one", "ops.enquiry.children.other"],
          [trip.infants, "ops.enquiry.babies.one", "ops.enquiry.babies.other"]
        ] as const
      )
        .filter(([n]) => n > 0)
        .map(([n, one, many]) => t(n === 1 ? one : many, { n }))
        .join(", ");
      return `${day} · ${trip.time} · ${who}`;
    },
    /** "Reply by 14:30 (in 2h)" · "Overdue by 3h" · "Contacted 2d ago". */
    time: (e: Enquiry): { text: string; tone: "overdue" | "soon" | "ok" } => {
      if (e.firstContactAt) {
        return {
          text: t("ops.enquiry.contacted", { when: relativeTime(e.firstContactAt, locale) }),
          tone: "ok"
        };
      }
      const left = new Date(e.slaDeadline).getTime() - Date.now();
      if (left < 0) return { text: t("ops.enquiry.overdueBy", { span: span(left) }), tone: "overdue" };
      return {
        text: t("ops.enquiry.replyBy", { time: hm(new Date(e.slaDeadline)), span: span(left) }),
        tone: left < 3600000 ? "soon" : "ok"
      };
    }
  };
}

export type StageMove = {
  id: string;
  stage: string;
  lossReason?: string;
  detail?: string;
};

/**
 * Everything about one lead on one screen: who, what, the conversation so far,
 * and the three things an operator does next — log contact, send a quote, move
 * the stage. Stage moves go through the page's optimistic mutation; notes and
 * quotes wait for the server because it decides what they change. Deleting
 * the lead closes the dialog: there is nothing left to show.
 */
export default function EnquiryDialog({
  enquiry,
  canWrite,
  openLost,
  onClose,
  onMove,
  onUpdated
}: {
  enquiry: Enquiry | null;
  canWrite: boolean;
  /** Opened from a card's "Lost" button: jump straight to the reason. */
  openLost?: boolean;
  onClose: () => void;
  onMove: (move: StageMove) => void;
  onUpdated: (e: Enquiry) => void;
}) {
  const queryClient = useQueryClient();
  const { t, locale } = useT();
  const words = useEnquiryWords();
  const e = enquiry;

  const [logKind, setLogKind] = useState<"CALL" | "NOTE" | "VIEWING">("CALL");
  const [logDetail, setLogDetail] = useState("");
  const [amount, setAmount] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [quoteNote, setQuoteNote] = useState("");
  const [stage, setStage] = useState("");
  const [lossReason, setLossReason] = useState("");
  const [lossNote, setLossNote] = useState("");
  const [showLost, setShowLost] = useState(false);

  // A fresh form for each enquiry, not the last one's half-typed note.
  useEffect(() => {
    setLogKind("CALL");
    setLogDetail("");
    // Francs only: a quote still in US cents is not offered again as francs.
    setAmount(e?.quotedAmount && e.quotedCurrency === "CDF" ? String(e.quotedAmount) : "");
    setExpiresAt("");
    setQuoteNote("");
    setStage("");
    setLossReason("");
    setLossNote("");
    setShowLost(Boolean(openLost));
  }, [e?.id, openLost]);

  const refresh = (data: { enquiry: Enquiry }) => {
    onUpdated(data.enquiry);
    // Lists and the totals above them: the summary is ["enquiries", "summary"].
    queryClient.invalidateQueries({ queryKey: ["enquiries"] });
  };

  const note = useMutation({
    mutationFn: () =>
      addEnquiryNote(e!.id, { kind: logKind, detail: logDetail.trim() }),
    onSuccess: (data) => {
      refresh(data);
      setLogDetail("");
    }
  });

  const quote = useMutation({
    mutationFn: () =>
      quoteEnquiry(e!.id, {
        // Whole francs.
        amount: Math.round(Number(amount)),
        expiresAt: expiresAt
          ? new Date(`${expiresAt}T23:59:59`).toISOString()
          : undefined,
        detail: quoteNote.trim() || undefined
      }),
    onSuccess: (data) => {
      refresh(data);
      setQuoteNote("");
    }
  });

  const move = (next: string, extra: Partial<StageMove> = {}) => {
    if (!e) return;
    onMove({ id: e.id, stage: next, ...extra });
    onUpdated({
      ...e,
      stage: next,
      lossReason: extra.lossReason ?? e.lossReason,
      firstContactAt:
        next !== "NEW" ? (e.firstContactAt ?? new Date().toISOString()) : e.firstContactAt
    });
    setStage("");
    setShowLost(false);
  };

  const amountFc = Math.round(Number(amount));
  const amountOk = Number.isFinite(amountFc) && amountFc > 0;
  const log = [...(e?.contactLog ?? [])].sort(
    (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()
  );
  const time = e ? words.time(e) : null;

  return (
    <Dialog open={Boolean(e)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        {e ? (
          <>
            <DialogHeader>
              <div className="flex flex-wrap items-center gap-2 pe-6">
                <DialogTitle className="text-xl">{e.customerName}</DialogTitle>
                <Badge
                  variant="secondary"
                  className={cn("text-[11px]", STAGE_STYLES[e.stage])}
                >
                  {words.stage(e.stage)}
                </Badge>
                <Badge variant="outline" className="text-[11px]">
                  {words.kind(e.kind)}
                </Badge>
              </div>
              <DialogDescription className="font-mono text-xs">
                {e.reference}
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-wrap gap-2">
              <a href={telHref(e.phone)}>
                <Button variant="outline" size="sm" className="gap-1.5">
                  <Phone className="size-3.5" />
                  {t("ops.order.call")} <span dir="ltr">{e.phone}</span>
                </Button>
              </a>
              <a href={waHref(e.phone)} target="_blank" rel="noreferrer">
                <Button variant="outline" size="sm" className="gap-1.5">
                  <MessageCircle className="size-3.5" />
                  WhatsApp
                </Button>
              </a>
              {e.email ? (
                <a href={`mailto:${e.email}`}>
                  <Button variant="outline" size="sm" className="gap-1.5">
                    <Mail className="size-3.5" />
                    {e.email}
                  </Button>
                </a>
              ) : null}
              {/* Its own permission, so it is not with the forms below. */}
              <DeleteButton
                permission="enquiries:delete"
                what={t("ops.enquiry.deleteWhat", { reference: e.reference })}
                consequence={t("ops.enquiry.deleteConsequence")}
                onDelete={() => deleteEnquiry(e.id)}
                onDeleted={() => {
                  onClose();
                  queryClient.invalidateQueries({ queryKey: ["enquiries"] });
                }}
                label={t("ops.customer.delete")}
                className="ms-auto"
              />
            </div>

            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
              <dt className="text-muted-foreground">{t("ops.enquiry.about")}</dt>
              <dd>
                {words.about(e)}
                {e.source ? (
                  <span className="text-muted-foreground">
                    {" "}
                    · {t("ops.enquiry.via", { source: e.source })}
                  </span>
                ) : null}
              </dd>
              {e.trip ? (
                <>
                  <dt className="text-muted-foreground">{t("ops.enquiry.trip")}</dt>
                  <dd>{words.trip(e)}</dd>
                </>
              ) : null}
              <dt className="text-muted-foreground">{t("ops.enquiry.message")}</dt>
              <dd className="whitespace-pre-wrap break-words">
                {e.message || <span className="text-muted-foreground">—</span>}
              </dd>
              <dt className="text-muted-foreground">{t("common.created")}</dt>
              <dd>
                {formatDateTime(e.createdAt)}
                {time ? (
                  <span
                    className={cn(
                      "ms-2 font-medium",
                      time.tone === "overdue" && "text-red-700 dark:text-red-400",
                      time.tone === "soon" && "text-amber-700 dark:text-amber-400",
                      time.tone === "ok" && "text-muted-foreground"
                    )}
                  >
                    · {time.text}
                  </span>
                ) : null}
              </dd>
              {e.quotedAmount ? (
                <>
                  <dt className="text-muted-foreground">{t("ops.enquiry.stage.QUOTED")}</dt>
                  <dd className="tabular-nums">
                    {quoteText(e, locale)}
                    {e.quoteExpiresAt ? (
                      <span className="text-muted-foreground">
                        {" "}
                        · {t("ops.enquiry.validUntil", { date: formatDate(e.quoteExpiresAt) })}
                      </span>
                    ) : null}
                  </dd>
                </>
              ) : null}
              {e.stage === "LOST" && e.lossReason ? (
                <>
                  <dt className="text-muted-foreground">{t("ops.enquiry.stage.LOST")}</dt>
                  <dd>{words.loss(e.lossReason)}</dd>
                </>
              ) : null}
            </dl>

            <section>
              <h3 className="mb-2 text-sm font-medium">{t("ops.enquiry.timeline")}</h3>
              {!log.length ? (
                <p className="text-xs text-muted-foreground">
                  {t("ops.enquiry.nothingLogged")}
                </p>
              ) : (
                <ol className="flex flex-col gap-2 border-s ps-4">
                  {log.map((entry, i) => {
                    const Icon = LOG_ICONS[entry.kind] ?? StickyNote;
                    return (
                      <li key={i} className="relative text-sm">
                        <span className="absolute -start-[25px] top-0.5 flex size-4 items-center justify-center rounded-full bg-background ring-1 ring-border">
                          <Icon className="size-2.5 text-muted-foreground" />
                        </span>
                        <div className="flex flex-wrap items-baseline gap-x-2">
                          <span className="font-medium">
                            {LOG_LABELS[entry.kind] ? t(LOG_LABELS[entry.kind]) : entry.kind}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {formatDateTime(entry.at)}
                            {entry.actorEmail ? ` · ${entry.actorEmail}` : ""}
                          </span>
                        </div>
                        {entry.detail ? (
                          <p className="whitespace-pre-wrap break-words text-muted-foreground">
                            {entry.detail.replace(
                              /^Stage → (\w+)$/,
                              (_, s) => t("ops.enquiry.movedTo", { stage: words.stage(s) })
                            )}
                          </p>
                        ) : null}
                      </li>
                    );
                  })}
                </ol>
              )}
            </section>

            {canWrite ? (
              <div className="grid gap-4 border-t pt-4 sm:grid-cols-2">
                <form
                  className="flex flex-col gap-2"
                  onSubmit={(ev) => {
                    ev.preventDefault();
                    if (logDetail.trim()) note.mutate();
                  }}
                >
                  <Label>{t("ops.enquiry.logTitle")}</Label>
                  <Select
                    value={logKind}
                    onValueChange={(v) => setLogKind(v as typeof logKind)}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="CALL">{t("ops.enquiry.log.CALL")}</SelectItem>
                      <SelectItem value="VIEWING">{t("ops.enquiry.log.VIEWING")}</SelectItem>
                      <SelectItem value="NOTE">{t("ops.enquiry.log.NOTE")}</SelectItem>
                    </SelectContent>
                  </Select>
                  <Textarea
                    value={logDetail}
                    maxLength={1000}
                    onChange={(ev) => setLogDetail(ev.target.value)}
                    placeholder={t("ops.enquiry.logPlaceholder")}
                  />
                  <p className="text-[11px] text-muted-foreground">
                    {t("ops.enquiry.logHint")}
                  </p>
                  <Button
                    type="submit"
                    size="sm"
                    disabled={!logDetail.trim() || note.isPending}
                  >
                    {t("ops.enquiry.addToTimeline")}
                  </Button>
                </form>

                <form
                  className="flex flex-col gap-2"
                  onSubmit={(ev) => {
                    ev.preventDefault();
                    if (amountOk) quote.mutate();
                  }}
                >
                  <Label>{t("ops.enquiry.quoteTitle")}</Label>
                  <div className="relative">
                    <span className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-xs font-medium text-muted-foreground">
                      FC
                    </span>
                    <Input
                      type="number"
                      min={1}
                      step="1"
                      inputMode="numeric"
                      className="ps-11"
                      value={amount}
                      onChange={(ev) => setAmount(ev.target.value)}
                      placeholder="0"
                    />
                  </div>
                  <DateField
                    value={expiresAt}
                    min={new Date().toISOString().slice(0, 10)}
                    onChange={setExpiresAt}
                    aria-label={t("ops.enquiry.quoteValidUntil")}
                    placeholder={t("ops.enquiry.validUntilOptional")}
                  />
                  <Textarea
                    value={quoteNote}
                    maxLength={1000}
                    onChange={(ev) => setQuoteNote(ev.target.value)}
                    placeholder={t("ops.enquiry.quoteNotePlaceholder")}
                    className="min-h-10"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    {t("ops.enquiry.quoteHint")}
                  </p>
                  <Button
                    type="submit"
                    size="sm"
                    disabled={!amountOk || quote.isPending}
                  >
                    {t("ops.enquiry.sendQuote")}
                  </Button>
                </form>

                <div className="flex flex-col gap-2">
                  <Label>{t("ops.enquiry.moveTo")}</Label>
                  <div className="flex gap-2">
                    <Select value={stage} onValueChange={setStage}>
                      <SelectTrigger className="flex-1">
                        <SelectValue placeholder={t("ops.enquiry.chooseStage")} />
                      </SelectTrigger>
                      <SelectContent>
                        {STAGES.filter(
                          (s) => s !== e.stage && s !== "LOST"
                        ).map((s) => (
                          <SelectItem key={s} value={s}>
                            {words.stage(s)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!stage}
                      onClick={() => move(stage)}
                    >
                      {t("ops.enquiry.move")}
                    </Button>
                  </div>
                  {e.stage !== "WON" ? (
                    <Button
                      size="sm"
                      className="w-fit bg-emerald-600 text-white hover:bg-emerald-700"
                      onClick={() => move("WON")}
                    >
                      {t("ops.enquiry.markWon")}
                    </Button>
                  ) : null}
                </div>

                <div className="flex flex-col gap-2">
                  <Label>{t("ops.enquiry.markLost")}</Label>
                  {!showLost && e.stage !== "LOST" ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-fit"
                      onClick={() => setShowLost(true)}
                    >
                      {t("ops.enquiry.chooseReason")}
                    </Button>
                  ) : e.stage === "LOST" ? (
                    <p className="text-xs text-muted-foreground">
                      {t("ops.enquiry.alreadyLost", { reason: words.loss(e.lossReason) })}
                    </p>
                  ) : (
                    <>
                      <Select value={lossReason} onValueChange={setLossReason}>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder={t("ops.enquiry.whyLost")} />
                        </SelectTrigger>
                        <SelectContent>
                          {LOSS_REASONS.map(([k]) => (
                            <SelectItem key={k} value={k}>
                              {words.loss(k)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Textarea
                        value={lossNote}
                        maxLength={1000}
                        onChange={(ev) => setLossNote(ev.target.value)}
                        placeholder={t("ops.enquiry.optionalNote")}
                        className="min-h-10"
                      />
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="destructive"
                          disabled={!lossReason}
                          onClick={() =>
                            move("LOST", {
                              lossReason,
                              detail: lossNote.trim() || undefined
                            })
                          }
                        >
                          {t("ops.enquiry.markLost")}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setShowLost(false)}
                        >
                          {t("common.cancel")}
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            ) : null}
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
