import { refId } from "@/api/functions/admin.api";
import {
  deleteVisaConfig,
  getVisaCountry,
  listVisaConfig,
  saveVisaCountry,
  setVisaCountryLive,
  type VisaCountry,
  type VisaEntries
} from "@/api/functions/visa.api";
import DeleteButton from "@/components/DeleteButton";
import LocalizedInput, { type Localized } from "@/components/Form/LocalizedInput";
import MoneyInput, { formToMoney, moneyToForm } from "@/components/Form/MoneyInput";
import { OptionSelect } from "@/components/Form/OptionSelect";
import AdminLayout from "@/components/Layout/AdminLayout";
import QueryError from "@/components/QueryError";
import { message } from "@/components/Transfers/transfers.lib";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useLeaveGuard, useUnsaved } from "@/hooks/useUnsaved";
import { deactivatePrompt } from "@/lib/functions/labels.lib";
import { lz, toLocalized } from "@/lib/functions/localized.lib";
import { useT } from "@/lib/i18n/useT";
import { useCan } from "@/lib/permissions";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import { toast } from "sonner";

/** A town as the form holds it. */
interface TownForm {
  id?: string;
  name: Localized;
  isActive: boolean;
}

/** An offer (one visa type for this country) as the form holds it: numbers as typed. */
interface OfferForm {
  id?: string;
  visaType: string;
  serviceFee: Record<string, string>;
  embassyFee: Record<string, string>;
  processingDays: string;
  validityDays: string;
  entries: VisaEntries;
  requiredDocuments: Localized;
  isActive: boolean;
}

const subId = (x: { id?: string; _id?: string }) => x.id ?? x._id;

const newOffer = (): OfferForm => ({
  visaType: "",
  serviceFee: moneyToForm(),
  embassyFee: moneyToForm(),
  processingDays: "",
  validityDays: "",
  entries: "SINGLE",
  requiredDocuments: {},
  isActive: true
});

const whole = (v: string) => /^\d+$/.test(v.trim());
/** A service fee the server takes: whole francs above 0. */
const feeOk = (f: Record<string, string>) => Number(f.CDF) > 0;
/** Processing days required (0–365); the visa's validity optional, else 1 day or more. */
const daysOk = (o: OfferForm) =>
  whole(o.processingDays) && (!o.validityDays.trim() || (whole(o.validityDays) && Number(o.validityDays) >= 1));

export default function VisaCountryPage() {
  const { query } = useRouter();
  // A fresh form for each record, as the restaurant form.
  return <CountryForm key={String(query.id ?? "")} />;
}

