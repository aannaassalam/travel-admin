import {
  assignRide,
  availableDrivers,
  cancelRide,
  endRide,
  getRide,
  startRide,
  unassignRide,
  vehicleText,
  type AvailableDriver,
  type Ride
} from "@/api/functions/transfers.api";
import AssetImage from "@/components/Form/AssetImage";
import AdminLayout from "@/components/Layout/AdminLayout";
import QueryError from "@/components/QueryError";
import {
  distanceText,
  isOne,
  mapsLink,
  message,
  named,
  RIDE_ACTOR,
  RIDE_MODE,
  RideStatusBadge,
  rideWhen,
  Stars,
  type Translate
} from "@/components/Transfers/transfers.lib";
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
  formatDateTime,
  formatMoney,
  formatOrderTotal
} from "@/lib/functions/format.lib";
import { useT } from "@/lib/i18n/useT";
import {
  CANCELLATION_REASON,
  label,
  ORDER_STATUS,
  PAYMENT_METHOD,
  PAYMENT_STATUS
} from "@/lib/functions/labels.lib";
import type { TranslationKey } from "@/lib/i18n/messages";
import { useCan } from "@/lib/permissions";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AxiosError } from "axios";
import { ArrowLeft, MapPin, Phone, ShieldAlert } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/router";
import { useState } from "react";
import { toast } from "sonner";

/**
 * One ride: the map, the facts, the driver, the booking it belongs to, its
 * history and alerts — and what the office can still do to it. Everything on
 * one screen: the office is on the phone with the customer or the driver.
 */

// Client-only, as LocationPicker loads its map: Leaflet reads `window` at import.
const RideMap = dynamic(() => import("@/components/Transfers/RideLeaflet"), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse bg-muted/40" />
});

const PAYMENT_STYLES: Record<string, string> = {
  PAID: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  UNPAID: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  PENDING: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  FAILED: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
  REVERSED: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300"
};

/**
 * The office's reasons; the cash deadline is the system's own. Read at render,
 * so the words follow the panel's language.
 */
const reasons = () =>
  Object.entries(CANCELLATION_REASON).filter(([code]) => code !== "CASH_DEADLINE_EXPIRED");

/** The ride's history events; one not listed reads title-cased. */
const RIDE_EVENT: Record<string, TranslationKey> = {
  RIDE_REQUESTED: "tr.ride.event.RIDE_REQUESTED",
  RIDE_ASSIGNED: "tr.ride.event.RIDE_ASSIGNED",
  RIDE_UNASSIGNED: "tr.ride.event.RIDE_UNASSIGNED",
  RIDE_STARTED: "tr.ride.event.RIDE_STARTED",
  RIDE_COMPLETED: "tr.ride.event.RIDE_COMPLETED",
  RIDE_CANCELLED: "tr.ride.event.RIDE_CANCELLED",
  RIDE_RATED: "tr.ride.event.RIDE_RATED",
  ALERT_RAISED: "tr.ride.event.ALERT_RAISED"
};

/** Who did it; a code not listed is shown as it is. */
const actor = (t: Translate, code: string) => (RIDE_ACTOR[code] ? t(RIDE_ACTOR[code]) : code);

/** Each status as the sentence the office can read out on the phone. */
const sentence = (t: Translate, r: Ride) => {
  switch (r.status) {
    case "PENDING":
      return t("tr.ride.sentence.pending");
    case "ASSIGNED":
      return t("tr.ride.sentence.assigned", { driver: r.driver?.name ?? t("tr.ride.theDriver") });
    case "STARTED":
      return t("tr.ride.sentence.started", { at: formatDateTime(r.startedAt) });
    case "COMPLETED":
      return t("tr.ride.sentence.completed", { at: formatDateTime(r.endedAt) });
    case "CANCELLED":
      return r.cancellationReason
        ? t("tr.ride.sentence.cancelledWhy", {
            at: formatDateTime(r.cancelledAt),
            reason: label(CANCELLATION_REASON, r.cancellationReason)
          })
        : t("tr.ride.sentence.cancelled", { at: formatDateTime(r.cancelledAt) });
  }
};

