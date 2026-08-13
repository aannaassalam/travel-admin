import { Enquiry, listEnquiries, setEnquiryStage } from "@/api/functions/admin.api";
import AdminLayout from "@/components/Layout/AdminLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatDateTime, formatMoney } from "@/lib/functions/format.lib";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { useOptimisticMutation } from "@/hooks/useOptimisticMutation";
import { MessageCircle, Phone } from "lucide-react";

/**
 * §7: a small CRM, not a contact-form inbox. Property is enquiry-driven and
 * request-to-book is the recovery path for thin inventory — together a
 * meaningful share of revenue.
 *
 * §15 lists "no SLA or escalation on enquiries — leads simply go cold" as a
 * thing to avoid, so the breach state is the loudest thing on the screen.
 */

const STAGES = ["NEW", "CONTACTED", "QUALIFIED", "QUOTED", "WON", "LOST"];

const NEXT_STAGE: Record<string, string> = {
  NEW: "CONTACTED",
  CONTACTED: "QUALIFIED",
  QUALIFIED: "QUOTED",
  QUOTED: "WON"
};

export default function EnquiriesPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["enquiries"],
    queryFn: () => listEnquiries()
  });

  /**
   * Moving a stage is a pipeline drag: the operator does several in a row while
   * working a list, so waiting for a round trip on each one is the difference
   * between working the queue and watching it. The new stage is exactly what
   * was clicked, so it can be shown at once and rolled back if refused.
   */
  const { mutate: move } = useOptimisticMutation<
    unknown,
    { id: string; stage: string; lossReason?: string },
    { items: Enquiry[] }
  >({
    mutationFn: ({ id, stage, lossReason }) => setEnquiryStage(id, { stage, lossReason }),
    queryKey: ["enquiries"],
    apply: (previous, { id, stage }) =>
      previous && {
        ...previous,
        items: previous.items.map((e) => (e.id === id ? { ...e, stage } : e))
      },
    successMessage: "Enquiry updated",
    errorMessage: "Could not move that enquiry"
  });

  const byStage = (stage: string) =>
    (data?.items ?? []).filter((e: Enquiry) => e.stage === stage);

  const breached = (data?.items ?? []).filter((e: Enquiry) => e.slaBreached);

  return (
    <AdminLayout
      title="Enquiries"
      description={`Property enquiries and request-to-book · first contact within ${data?.slaHours ?? 4}h`}
    >
      <div className="flex flex-col gap-5">
        {breached.length ? (
          <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 dark:border-red-900 dark:bg-red-950/40">
            <p className="text-sm font-medium text-red-900 dark:text-red-300">
              {breached.length} enquir{breached.length === 1 ? "y is" : "ies are"} past
              the {data?.slaHours}h first-contact deadline
            </p>
            <p className="mt-0.5 text-xs text-red-800 dark:text-red-400">
              Oldest has been waiting{" "}
              {Math.max(...breached.map((e) => e.hoursWaiting ?? 0))} hours.
            </p>
          </div>
        ) : null}

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          /* Pipeline board — NEW → CONTACTED → QUALIFIED → QUOTED → WON | LOST */
          <div className="overflow-x-auto">
            <div className="flex min-w-max gap-3">
              {STAGES.map((stage) => {
                const items = byStage(stage);
                return (
                  <div key={stage} className="w-[280px] shrink-0">
                    <div className="mb-2 flex items-center gap-2">
                      <span className="text-sm font-medium">
                        {stage.replace("_", " ")}
                      </span>
                      <span className="text-xs tabular-nums text-muted-foreground">
                        {items.length}
                      </span>
                    </div>
                    <div className="flex flex-col gap-2">
                      {!items.length ? (
                        <div className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
                          Empty
                        </div>
                      ) : (
                        items.map((e: Enquiry) => (
                          <Card
                            key={e.id}
                            className={cn(
                              "gap-0 p-3",
                              // §13: never colour alone — the hours label carries it too.
                              e.slaBreached &&
                                "border-red-300 bg-red-50 dark:border-red-900 dark:bg-red-950/30"
                            )}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <span className="font-mono text-[11px] text-muted-foreground">
                                {e.reference}
                              </span>
                              <Badge variant="outline" className="text-[10px]">
                                {e.kind === "REQUEST_TO_BOOK" ? "R2B" : "Property"}
                              </Badge>
                            </div>
                            <p className="mt-1 text-sm font-medium">{e.customerName}</p>
                            <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                              {e.message}
                            </p>
                            {e.quotedAmount ? (
                              <p className="mt-1 text-xs font-medium tabular-nums">
                                Quoted {formatMoney(e.quotedAmount)}
                              </p>
                            ) : null}

                            {e.slaBreached ? (
                              <p className="mt-2 text-[11px] font-medium text-red-700 dark:text-red-400">
                                ⚠ {e.hoursWaiting}h without contact
                              </p>
                            ) : e.hoursWaiting !== null ? (
                              <p className="mt-2 text-[11px] text-muted-foreground">
                                {e.hoursWaiting}h waiting
                              </p>
                            ) : (
                              <p className="mt-2 text-[11px] text-muted-foreground">
                                Contacted {formatDateTime(e.createdAt)}
                              </p>
                            )}

                            <div className="mt-2 flex flex-wrap gap-1">
                              <a href={`tel:${e.phone}`}>
                                <Button variant="outline" size="sm" className="h-7 gap-1 px-2 text-[11px]">
                                  <Phone className="size-3" />
                                  Call
                                </Button>
                              </a>
                              <a
                                href={`https://wa.me/${e.phone.replace(/\D/g, "")}`}
                                target="_blank"
                                rel="noreferrer"
                              >
                                <Button variant="outline" size="sm" className="h-7 gap-1 px-2 text-[11px]">
                                  <MessageCircle className="size-3" />
                                  WhatsApp
                                </Button>
                              </a>
                            </div>

                            {NEXT_STAGE[stage] ? (
                              <div className="mt-2 flex gap-1">
                                <Button
                                  size="sm"
                                  className="h-7 flex-1 text-[11px]"
                                  onClick={() =>
                                    move({ id: e.id, stage: NEXT_STAGE[stage] })
                                  }
                                >
                                  → {NEXT_STAGE[stage]}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 text-[11px]"
                                  onClick={() =>
                                    move({
                                      id: e.id,
                                      stage: "LOST",
                                      // §7: LOST always carries a reason.
                                      lossReason: "UNRESPONSIVE"
                                    })
                                  }
                                >
                                  Lost
                                </Button>
                              </div>
                            ) : null}
                            {e.lossReason ? (
                              <p className="mt-2 text-[11px] text-muted-foreground">
                                Lost: {e.lossReason.replace(/_/g, " ").toLowerCase()}
                              </p>
                            ) : null}
                          </Card>
                        ))
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          Quote → payment link is not built yet: it needs the same mandatory
          no-refund consent capture as normal checkout, and a quote-generated
          order without consent evidence would be the weakest link in the whole
          dispute-defence chain.
        </p>
      </div>
    </AdminLayout>
  );
}
