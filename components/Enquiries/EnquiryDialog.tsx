import {
  addEnquiryNote,
  quoteEnquiry,
  type Enquiry,
  type EnquiryLogEntry
} from "@/api/functions/admin.api";
import { Badge } from "@/components/ui/badge";
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
import {
  formatDate,
  formatDateTime,
  formatMoney
} from "@/lib/functions/format.lib";
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
  KIND_LABELS,
  LOSS_REASONS,
  STAGES,
  STAGE_LABELS,
  STAGE_STYLES,
  aboutLine,
  lossLabel,
  telHref,
  timeLine,
  waHref
} from "./enquiry.lib";

const LOG_ICONS: Record<EnquiryLogEntry["kind"], typeof Phone> = {
  CALL: Phone,
  NOTE: StickyNote,
  QUOTE: Receipt,
  VIEWING: Eye
};

const LOG_LABELS: Record<EnquiryLogEntry["kind"], string> = {
  CALL: "Call",
  NOTE: "Note",
  QUOTE: "Quote",
  VIEWING: "Viewing"
};

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
 * quotes wait for the server because it decides what they change.
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
    setAmount(e?.quotedAmount ? String(e.quotedAmount / 100) : "");
    setExpiresAt("");
    setQuoteNote("");
    setStage("");
    setLossReason("");
    setLossNote("");
    setShowLost(Boolean(openLost));
  }, [e?.id, openLost]);

  const refresh = (data: { enquiry: Enquiry }) => {
    onUpdated(data.enquiry);
    queryClient.invalidateQueries({ queryKey: ["enquiries"] });
    queryClient.invalidateQueries({ queryKey: ["enquiries-summary"] });
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
        amount: Math.round(Number(amount) * 100),
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

  const amountCents = Math.round(Number(amount) * 100);
  const amountOk = Number.isFinite(amountCents) && amountCents > 0;
  const log = [...(e?.contactLog ?? [])].sort(
    (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()
  );
  const time = e ? timeLine(e) : null;

  return (
    <Dialog open={Boolean(e)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        {e ? (
          <>
            <DialogHeader>
              <div className="flex flex-wrap items-center gap-2 pr-6">
                <DialogTitle className="text-xl">{e.customerName}</DialogTitle>
                <Badge
                  variant="secondary"
                  className={cn("text-[11px]", STAGE_STYLES[e.stage])}
                >
                  {STAGE_LABELS[e.stage] ?? e.stage}
                </Badge>
                <Badge variant="outline" className="text-[11px]">
                  {KIND_LABELS[e.kind] ?? e.kind}
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
                  Call {e.phone}
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
            </div>

            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
              <dt className="text-muted-foreground">About</dt>
              <dd>
                {aboutLine(e)}
                {e.source ? (
                  <span className="text-muted-foreground"> · via {e.source}</span>
                ) : null}
              </dd>
              <dt className="text-muted-foreground">Message</dt>
              <dd className="whitespace-pre-wrap break-words">
                {e.message || <span className="text-muted-foreground">—</span>}
              </dd>
              <dt className="text-muted-foreground">Created</dt>
              <dd>
                {formatDateTime(e.createdAt)}
                {time ? (
                  <span
                    className={cn(
                      "ml-2 font-medium",
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
                  <dt className="text-muted-foreground">Quoted</dt>
                  <dd className="tabular-nums">
                    {formatMoney(e.quotedAmount)}
                    {e.quoteExpiresAt ? (
                      <span className="text-muted-foreground">
                        {" "}
                        · valid until {formatDate(e.quoteExpiresAt)}
                      </span>
                    ) : null}
                  </dd>
                </>
              ) : null}
              {e.stage === "LOST" && e.lossReason ? (
                <>
                  <dt className="text-muted-foreground">Lost</dt>
                  <dd>{lossLabel(e.lossReason)}</dd>
                </>
              ) : null}
            </dl>

            <section>
              <h3 className="mb-2 text-sm font-medium">Timeline</h3>
              {!log.length ? (
                <p className="text-xs text-muted-foreground">
                  Nothing logged yet.
                </p>
              ) : (
                <ol className="flex flex-col gap-2 border-l pl-4">
                  {log.map((entry, i) => {
                    const Icon = LOG_ICONS[entry.kind] ?? StickyNote;
                    return (
                      <li key={i} className="relative text-sm">
                        <span className="absolute -left-[25px] top-0.5 flex size-4 items-center justify-center rounded-full bg-background ring-1 ring-border">
                          <Icon className="size-2.5 text-muted-foreground" />
                        </span>
                        <div className="flex flex-wrap items-baseline gap-x-2">
                          <span className="font-medium">
                            {LOG_LABELS[entry.kind] ?? entry.kind}
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
                              (_, s) => `Moved to ${STAGE_LABELS[s] ?? s}`
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
                  <Label>Log a call or note</Label>
                  <Select
                    value={logKind}
                    onValueChange={(v) => setLogKind(v as typeof logKind)}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="CALL">Call</SelectItem>
                      <SelectItem value="VIEWING">Viewing</SelectItem>
                      <SelectItem value="NOTE">Note</SelectItem>
                    </SelectContent>
                  </Select>
                  <Textarea
                    value={logDetail}
                    maxLength={1000}
                    onChange={(ev) => setLogDetail(ev.target.value)}
                    placeholder="What was said, what happens next…"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    A call or viewing counts as first contact and stops the
                    reply clock.
                  </p>
                  <Button
                    type="submit"
                    size="sm"
                    disabled={!logDetail.trim() || note.isPending}
                  >
                    Add to timeline
                  </Button>
                </form>

                <form
                  className="flex flex-col gap-2"
                  onSubmit={(ev) => {
                    ev.preventDefault();
                    if (amountOk) quote.mutate();
                  }}
                >
                  <Label>Send a quote</Label>
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs font-medium text-muted-foreground">
                      USD
                    </span>
                    <Input
                      type="number"
                      min={0.01}
                      step="0.01"
                      inputMode="decimal"
                      className="pl-11"
                      value={amount}
                      onChange={(ev) => setAmount(ev.target.value)}
                      placeholder="0.00"
                    />
                  </div>
                  <Input
                    type="date"
                    value={expiresAt}
                    min={new Date().toISOString().slice(0, 10)}
                    onChange={(ev) => setExpiresAt(ev.target.value)}
                    aria-label="Quote valid until"
                  />
                  <Textarea
                    value={quoteNote}
                    maxLength={1000}
                    onChange={(ev) => setQuoteNote(ev.target.value)}
                    placeholder="Optional note for the timeline"
                    className="min-h-10"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Texts the customer the amount and moves this enquiry to
                    Quoted. Expiry is optional.
                  </p>
                  <Button
                    type="submit"
                    size="sm"
                    disabled={!amountOk || quote.isPending}
                  >
                    Send quote
                  </Button>
                </form>

                <div className="flex flex-col gap-2">
                  <Label>Move to</Label>
                  <div className="flex gap-2">
                    <Select value={stage} onValueChange={setStage}>
                      <SelectTrigger className="flex-1">
                        <SelectValue placeholder="Choose a stage" />
                      </SelectTrigger>
                      <SelectContent>
                        {STAGES.filter(
                          (s) => s !== e.stage && s !== "LOST"
                        ).map((s) => (
                          <SelectItem key={s} value={s}>
                            {STAGE_LABELS[s]}
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
                      Move
                    </Button>
                  </div>
                  {e.stage !== "WON" ? (
                    <Button
                      size="sm"
                      className="w-fit bg-emerald-600 text-white hover:bg-emerald-700"
                      onClick={() => move("WON")}
                    >
                      Mark won
                    </Button>
                  ) : null}
                </div>

                <div className="flex flex-col gap-2">
                  <Label>Mark lost</Label>
                  {!showLost && e.stage !== "LOST" ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-fit"
                      onClick={() => setShowLost(true)}
                    >
                      Choose a reason…
                    </Button>
                  ) : e.stage === "LOST" ? (
                    <p className="text-xs text-muted-foreground">
                      Already lost: {lossLabel(e.lossReason)}.
                    </p>
                  ) : (
                    <>
                      <Select value={lossReason} onValueChange={setLossReason}>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Why was it lost?" />
                        </SelectTrigger>
                        <SelectContent>
                          {LOSS_REASONS.map(([k, label]) => (
                            <SelectItem key={k} value={k}>
                              {label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Textarea
                        value={lossNote}
                        maxLength={1000}
                        onChange={(ev) => setLossNote(ev.target.value)}
                        placeholder="Optional note"
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
                          Mark lost
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setShowLost(false)}
                        >
                          Cancel
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