function CountryForm() {
  const router = useRouter();
  const id = router.query.id as string;
  const isNew = !id || id === "new";
  const { t } = useT();
  const { dirty, setDirty, isDirty, mark } = useUnsaved();
  const { can } = useCan();
  const canWrite = can("inventory:write");

  const [code, setCode] = useState("");
  const [name, setName] = useState<Localized>({});
  const [notes, setNotes] = useState<Localized>({});
  const [validityMonths, setValidityMonths] = useState("6");
  const [sortOrder, setSortOrder] = useState("0");
  const [towns, setTowns] = useState<TownForm[]>([]);
  const [offers, setOffers] = useState<OfferForm[]>([]);

  const { data: country, isError, error, isFetching, isFetchedAfterMount, refetch } = useQuery({
    queryKey: ["visa-country", id],
    queryFn: () => getVisaCountry(id),
    enabled: !isNew,
    refetchOnMount: "always"
  });
  const { data: types } = useQuery({
    queryKey: ["visa-config", "types"],
    queryFn: () => listVisaConfig("types"),
    staleTime: 60 * 1000
  });

  // Opened once THIS visit has read the record (see the restaurant form).
  const [opened, setOpened] = useState(false);
  if (!opened && country && isFetchedAfterMount && !isError) setOpened(true);

  useEffect(() => {
    if (!country || isDirty()) return;
    const c: VisaCountry = country;
    setCode(c.code ?? "");
    setName(toLocalized(c.name));
    setNotes(toLocalized(c.notes));
    setValidityMonths(String(c.passportValidityMonths ?? 6));
    setSortOrder(String(c.sortOrder ?? 0));
    setTowns((c.towns ?? []).map((x) => ({ id: subId(x), name: toLocalized(x.name), isActive: x.isActive })));
    setOffers(
      (c.offers ?? []).map((o) => ({
        id: subId(o),
        visaType: refId(o.visaType),
        serviceFee: moneyToForm(o.serviceFee),
        embassyFee: moneyToForm(o.embassyFee),
        processingDays: String(o.processingDays ?? ""),
        validityDays: String(o.validityDays ?? ""),
        entries: o.entries ?? "SINGLE",
        requiredDocuments: toLocalized(o.requiredDocuments),
        isActive: o.isActive
      }))
    );
  }, [country, isDirty]);

  const letGo = useLeaveGuard({ dirty });
  const touch = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setDirty(true);
  };
  const setTown = (i: number, patch: Partial<TownForm>) => {
    setTowns((all) => all.map((x, n) => (n === i ? { ...x, ...patch } : x)));
    setDirty(true);
  };
  const setOffer = (i: number, patch: Partial<OfferForm>) => {
    setOffers((all) => all.map((x, n) => (n === i ? { ...x, ...patch } : x)));
    setDirty(true);
  };

  const onError = (e: unknown) => toast.error(message(e, t("inv.restaurant.saveFailed")));

  /** What stops a save, said before the server refuses it. */
  const problem = !/^[A-Z]{2}$/.test(code)
    ? t("visa.country.codeInvalid")
    : !name.fr?.trim()
      ? t("visa.country.nameMissing")
      : towns.findIndex((x) => !x.name.fr?.trim()) >= 0
        ? t("visa.country.townUnnamed", { n: towns.findIndex((x) => !x.name.fr?.trim()) + 1 })
        : offers.findIndex((o) => !o.visaType) >= 0
          ? t("visa.country.offerNoType", { n: offers.findIndex((o) => !o.visaType) + 1 })
          : offers.findIndex((o) => !feeOk(o.serviceFee)) >= 0
            ? t("visa.country.offerNoFee", { n: offers.findIndex((o) => !feeOk(o.serviceFee)) + 1 })
            : offers.findIndex((o) => !daysOk(o)) >= 0
              ? t("visa.country.offerDays", { n: offers.findIndex((o) => !daysOk(o)) + 1 })
              : !whole(validityMonths)
                ? t("visa.country.monthsInvalid")
                : "";

  const { mutate: save, isPending } = useMutation({
    mutationFn: async () => {
      const unchanged = mark();
      const saved = await saveVisaCountry(isNew ? undefined : id, {
        code,
        name,
        notes,
        passportValidityMonths: Number(validityMonths),
        sortOrder: Number(sortOrder) || 0,
        // Ids kept: an application points at its town and offer.
        towns: towns.map((x) => ({ ...(x.id ? { id: x.id } : {}), name: x.name, isActive: x.isActive })),
        offers: offers.map((o) => ({
          ...(o.id ? { id: o.id } : {}),
          visaType: o.visaType,
          serviceFee: formToMoney(o.serviceFee),
          embassyFee: formToMoney(o.embassyFee),
          processingDays: Number(o.processingDays),
          // Blank: the visa's validity is not stated.
          validityDays: o.validityDays.trim() ? Number(o.validityDays) : null,
          entries: o.entries,
          requiredDocuments: o.requiredDocuments,
          isActive: o.isActive
        }))
      });
      return { saved, clean: unchanged() };
    },
    meta: { showToast: false },
    onSuccess: ({ saved, clean }) => {
      if (clean) setDirty(false);
      toast.success(t("vs.saved"));
      if (isNew && saved?.id) {
        letGo();
        router.replace(`/e-visa/countries/${saved.id}`);
      }
    },
    onError
  });

  const { mutate: act, isPending: acting } = useMutation({
    mutationFn: (action: "publish" | "deactivate") => setVisaCountryLive(id, action),
    meta: { showToast: false },
    onSuccess: (_r, action) =>
      toast.success(
        t(action === "publish" ? "inv.list.published" : "inv.list.deactivated", { name: lz(name) })
      ),
    onError
  });

  if (isNew && !canWrite) {
    return (
      <AdminLayout title={t("visa.countries.new")}>
        <p className="text-sm text-muted-foreground">{t("inv.restaurant.noWrite")}</p>
      </AdminLayout>
    );
  }
  if (!isNew && !opened) {
    return (
      <AdminLayout title={t("visa.country")}>
        {isError && !isFetching ? (
          <QueryError error={error} onRetry={() => refetch()} />
        ) : (
          <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
        )}
      </AdminLayout>
    );
  }

  const typeOptions = (types?.items ?? []).filter(
    (x) => x.isActive || offers.some((o) => o.visaType === x.id)
  );
  const blockers = country?.publishBlockers ?? [];

  return (
    <AdminLayout
      title={isNew ? t("visa.countries.new") : lz(name) || t("visa.country")}
      description={t("visa.country.description")}
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Link href="/e-visa/countries">
          <Button variant="ghost" size="sm" className="gap-2">
            <ArrowLeft className="size-4 rtl:-scale-x-100" />
            {t("visa.countries.title")}
          </Button>
        </Link>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {canWrite && problem && dirty ? (
            <span className="text-xs text-amber-600 dark:text-amber-400">{problem}</span>
          ) : canWrite && dirty && !isNew ? (
            <span className="text-xs text-amber-600 dark:text-amber-400">{t("inv.restaurant.unsaved")}</span>
          ) : null}
          {country ? (
            <Badge
              variant="secondary"
              className={
                country.isActive
                  ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                  : undefined
              }
            >
              {country.isActive ? t("visa.live") : t("visa.notLive")}
            </Badge>
          ) : null}
          {canWrite ? (
            <Button disabled={isPending || Boolean(problem)} title={problem || undefined} onClick={() => save()}>
              {isPending ? t("inv.restaurant.saving") : t("common.save")}
            </Button>
          ) : null}
          {canWrite && country && !country.isActive ? (
            <Button
              variant="secondary"
              // Unsaved edits first: the website would get the version that was saved.
              disabled={blockers.length > 0 || acting || dirty}
              title={blockers.join("; ") || undefined}
              onClick={() => act("publish")}
            >
              {t("common.publish")}
            </Button>
          ) : null}
          {canWrite && country?.isActive ? (
            <Button
              variant="outline"
              disabled={acting || dirty}
              onClick={() => window.confirm(deactivatePrompt(lz(name))) && act("deactivate")}
            >
              {t("inv.restaurant.deactivate")}
            </Button>
          ) : null}
          {/* One with applications is only ever taken off the website. */}
          {country && !country.applicationCount ? (
            <DeleteButton
              permission="inventory:delete"
              label={t("inv.restaurant.delete")}
              className="h-9"
              what={t("vs.cat.deleteWhat", { name: lz(name) })}
              consequence={t("visa.country.deleteConsequence")}
              onDelete={() => deleteVisaConfig("countries", id)}
              onDeleted={() => {
                letGo();
                router.replace("/e-visa/countries");
              }}
            />
          ) : null}
        </div>
      </div>

      {!isNew && blockers.length > 0 ? (
        <Card className="mb-4 border-amber-300 bg-amber-50 p-4 dark:bg-amber-950/30">
          <p className="text-sm font-medium">{t("inv.restaurant.blockers")}</p>
          <ul className="mt-1 list-inside list-disc text-sm text-muted-foreground">
            {blockers.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        </Card>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="flex flex-col gap-4">
          <Card className="space-y-4 p-5">
            <h2 className="font-semibold">{t("inv.restaurant.details")}</h2>
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <Label className="text-xs">{t("visa.country.code")} *</Label>
                <Input
                  dir="ltr"
                  className="font-mono uppercase"
                  maxLength={2}
                  placeholder="FR"
                  disabled={!canWrite}
                  value={code}
                  onChange={(e) => touch(setCode)(e.target.value.toUpperCase().replace(/[^A-Z]/g, ""))}
                />
                <p className="mt-1 text-[11px] text-muted-foreground">{t("visa.country.codeHint")}</p>
              </div>
              <div>
                <Label className="text-xs">{t("visa.country.validity")}</Label>
                <Input
                  type="number"
                  min={0}
                  step={1}
                  disabled={!canWrite}
                  value={validityMonths}
                  onChange={(e) => touch(setValidityMonths)(e.target.value)}
                />
                <p className="mt-1 text-[11px] text-muted-foreground">{t("visa.country.validityHint")}</p>
              </div>
              <div>
                <Label className="text-xs">{t("vs.cat.order")}</Label>
                <Input
                  type="number"
                  step={1}
                  disabled={!canWrite}
                  value={sortOrder}
                  onChange={(e) => touch(setSortOrder)(e.target.value)}
                />
              </div>
            </div>
            <LocalizedInput
              disabled={!canWrite}
              label={t("common.name")}
              required
              value={name}
              onChange={touch(setName)}
              placeholder="France"
            />
            <LocalizedInput
              disabled={!canWrite}
              label={t("visa.country.notes")}
              multiline
              rows={5}
              value={notes}
              onChange={touch(setNotes)}
              placeholder={t("visa.country.notesPlaceholder")}
            />
          </Card>

          <Card className="space-y-3 p-5">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className="font-semibold">{t("visa.countries.towns")}</h2>
                <p className="text-xs text-muted-foreground">{t("visa.country.townsHint")}</p>
              </div>
              {canWrite ? (
                <Button
                  size="sm"
                  variant="secondary"
                  className="shrink-0 gap-2"
                  onClick={() => {
                    setTowns((all) => [...all, { name: {}, isActive: true }]);
                    setDirty(true);
                  }}
                >
                  <Plus className="size-4" />
                  {t("visa.country.addTown")}
                </Button>
              ) : null}
            </div>
            {!towns.length ? <p className="text-sm text-muted-foreground">{t("visa.country.noTowns")}</p> : null}
            {towns.map((x, i) => (
              <div key={x.id ?? `new-${i}`} className="flex items-end gap-2 rounded-lg border p-3">
                <div className="flex-1">
                  <LocalizedInput
                    disabled={!canWrite}
                    label={t("visa.country.town", { n: i + 1 })}
                    required
                    value={x.name}
                    onChange={(v) => setTown(i, { name: v })}
                    placeholder="Paris"
                  />
                </div>
                <label className="flex items-center gap-2 pb-2 text-xs">
                  <Switch
                    disabled={!canWrite}
                    checked={x.isActive}
                    onCheckedChange={(v) => setTown(i, { isActive: v })}
                  />
                  {t("vs.cat.active")}
                </label>
                {canWrite ? (
                  <Button
                    variant="ghost"
                    size="icon"
                    title={t("visa.country.removeTown")}
                    aria-label={t("visa.country.removeTown")}
                    onClick={() => {
                      setTowns((all) => all.filter((_, n) => n !== i));
                      setDirty(true);
                    }}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                ) : null}
              </div>
            ))}
          </Card>
        </div>

        <Card className="space-y-3 p-5">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="font-semibold">{t("visa.countries.offers")}</h2>
              <p className="text-xs text-muted-foreground">{t("visa.country.offersHint")}</p>
            </div>
            {canWrite ? (
              <Button
                size="sm"
                variant="secondary"
                className="shrink-0 gap-2"
                onClick={() => {
                  setOffers((all) => [...all, newOffer()]);
                  setDirty(true);
                }}
              >
                <Plus className="size-4" />
                {t("visa.country.addOffer")}
              </Button>
            ) : null}
          </div>
          {!offers.length ? <p className="text-sm text-muted-foreground">{t("visa.country.noOffers")}</p> : null}
          {!typeOptions.length && types ? (
            <p className="text-xs text-amber-700 dark:text-amber-400">
              {t("visa.country.noTypes")}{" "}
              <Link href="/e-visa/types" className="underline underline-offset-2">
                {t("nav.evisa.types")}
              </Link>
            </p>
          ) : null}
          {offers.map((o, i) => (
            <div key={o.id ?? `new-${i}`} className="space-y-3 rounded-lg border p-3">
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <Label className="text-xs">{t("visa.visaType")} *</Label>
                  <OptionSelect
                    disabled={!canWrite}
                    aria-label={t("visa.visaType")}
                    placeholder={t("common.select")}
                    value={o.visaType}
                    onChange={(v) => setOffer(i, { visaType: v })}
                    options={typeOptions.map((x) => ({ value: x.id, label: lz(x.name) }))}
                  />
                </div>
                <label className="flex items-center gap-2 pb-2 text-xs">
                  <Switch
                    disabled={!canWrite}
                    checked={o.isActive}
                    onCheckedChange={(v) => setOffer(i, { isActive: v })}
                  />
                  {t("vs.cat.active")}
                </label>
                {canWrite ? (
                  <Button
                    variant="ghost"
                    size="icon"
                    title={t("visa.country.removeOffer")}
                    aria-label={t("visa.country.removeOffer")}
                    onClick={() => {
                      setOffers((all) => all.filter((_, n) => n !== i));
                      setDirty(true);
                    }}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                ) : null}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <MoneyInput
                  disabled={!canWrite}
                  label={`${t("visa.serviceFee")} *`}
                  value={o.serviceFee}
                  onChange={(v) => setOffer(i, { serviceFee: v })}
                  requireBase
                />
                <MoneyInput
                  disabled={!canWrite}
                  label={t("visa.embassyFee")}
                  value={o.embassyFee}
                  onChange={(v) => setOffer(i, { embassyFee: v })}
                  hint={t("visa.embassyFeeHint")}
                />
                <div>
                  <Label className="text-xs">{t("visa.country.processingDays")} *</Label>
                  <Input
                    type="number"
                    min={0}
                    step={1}
                    disabled={!canWrite}
                    value={o.processingDays}
                    onChange={(e) => setOffer(i, { processingDays: e.target.value })}
                  />
                </div>
                <div>
                  <Label className="text-xs">{t("visa.country.validityDays")}</Label>
                  <Input
                    type="number"
                    min={0}
                    step={1}
                    disabled={!canWrite}
                    value={o.validityDays}
                    onChange={(e) => setOffer(i, { validityDays: e.target.value })}
                  />
                </div>
                <div>
                  <Label className="text-xs">{t("visa.country.entries")}</Label>
                  <OptionSelect
                    disabled={!canWrite}
                    aria-label={t("visa.country.entries")}
                    value={o.entries}
                    onChange={(v) => setOffer(i, { entries: v as VisaEntries })}
                    options={[
                      { value: "SINGLE", label: t("visa.entries.SINGLE") },
                      { value: "MULTIPLE", label: t("visa.entries.MULTIPLE") }
                    ]}
                  />
                </div>
              </div>
              <LocalizedInput
                disabled={!canWrite}
                label={t("visa.country.requiredDocuments")}
                multiline
                rows={4}
                value={o.requiredDocuments}
                onChange={(v) => setOffer(i, { requiredDocuments: v })}
                placeholder={t("visa.country.requiredDocumentsPlaceholder")}
              />
            </div>
          ))}
        </Card>
      </div>
    </AdminLayout>
  );
}
