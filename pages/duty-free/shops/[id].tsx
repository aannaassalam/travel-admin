import { listLocations, refId } from "@/api/functions/admin.api";
import {
  deleteShop,
  getShop,
  listDutyFree,
  saveShop,
  setShopStatus,
  type DutyFreeStatusAction
} from "@/api/functions/dutyFree.api";
import DeleteButton from "@/components/DeleteButton";
import ProductEditor from "@/components/dutyFree/ProductEditor";
import ImageUploader from "@/components/Form/ImageUploader";
import LocalizedInput, { type Localized } from "@/components/Form/LocalizedInput";
import MoneyInput, { formToMoney, moneyToForm } from "@/components/Form/MoneyInput";
import { OptionSelect } from "@/components/Form/OptionSelect";
import AdminLayout from "@/components/Layout/AdminLayout";
import QueryError from "@/components/QueryError";
import { message } from "@/components/Transfers/transfers.lib";
import { STATUS_DONE, StatusActions, StatusBadge } from "@/components/VehicleSales/shared";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLeaveGuard, useUnsaved } from "@/hooks/useUnsaved";
import { lz, toLocalized } from "@/lib/functions/localized.lib";
import { useT } from "@/lib/i18n/useT";
import { useCan } from "@/lib/permissions";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import { toast } from "sonner";

/**
 * A Duty Free shop and its products on one screen, as the restaurant editor:
 * details on top, the products under them once the shop exists.
 */
export default function ShopFormPage() {
  const { query } = useRouter();
  // A fresh form for each record, as the restaurant form.
  return <ShopForm key={String(query.id ?? "")} />;
}