/** How long the driver is taken: the hours booked, or the drive. */
const rideMinutes = (r: Ride) =>
  r.mode === "HOURLY" ? (r.hours ?? 1) * 60 : r.durationMinutes;

const tel = (phone: string) => `tel:${phone.replace(/\s/g, "")}`;

function Fact({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{name}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

/**
 * The drivers of the ride's city with a vehicle, each marked free or busy
 * around the pick-up time. A busy one can still be assigned — the office knows
 * things the calendar does not — but only after saying so.
 */
function AssignDialog({
  ride,
  open,
  onOpenChange,
  onAssigned
}: {
  ride: Ride;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAssigned: () => void;
}) {
  const { t, locale } = useT();
  const minutes = rideMinutes(ride);
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["drivers-available", ride.id, ride.at, minutes],
    queryFn: () => availableDrivers({ city: ride.city, at: ride.at, minutes, except: ride.id }),
    enabled: open,
    // Who is free changes as other rides are assigned: read afresh each time.
    staleTime: 0
  });
  // The question "assign anyway?" — asked here for a driver the list marks
  // busy, or by the server when someone else booked them meanwhile.
  const [force, setForce] = useState<{ driver: AvailableDriver; why: string } | null>(null);

  const { mutate: assign, isPending, variables } = useMutation({
    mutationFn: ({ driver, force }: { driver: AvailableDriver; force?: boolean }) =>
      assignRide(ride.id, { driverId: driver.id, force }),
    meta: { showToast: false },
    onSuccess: (_r, { driver }) => {
      toast.success(t("tr.ride.assigned", { name: driver.name }));
      setForce(null);
      onOpenChange(false);
      onAssigned();
    },
    onError: (e, { driver }) => {
      const res = (e as AxiosError<{ message?: string; code?: string }>).response;
      if (res?.status === 409 && res.data?.code === "DRIVER_BUSY") {
        return setForce({
          driver,
          why: res.data.message ?? t("tr.ride.busyOther", { name: driver.name })
        });
      }
      toast.error(message(e, t("tr.ride.assignFailed")));
    }
  });

  const pick = (d: AvailableDriver) =>
    d.busy || d.onRideNow
      ? setForce({
          driver: d,
          why: d.onRideNow
            ? t("tr.ride.onRideNowWhy", { name: d.name })
            : t("tr.ride.busyWhy", { name: d.name, ref: d.busy ?? "" })
        })
      : assign({ driver: d });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (isPending) return;
        setForce(null);
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("tr.ride.assignTitle")}</DialogTitle>
          <DialogDescription>
            {t("tr.ride.assignBody", { city: ride.city, when: rideWhen(ride.at, locale) })}
          </DialogDescription>
        </DialogHeader>
        {force ? (
          <div
            role="alert"
            className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-900 dark:bg-amber-950/40"
          >
            <p className="font-medium">{t("tr.ride.busyDriver")}</p>
            <p className="mt-1 text-muted-foreground">
              {t("tr.ride.assignAnywayQ", { why: force.why, name: force.driver.name })}
            </p>
            <div className="mt-3 flex gap-2">
              <Button
                size="sm"
                disabled={isPending}
                onClick={() => assign({ driver: force.driver, force: true })}
              >
                {isPending ? t("tr.ride.assigning") : t("tr.ride.assignAnyway")}
              </Button>
              <Button size="sm" variant="ghost" disabled={isPending} onClick={() => setForce(null)}>
                {t("tr.ride.backToList")}
              </Button>
            </div>
          </div>
        ) : isLoading ? (
          <p className="py-6 text-center text-sm text-muted-foreground">{t("common.loading")}</p>
        ) : isError ? (
          <QueryError onRetry={() => refetch()} />
        ) : !data?.items.length ? (
          <p className="text-sm text-muted-foreground">
            {t("tr.ride.noDriverInCity", { city: ride.city })}
          </p>
        ) : (
          <ul className="max-h-80 divide-y overflow-y-auto rounded-md border">
            {data.items.map((d) => {
              const busy = Boolean(d.busy || d.onRideNow);
              return (
                <li key={d.id} className="flex items-center gap-3 p-3">
                  <AssetImage src={d.photo} className="size-10 shrink-0 rounded-full object-cover" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{d.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {vehicleText(d.vehicle) ?? t("tr.ride.noVehicle")} ·{" "}
                      <span dir="ltr">{d.phone}</span>
                    </p>
                  </div>
                  {d.onRideNow ? (
                    <Badge variant="secondary" className={PAYMENT_STYLES.PENDING}>
                      {t("tr.ride.onRideNow")}
                    </Badge>
                  ) : d.busy ? (
                    <Badge variant="secondary" className={PAYMENT_STYLES.PENDING}>
                      {t("tr.ride.busy", { ref: d.busy })}
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className={PAYMENT_STYLES.PAID}>
                      {t("tr.ride.available")}
                    </Badge>
                  )}
                  <Button
                    size="sm"
                    variant={busy ? "outline" : "default"}
                    disabled={isPending}
                    onClick={() => pick(d)}
                  >
                    {isPending && variables?.driver.id === d.id ? t("tr.ride.assigning") : t("tr.ride.assign")}
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function RidePage() {
  const router = useRouter();
  const id = router.query.id as string;
  const queryClient = useQueryClient();
  const { can } = useCan();
  const { t, locale } = useT();
  const canWrite = can("orders:write");
  const [assigning, setAssigning] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  // Start, end and remove-the-driver confirm first. One dialog drives all three.
  const [confirming, setConfirming] = useState<{
    title: string;
    body: string;
    action: string;
    run: () => void;
  } | null>(null);

  const {
    data: ride,
    isLoading,
    isError,
    error,
    refetch
  } = useQuery({
    queryKey: ["ride", id],
    queryFn: () => getRide(id),
    enabled: Boolean(id),
    // The driver may have started or ended it since this page was last open.
    refetchOnMount: "always"
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["ride", id] });
    queryClient.invalidateQueries({ queryKey: ["rides"] });
    setConfirming(null);
  };
  const onError = (e: unknown) => toast.error(message(e, t("tr.ride.actionFailed")));

  const { mutate: act, isPending } = useMutation({
    mutationFn: (what: "unassign" | "start" | "end") =>
      what === "unassign" ? unassignRide(id) : what === "start" ? startRide(id) : endRide(id),
    meta: { showToast: false },
    onSuccess: (_r, what) => {
      refresh();
      toast.success(
        what === "unassign"
          ? t("tr.ride.removed")
          : what === "start"
            ? t("tr.ride.started")
            : t("tr.ride.completed")
      );
    },
    onError
  });

  const { mutate: cancel, isPending: cancelPending } = useMutation({
    mutationFn: () => cancelRide(id, { reason, note: note.trim() || undefined }),
    meta: { showToast: false },
    onSuccess: () => {
      setCancelling(false);
      setReason("");
      setNote("");
      refresh();
      toast.success(t("tr.ride.cancelled"));
    },
    onError
  });

  if (isLoading) {
    return (
      <AdminLayout title={t("tr.ride.title")}>
        <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
      </AdminLayout>
    );
  }
  // A 404 is genuinely "not found"; any other failure gets a retry.
  if (isError && (error as AxiosError)?.response?.status !== 404) {
    return (
      <AdminLayout title={t("tr.ride.title")}>
        <QueryError onRetry={() => refetch()} />
      </AdminLayout>
    );
  }
  if (!ride) {
    return (
      <AdminLayout title={t("tr.ride.title")}>
        <p className="text-sm text-muted-foreground">{t("tr.ride.notFound")}</p>
      </AdminLayout>
    );
  }

  const closed = ride.status === "COMPLETED" || ride.status === "CANCELLED";
  const alerts = ride.alerts ?? [];
  const order = ride.order;
  const { price, cost } = ride;

  return (
    <AdminLayout
      title={ride.reference || t("tr.ride.title")}
      description={t("tr.ride.description", { city: ride.city, when: rideWhen(ride.at, locale) })}
    >
      <div className="flex flex-col gap-6">
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/transfers">
            <Button variant="ghost" size="sm" className="gap-2">
              <ArrowLeft className="size-4 rtl:-scale-x-100" />
              {t("nav.transfers.rides")}
            </Button>
          </Link>
          <RideStatusBadge status={ride.status} />
          {order ? (
            <Badge variant="secondary" className={PAYMENT_STYLES[order.paymentStatus]}>
              {label(PAYMENT_STATUS, order.paymentStatus)} ·{" "}
              {label(PAYMENT_METHOD, order.paymentMethod)}
            </Badge>
          ) : null}
          {alerts.length ? (
            <Badge className="gap-1 bg-red-600 text-white">
              <ShieldAlert />
              {t(isOne(locale, alerts.length) ? "tr.ride.alerts.one" : "tr.ride.alerts.other", {
                n: alerts.length
              })}
            </Badge>
          ) : null}
          <span className="ms-auto text-end">
            {/* What the customer pays, as the ride snapshot it; the booking
                card below says what they were charged in their currency. */}
            <span className="block text-lg font-semibold tabular-nums">
              {formatMoney(price, "CDF", locale)}
            </span>
            {/* Admin only: the driver's share never reaches the public API. */}
            {typeof cost === "number" ? (
              <span className="block text-xs text-muted-foreground tabular-nums">
                {t("tr.ride.costMargin", {
                  cost: formatMoney(cost, "CDF", locale),
                  margin: formatMoney((price ?? 0) - cost, "CDF", locale)
                })}
              </span>
            ) : null}
          </span>
        </div>

        <p className="rounded-lg border bg-muted/40 px-3 py-2 text-sm">{sentence(t, ride)}</p>

        <div className="grid gap-4 lg:grid-cols-3">
          <div className="flex flex-col gap-4 lg:col-span-2">
            <Card className="gap-0 p-4">
              {/* `isolate` keeps Leaflet's own z-indexes under the sticky header. */}
              <div className="relative isolate z-0 h-80 overflow-hidden rounded-md border">
                <RideMap
                  pickup={ride.pickup}
                  dropoff={ride.dropoff}
                  route={ride.route}
                  alerts={alerts}
                />
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">
                {t("tr.ride.mapLegend")}{" "}
                {distanceText(t, ride)}
                {ride.routeSource === "ESTIMATE" ? t("tr.ride.estimateWhy") : ""}
              </p>
            </Card>

            <Card className="gap-0 p-4">
              <h2 className="mb-3 text-sm font-medium">{t("tr.ride.title")}</h2>
              <dl className="grid gap-3 sm:grid-cols-2">
                <Fact name={t("tr.rides.pickup")}>
                  {ride.pickup.label}{" "}
                  <a
                    href={mapsLink(ride.pickup.lat, ride.pickup.lng)}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-0.5 text-xs text-muted-foreground underline underline-offset-2"
                  >
                    <MapPin className="size-3" />
                    {t("tr.ride.map")}
                  </a>
                </Fact>
                <Fact name={t("tr.ride.dropoff")}>
                  {ride.dropoff ? (
                    <>
                      {ride.dropoff.label}{" "}
                      <a
                        href={mapsLink(ride.dropoff.lat, ride.dropoff.lng)}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-0.5 text-xs text-muted-foreground underline underline-offset-2"
                      >
                        <MapPin className="size-3" />
                        {t("tr.ride.map")}
                      </a>
                    </>
                  ) : (
                    <span className="text-muted-foreground">
                      {t("tr.ride.noDropoff")}
                    </span>
                  )}
                </Fact>
                <Fact name={t("tr.ride.when")}>{rideWhen(ride.at, locale)}</Fact>
                <Fact name={t("tr.ride.mode")}>
                  {t(RIDE_MODE[ride.mode])}
                  {ride.mode === "HOURLY" && ride.hours ? ` · ${ride.hours} h` : ""}
                </Fact>
                <Fact name={t("tr.ride.passengers")}>{ride.passengers}</Fact>
                <Fact name={t("tr.ride.category")}>{ride.category?.name ?? "—"}</Fact>
                <Fact name={t("tr.ride.distance")}>{distanceText(t, ride)}</Fact>
                <Fact name={t("book.customer")}>
                  {ride.customer?.name ?? "—"}
                  {ride.customer?.phone ? (
                    <>
                      {" · "}
                      <a href={tel(ride.customer.phone)} dir="ltr" className="underline underline-offset-2">
                        {ride.customer.phone}
                      </a>
                    </>
                  ) : null}
                </Fact>
                {ride.notes ? (
                  <div className="sm:col-span-2">
                    <Fact name={t("tr.ride.customerNote")}>
                      <span className="whitespace-pre-line">{ride.notes}</span>
                    </Fact>
                  </div>
                ) : null}
              </dl>
            </Card>

            {alerts.length ? (
              <Card className="gap-0 border-red-200 p-4 dark:border-red-900">
                <h2 className="mb-2 flex items-center gap-2 text-sm font-medium">
                  <ShieldAlert className="size-4 text-red-600" />
                  {t("tr.ride.securityAlerts")}
                </h2>
                <ul className="flex flex-col gap-2">
                  {alerts.map((a, i) => (
                    <li key={`${a.at}-${i}`} className="text-sm">
                      <span className="font-medium">
                        {actor(t, a.by)} · {formatDateTime(a.at)}
                      </span>
                      {" · "}
                      {typeof a.lat === "number" && typeof a.lng === "number" ? (
                        <a
                          href={mapsLink(a.lat, a.lng)}
                          target="_blank"
                          rel="noreferrer"
                          className="underline underline-offset-2"
                        >
                          {t("tr.ride.positionMap")}
                        </a>
                      ) : (
                        <span className="text-muted-foreground">{t("tr.ride.positionNone")}</span>
                      )}
                      {" · "}
                      <span className={a.smsSent ? "text-muted-foreground" : "text-red-600"}>
                        {a.smsSent ? t("tr.ride.smsSent") : t("tr.ride.smsNotSent")}
                      </span>
                      {a.note ? <p className="text-muted-foreground">{a.note}</p> : null}
                    </li>
                  ))}
                </ul>
              </Card>
            ) : null}

            {ride.rating ? (
              <Card className="gap-0 p-4">
                <h2 className="mb-2 text-sm font-medium">{t("tr.ride.rating")}</h2>
                <div className="flex items-center gap-2 text-sm">
                  <Stars n={ride.rating.score} />
                  <span className="text-xs text-muted-foreground">
                    {formatDateTime(ride.rating.at)}
                  </span>
                </div>
                {ride.rating.comment ? (
                  <p className="mt-1 whitespace-pre-line text-sm">{ride.rating.comment}</p>
                ) : null}
              </Card>
            ) : null}

            <Card className="gap-0 p-4">
              <h2 className="mb-3 text-sm font-medium">{t("tr.ride.history")}</h2>
              {ride.timeline?.length ? (
                <ol className="flex flex-col gap-2">
                  {ride.timeline.map((ev, i) => (
                    <li key={`${ev.at}-${i}`} className="flex gap-3 text-sm">
                      <span className="w-40 shrink-0 text-xs text-muted-foreground">
                        {formatDateTime(ev.at)}
                      </span>
                      <span>
                        <span className="font-medium" title={ev.event}>
                          {named(t, RIDE_EVENT, ev.event)}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {" "}
                          ({actor(t, ev.actor)})
                        </span>
                        {ev.detail ? (
                          <span className="text-muted-foreground"> · {ev.detail}</span>
                        ) : null}
                      </span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-sm text-muted-foreground">{t("tr.ride.nothingYet")}</p>
              )}
            </Card>
          </div>

          <div className="flex flex-col gap-4">
            <Card className="gap-0 p-4">
              <h2 className="mb-3 text-sm font-medium">{t("tr.actor.DRIVER")}</h2>
              {ride.driver ? (
                <div className="flex items-start gap-3">
                  <AssetImage
                    src={ride.driver.photo}
                    className="size-14 shrink-0 rounded-full object-cover"
                  />
                  <div className="min-w-0">
                    <p className="font-medium">{ride.driver.name}</p>
                    {ride.driver.ratingStats?.count ? (
                      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Stars n={ride.driver.ratingStats.rating} />
                        {ride.driver.ratingStats.rating.toFixed(1)} ({ride.driver.ratingStats.count})
                      </p>
                    ) : null}
                    {ride.vehicle ? (
                      <p className="text-sm text-muted-foreground">
                        {[ride.vehicle.make, ride.vehicle.model, ride.vehicle.color]
                          .filter(Boolean)
                          .join(" ")}
                        {" · "}
                        <span className="font-mono">{ride.vehicle.plate}</span>
                      </p>
                    ) : null}
                    {ride.driver.phone ? (
                      <a href={tel(ride.driver.phone)} className="mt-2 inline-block">
                        <Button variant="outline" size="sm" className="gap-2">
                          <Phone className="size-3.5" />
                          <span dir="ltr">{ride.driver.phone}</span>
                        </Button>
                      </a>
                    ) : null}
                    {ride.assignedAt ? (
                      <p className="mt-2 text-xs text-muted-foreground">
                        {t("tr.ride.assignedAt", { at: formatDateTime(ride.assignedAt) })}
                      </p>
                    ) : null}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {ride.status === "PENDING" ? t("tr.ride.noDriverYet") : t("tr.ride.noDriverRecorded")}
                </p>
              )}
            </Card>

            {canWrite && !closed ? (
              <Card className="gap-0 p-4">
                <h2 className="mb-3 text-sm font-medium">{t("common.actions")}</h2>
                <div className="flex flex-col gap-2">
                  {ride.status === "PENDING" ? (
                    <Button size="sm" onClick={() => setAssigning(true)}>
                      {t("tr.ride.assignTitle")}
                    </Button>
                  ) : null}
                  {ride.status === "ASSIGNED" ? (
                    <>
                      <Button
                        size="sm"
                        disabled={isPending}
                        onClick={() =>
                          setConfirming({
                            title: t("tr.ride.startQ"),
                            body: t("tr.ride.startBody", {
                              customer: ride.customer?.name ?? t("tr.ride.theCustomer")
                            }),
                            action: t("tr.ride.start"),
                            run: () => act("start")
                          })
                        }
                      >
                        {t("tr.ride.start")}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={isPending}
                        onClick={() =>
                          setConfirming({
                            title: t("tr.ride.removeQ"),
                            body: t("tr.ride.removeBody", {
                              driver: ride.driver?.name ?? t("tr.ride.theDriver")
                            }),
                            action: t("tr.ride.remove"),
                            run: () => act("unassign")
                          })
                        }
                      >
                        {t("tr.ride.remove")}
                      </Button>
                    </>
                  ) : null}
                  {ride.status === "STARTED" ? (
                    <Button
                      size="sm"
                      disabled={isPending}
                      onClick={() =>
                        setConfirming({
                          title: t("tr.ride.endQ"),
                          body: t("tr.ride.endBody"),
                          action: t("tr.ride.end"),
                          run: () => act("end")
                        })
                      }
                    >
                      {t("tr.ride.end")}
                    </Button>
                  ) : null}
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={isPending}
                    onClick={() => setCancelling(true)}
                  >
                    {t("tr.ride.cancel")}
                  </Button>
                </div>
              </Card>
            ) : null}

            <Card className="gap-0 p-4">
              <h2 className="mb-3 text-sm font-medium">{t("tr.ride.booking")}</h2>
              {order ? (
                <div className="text-sm">
                  <Link
                    href={`/bookings/${order.id}`}
                    className="font-mono font-medium hover:underline"
                  >
                    {order.reference}
                  </Link>
                  <p className="mt-1 text-muted-foreground">
                    {label(ORDER_STATUS, order.status)} · {label(PAYMENT_STATUS, order.paymentStatus)}{" "}
                    · {label(PAYMENT_METHOD, order.paymentMethod)}
                  </p>
                  <p className="mt-1 font-medium tabular-nums">{formatOrderTotal(order, locale)}</p>
                  {order.customer ? (
                    <div className="mt-3 border-t pt-3">
                      <p className="font-medium">{order.customer.fullName}</p>
                      {order.customer.phone ? (
                        <a href={tel(order.customer.phone)} className="mt-2 inline-block">
                          <Button variant="outline" size="sm" className="gap-2">
                            <Phone className="size-3.5" />
                            {t("tr.ride.call")}
                          </Button>
                        </a>
                      ) : null}
                    </div>
                  ) : null}
                  {order.paymentMethod === "CASH" &&
                  order.paymentStatus !== "PAID" &&
                  order.status !== "CANCELLED" ? (
                    // A ride's cash goes to the driver at the end of the ride; the
                    // office then records it. The cash-deadline job lets go of a
                    // booking whose ride was never driven; a driven one it waits for.
                    <p className="mt-3 text-xs text-amber-700 dark:text-amber-400">
                      {t("tr.ride.cash")}
                      {order.cashDeadline && !closed && ride.status !== "STARTED"
                        ? t("tr.ride.cashLapses", { at: formatDateTime(order.cashDeadline) })
                        : ""}
                    </p>
                  ) : null}
                  <p className="mt-3 text-xs text-muted-foreground">
                    {t("tr.ride.bookingPage")}
                  </p>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">{t("tr.ride.noBooking")}</p>
              )}
            </Card>
          </div>
        </div>
      </div>

      {canWrite ? (
        <AssignDialog
          ride={ride}
          open={assigning}
          onOpenChange={setAssigning}
          onAssigned={refresh}
        />
      ) : null}

      <AlertDialog open={Boolean(confirming)} onOpenChange={(open) => !open && setConfirming(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirming?.title}</AlertDialogTitle>
            <AlertDialogDescription>{confirming?.body}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>{t("tr.ride.keepIt")}</AlertDialogCancel>
            <AlertDialogAction
              disabled={isPending}
              onClick={(e) => {
                // Stays open until the mutation succeeds (refresh closes it),
                // so a slow request cannot look like a no-op and invite a re-click.
                e.preventDefault();
                confirming?.run();
              }}
            >
              {isPending ? t("tr.ride.working") : confirming?.action}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={cancelling} onOpenChange={(open) => !cancelPending && setCancelling(open)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("tr.ride.cancelQ")}</DialogTitle>
            {/* Only a driver still to come is texted: one driving it is with the customer. */}
            <DialogDescription>
              {t("tr.ride.cancelBody", {
                ref: ride.reference,
                driver: ride.driver
                  ? t(ride.status === "ASSIGNED" ? "tr.ride.cancelLosesTexted" : "tr.ride.cancelLoses", {
                      name: ride.driver.name
                    })
                  : ""
              })}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div>
              <Label className="text-xs">{t("common.reason")} *</Label>
              <Select value={reason} onValueChange={setReason}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={t("tr.ride.whyCancelled")} />
                </SelectTrigger>
                <SelectContent>
                  {reasons().map(([value, text]) => (
                    <SelectItem key={value} value={value}>
                      {text}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">{t("tr.ride.noteOptional")}</Label>
              <Textarea
                rows={2}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={t("tr.ride.notePlaceholder")}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" disabled={cancelPending} onClick={() => setCancelling(false)}>
              {t("tr.ride.keepRide")}
            </Button>
            <Button
              variant="destructive"
              disabled={!reason || cancelPending}
              onClick={() => cancel()}
            >
              {cancelPending ? t("tr.ride.cancelling") : t("tr.ride.cancelBoth")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