function ShopForm() {
  const router = useRouter();
  const id = router.query.id as string;
  const isNew = !id || id === "new";
  const { t } = useT();
  const { dirty, setDirty, isDirty, mark } = useUnsaved();
  const { can } = useCan();
  const canWrite = can("inventory:write");

  const [name, setName] = useState<Localized>({});
  const [description, setDescription] = useState<Localized>({});
  const [images, setImages] = useState<string[]>([]);
  // Charged once per shop in an order, whatever the products (the delivery fee is apart).
  const [processingFee, setProcessingFee] = useState<Record<string, string>>({});
  const [form, setForm] = useState({ category: "", city: "", address: "", phone: "" });
  // A product's video on its way: the page waits for it (see VideoField's onBusy).
  const [videoBusy, setVideoBusy] = useState(false);

  const { data, isError, error, isFetching, isFetchedAfterMount, refetch } = useQuery({
    queryKey: ["df-shop", id],
    queryFn: () => getShop(id),
    enabled: !isNew,
    // A status changed on another screen must not come back from the cache.
    refetchOnMount: "always"
  });
  const { data: locations } = useQuery({
    queryKey: ["locations"],
    queryFn: listLocations,
    staleTime: 5 * 60 * 1000
  });
  const { data: categories } = useQuery({
    queryKey: ["df-list", "categories"],
    queryFn: () => listDutyFree("categories"),
    staleTime: 60 * 1000
  });

  // Opened once THIS visit has read the record (see the restaurant form).
  const [opened, setOpened] = useState(false);
  if (!opened && data && isFetchedAfterMount && !isError) setOpened(true);

  const shop = data?.shop;
  useEffect(() => {
    // Typed and not yet saved: the form is ahead of the server, not behind it.
    if (!shop || isDirty()) return;
    setName(toLocalized(shop.name));
    setDescription(toLocalized(shop.description));
    setImages(shop.images ?? []);
    setProcessingFee(moneyToForm(shop.processingFee));
    setForm({
      category: refId(shop.category),
      city: shop.city ?? "",
      address: shop.address ?? "",
      phone: shop.phone ?? ""
    });
  }, [shop, isDirty]);

  const letGo = useLeaveGuard({ dirty, uploading: videoBusy });
  const set = (k: keyof typeof form, v: string) => {
    setForm((f) => ({ ...f, [k]: v }));
    setDirty(true);
  };
  const onError = (e: unknown) => toast.error(message(e, t("inv.restaurant.saveFailed")));

  const { mutate: save, isPending } = useMutation({
    mutationFn: async () => {
      const unchanged = mark();
      const saved = await saveShop(isNew ? undefined : id, {
        name,
        description,
        category: form.category,
        city: form.city,
        address: form.address.trim(),
        phone: form.phone.trim(),
        images,
        processingFee: formToMoney(processingFee)
      });
      // Asked the moment the answer is back: was anything typed meanwhile?
      return { saved, clean: unchanged() };
    },
    meta: { showToast: false },
    onSuccess: ({ saved, clean }) => {
      // Still dirty if typing went on while this was in flight: that text was not sent.
      if (clean) setDirty(false);
      toast.success(
        isNew
          ? t("df.shop.created")
          : clean
            ? t("inv.restaurant.saved")
            : t("inv.restaurant.savedPartial")
      );
      if (isNew && saved?.id) {
        letGo();
        router.replace(`/duty-free/shops/${saved.id}`);
      }
    },
    onError
  });

  const { mutate: act, isPending: acting } = useMutation({
    mutationFn: (action: DutyFreeStatusAction) => setShopStatus(id, action),
    meta: { showToast: false },
    onSuccess: (_r, action) => toast.success(t(STATUS_DONE[action], { name: lz(name) })),
    onError
  });

  if (isNew && !canWrite) {
    return (
      <AdminLayout title={t("df.shops.new")}>
        <p className="text-sm text-muted-foreground">{t("inv.restaurant.noWrite")}</p>
      </AdminLayout>
    );
  }
  // Not an empty, editable form while the record is on its way — a save from
  // it would wipe fields that simply had not arrived.
  if (!isNew && !opened) {
    return (
      <AdminLayout title={t("df.shop.title")}>
        {isError && !isFetching ? (
          <QueryError error={error} onRetry={() => refetch()} />
        ) : (
          <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
        )}
      </AdminLayout>
    );
  }

  const places = (locations?.items ?? []).filter((l) => l.isActive);
  // Switched-off categories are not offered, except the one already chosen.
  const categoryOptions = (categories?.items ?? []).filter(
    (c) => c.isActive || c.id === form.category
  );
  const blockers = shop?.publishBlockers ?? [];

  return (
    <AdminLayout
      title={isNew ? t("df.shops.new") : lz(name) || t("df.shop.title")}
      description={t("df.shop.pageDescription")}
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <Link href="/duty-free/shops">
          <Button variant="ghost" size="sm" className="gap-2">
            <ArrowLeft className="size-4 rtl:-scale-x-100" />
            {t("nav.dutyFree.shops")}
          </Button>
        </Link>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {/* In words: a disabled button cannot show a tooltip. */}
          {canWrite && dirty && !isNew ? (
            <span className="text-xs text-amber-600 dark:text-amber-400">
              {t("inv.restaurant.unsaved")}
            </span>
          ) : null}
          {shop ? <StatusBadge value={shop.status} /> : null}
          {canWrite ? (
            <Button
              disabled={isPending || videoBusy || !name.fr?.trim() || !form.city || !form.category}
              onClick={() => save()}
            >
              {isPending ? t("inv.restaurant.saving") : t("common.save")}
            </Button>
          ) : null}
          {canWrite && shop ? (
            <StatusActions
              status={shop.status}
              name={lz(name)}
              dirty={dirty}
              blockers={blockers}
              busy={acting}
              onAction={act}
            />
          ) : null}
          {shop ? (
            <DeleteButton
              permission="inventory:delete"
              label={t("inv.restaurant.delete")}
              className="h-9"
              what={t("df.shop.deleteWhat", { name: lz(name) })}
              consequence={t("df.shop.deleteConsequence")}
              onDelete={(confirmed) => deleteShop(id, confirmed)}
              onDeleted={() => {
                // Nothing typed here is left to save.
                letGo();
                router.replace("/duty-free/shops");
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
        <Card className="space-y-4 p-5">
          <h2 className="font-semibold">{t("inv.restaurant.details")}</h2>
          <LocalizedInput
            disabled={!canWrite}
            label={t("common.name")}
            required
            value={name}
            onChange={(v) => { setName(v); setDirty(true); }}
          />
          <LocalizedInput
            disabled={!canWrite}
            label={t("inv.restaurant.descriptionLabel")}
            multiline
            value={description}
            onChange={(v) => { setDescription(v); setDirty(true); }}
          />
          <div>
            <div className="flex items-center justify-between gap-2">
              <Label className="text-xs">{t("df.shop.category")} *</Label>
              <Link
                href="/duty-free/catalogue?tab=categories"
                className="text-xs text-muted-foreground underline underline-offset-2"
              >
                {t("df.shop.editCategories")}
              </Link>
            </div>
            <OptionSelect
              disabled={!canWrite}
              aria-label={t("df.shop.category")}
              value={form.category}
              onChange={(v) => set("category", v)}
              placeholder={t("df.shop.chooseCategory")}
              options={categoryOptions.map((c) => ({
                value: c.id,
                label: c.isActive ? lz(c.name) : `${lz(c.name)} (${t("vs.cat.off")})`
              }))}
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              {categories && !categoryOptions.length ? t("df.shop.noCategories") : t("df.shop.categoryHint")}
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label className="text-xs">{t("common.city")} *</Label>
              {/* From the serviced locations, never typed: the checkout's points follow it. */}
              <OptionSelect
                disabled={!canWrite}
                aria-label={t("common.city")}
                value={form.city}
                onChange={(v) => set("city", v)}
                options={[
                  { value: "", label: t("inv.listing.selectLocation") },
                  ...places.map((l) => ({ value: l.name, label: l.name })),
                  // One saved before its location was switched off stays chosen.
                  ...(form.city && !places.some((l) => l.name === form.city)
                    ? [{ value: form.city, label: form.city }]
                    : [])
                ]}
              />
              {form.city && locations && !places.some((l) => l.name === form.city) ? (
                <p className="mt-1 text-xs text-amber-600">
                  {t("inv.listing.notLive", { city: form.city })}
                </p>
              ) : null}
            </div>
            <div>
              <Label className="text-xs">{t("common.phone")}</Label>
              <Input
                disabled={!canWrite}
                dir="ltr"
                className="text-start"
                value={form.phone}
                onChange={(e) => set("phone", e.target.value)}
              />
            </div>
          </div>
          <div>
            <Label className="text-xs">{t("inv.restaurant.address")}</Label>
            <Input disabled={!canWrite} value={form.address} onChange={(e) => set("address", e.target.value)} />
            <p className="mt-1 text-[11px] text-muted-foreground">{t("df.shop.addressHint")}</p>
          </div>
        </Card>

        <Card className="space-y-4 p-5">
          <ImageUploader
            label={t("df.shop.photos")}
            folder="duty-free"
            value={images}
            onChange={(v) => { setImages(v); setDirty(true); }}
          />
          <MoneyInput
            disabled={!canWrite}
            label={t("inv.processingFee")}
            hint={t("df.shop.feeHint")}
            value={processingFee}
            onChange={(v) => { setProcessingFee(v); setDirty(true); }}
          />
        </Card>
      </div>

      {/* Products need a saved shop to hang off, so they appear once one exists. */}
      {!isNew ? (
        <ProductEditor shopId={id} products={data?.products ?? []} onVideoBusy={setVideoBusy} />
      ) : null}
    </AdminLayout>
  );
}
