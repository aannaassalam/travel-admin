import {
  createProduct,
  deleteProduct,
  setProductStatus,
  updateProduct,
  type DutyFreeProduct,
  type DutyFreeStatusAction
} from "@/api/functions/dutyFree.api";
import DeleteButton from "@/components/DeleteButton";
import AssetImage from "@/components/Form/AssetImage";
import ImageUploader from "@/components/Form/ImageUploader";
import LocalizedInput, { type Localized } from "@/components/Form/LocalizedInput";
import MoneyInput, { formToMoney, moneyToForm } from "@/components/Form/MoneyInput";
import PromotionFields, {
  onePrice,
  PromoNote,
  promotionBody,
  type PromotionDraft
} from "@/components/Form/PromotionFields";
import VideoField from "@/components/Form/VideoField";
import Pager, { PAGE_SIZE, usePaged } from "@/components/Pager";
import { message } from "@/components/Transfers/transfers.lib";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { formatMoney } from "@/lib/functions/format.lib";
import { label, LISTING_STATUS } from "@/lib/functions/labels.lib";
import { lz } from "@/lib/functions/localized.lib";
import { useT } from "@/lib/i18n/useT";
import { useCan } from "@/lib/permissions";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AxiosError } from "axios";
import { Film, Pencil, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

/**
 * A shop's products, as the restaurant's menu editor: one row to add, the list
 * under it with its switches, a product edited in place. Unlike a dish, a
 * product has several photos and a short video, both saved the moment they are
 * uploaded (there is no Save button down here), and no section.
 */

/** A product as its boxes hold it: the add row and the edit form alike. */
interface ProductDraft {
  name: Localized;
  description: Localized;
  sell: Record<string, string>;
  cost: Record<string, string>;
  /** Only in the edit form: a promotion is put on a product once it exists. */
  promo?: PromotionDraft;
}

const emptyDraft = () => ({
  name: {} as Localized,
  description: {} as Localized,
  sell: moneyToForm(),
  cost: moneyToForm(),
  images: [] as string[],
  videoUrl: ""
});

/** Name, prices and description on a three-column grid; `action` ends the first row. */
function ProductFields({
  draft,
  onChange,
  action
}: {
  draft: ProductDraft;
  onChange: (next: ProductDraft) => void;
  action: React.ReactNode;
}) {
  const { t } = useT();
  return (
    <>
      <div className="lg:col-span-2">
        <LocalizedInput
          label={t("common.name")}
          required
          value={draft.name}
          onChange={(name) => onChange({ ...draft, name })}
          placeholder={t("df.product.namePlaceholder")}
        />
      </div>
      {action}
      <MoneyInput
        label={t("inv.restaurant.sellPrice")}
        value={draft.sell}
        onChange={(v) => onChange({ ...draft, sell: v })}
        requireBase
      />
      <div className="lg:col-span-2">
        <MoneyInput
          label={t("inv.restaurant.costPrice")}
          value={draft.cost}
          onChange={(v) => onChange({ ...draft, cost: v })}
          requireBase
          hint={t("inv.restaurant.costHint")}
        />
      </div>
      <div className="lg:col-span-3">
        <LocalizedInput
          label={t("inv.restaurant.dishDescription")}
          multiline
          rows={2}
          value={draft.description}
          onChange={(description) => onChange({ ...draft, description })}
        />
      </div>
    </>
  );
}

export default function ProductEditor({
  shopId,
  products,
  onVideoBusy
}: {
  shopId: string;
  products: DutyFreeProduct[];
  /** A video on its way somewhere in here: the page must not be left. */
  onVideoBusy: (busy: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const { t, locale } = useT();
  // Add, publish, stock and photos are inventory:write. Deleting is
  // inventory:delete, which the bin checks for itself.
  const { can } = useCan();
  const canWrite = can("inventory:write");
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["df-shop", shopId] });
  const onError = (e: unknown) => toast.error(message(e, t("inv.restaurant.saveFailed")));

  // Uploads in flight across the add row and every product's video.
  const [uploads, setUploads] = useState(0);
  const busy = (b: boolean) => setUploads((n) => Math.max(0, n + (b ? 1 : -1)));
  useEffect(() => onVideoBusy(uploads > 0), [uploads, onVideoBusy]);

  // Every product, one archived before too (no Archive now, 2026-11-09): it
  // reads as inactive, and publishing brings it back.
  const page = usePaged(products);

  const [draft, setDraft] = useState(emptyDraft);
  const { mutate: add, isPending: adding } = useMutation({
    mutationFn: () =>
      createProduct(shopId, {
        name: draft.name,
        description: draft.description,
        sellPrice: formToMoney(draft.sell),
        costPrice: formToMoney(draft.cost),
        images: draft.images,
        videoUrl: draft.videoUrl,
        sortOrder: products.length
      }),
    meta: { showToast: false },
    onSuccess: () => {
      setDraft(emptyDraft());
      toast.success(t("df.product.added"));
    },
    onError
  });

  // Status has its own calls: the server never takes one from an edit.
  const { mutate: act, isPending: acting } = useMutation({
    mutationFn: ({ id, action }: { id: string; action: DutyFreeStatusAction }) =>
      setProductStatus(shopId, id, action),
    meta: { showToast: false },
    onSuccess: (_r, { action }) =>
      toast.success(t(action === "publish" ? "df.product.published" : "df.product.off")),
    onError
  });

  // Stock, photos and the video: saved as they change.
  const { mutate: patch, isPending: patching } = useMutation({
    mutationFn: ({ id, b }: { id: string; b: Record<string, unknown> }) =>
      updateProduct(shopId, id, b),
    meta: { showToast: false },
    onError
  });

  // The product being edited in place, as it was read: its version guards the save.
  const [editing, setEditing] = useState<{ item: DutyFreeProduct; draft: ProductDraft } | null>(
    null
  );
  const edit = (p: DutyFreeProduct) =>
    setEditing({
      item: p,
      draft: {
        name: p.name ?? {},
        description: p.description ?? {},
        sell: moneyToForm(p.sellPrice),
        cost: moneyToForm(p.costPrice),
        promo: p.promoCompareAtPrice?.CDF
          ? {
              old: { promoCompareAtPrice: moneyToForm(p.promoCompareAtPrice) },
              ends: p.promoEndsAt?.slice(0, 10) ?? ""
            }
          : { old: {}, ends: "" }
      }
    });
  const { mutate: save, isPending: saving } = useMutation({
    mutationFn: ({ item, draft: d }: { item: DutyFreeProduct; draft: ProductDraft }) =>
      updateProduct(shopId, item.id, {
        name: d.name,
        description: d.description,
        // A blank box ({}) leaves that price as it was.
        sellPrice: formToMoney(d.sell),
        costPrice: formToMoney(d.cost),
        ...(d.promo ? promotionBody(d.promo) : {}),
        version: item.version
      }),
    meta: { showToast: false },
    onSuccess: () => {
      setEditing(null);
      toast.success(t("df.product.saved"));
    },
    onError: async (e, { item }) => {
      if ((e as AxiosError).response?.status !== 409) return onError(e);
      // Changed meanwhile (its stock switch, say): the new version under what
      // was typed, so saving again is not refused again.
      await refresh();
      const fresh = queryClient
        .getQueryData<{ products?: DutyFreeProduct[] }>(["df-shop", shopId])
        ?.products?.find((x) => x.id === item.id);
      setEditing((ed) => (fresh && ed?.item.id === item.id ? { ...ed, item: fresh } : ed));
      toast.error(t("df.product.conflict"));
    }
  });

  const remove =(p: DutyFreeProduct) => (
    <DeleteButton
      permission="inventory:delete"
      what={t("df.product.what", { name: lz(p.name) })}
      consequence={t("inv.restaurant.dishConsequence")}
      onDelete={(confirmed) => deleteProduct(shopId, p.id, confirmed)}
      onDeleted={refresh}
    />
  );

  return (
    <Card className="mt-4 space-y-4 p-5">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">{t("df.products.title")}</h2>
        <span className="text-sm text-muted-foreground">
          {t("inv.restaurant.menuCount", {
            published: products.filter((p) => p.status === "PUBLISHED").length,
            total: products.length
          })}
        </span>
      </div>

      {/* --- add a product --- */}
      {canWrite ? (
        <div className="grid items-end gap-3 rounded-lg border p-3 lg:grid-cols-[1fr_1fr_auto]">
          <p className="text-sm font-medium lg:col-span-3">{t("df.product.new")}</p>
          <ProductFields
            draft={draft}
            onChange={(next) => setDraft((d) => ({ ...d, ...next }))}
            action={
              <Button
                className="gap-2"
                disabled={adding || uploads > 0 || !draft.name.fr?.trim() || !draft.sell.CDF || !draft.cost.CDF}
                onClick={() => add()}
              >
                <Plus className="size-4" />
                {t("inv.restaurant.add")}
              </Button>
            }
          />
          <div className="grid gap-4 lg:col-span-3 lg:grid-cols-2">
            <ImageUploader
              label={t("df.product.photos")}
              folder="duty-free"
              value={draft.images}
              onChange={(v) => setDraft((d) => ({ ...d, images: v }))}
            />
            <VideoField
              onBusy={busy}
              saving={adding}
              value={draft.videoUrl}
              onChange={(v) => setDraft((d) => ({ ...d, videoUrl: v }))}
            />
          </div>
        </div>
      ) : null}

      {/* --- the products --- */}
      {!products.length ? (
        <p className="text-sm text-muted-foreground">{t("df.products.none")}</p>
      ) : (
        <div className="divide-y rounded-lg border">
          {page.rows.map((p) => (
            <div key={p.id} className="flex flex-wrap items-center gap-3 p-3">
              {/* The first photo: a list shows at a glance which still have none. */}
              <AssetImage
                src={p.images?.[0]}
                className="size-9 shrink-0"
                title={p.images?.length ? undefined : t("inv.restaurant.noPhoto")}
              />
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 truncate font-medium">
                  {lz(p.name)}
                  {p.videoUrl ? <Film className="size-3.5 shrink-0 text-muted-foreground" /> : null}
                </p>
                {typeof p.sellPrice?.USD === "number" ? (
                  <p className="text-xs text-amber-700 tabular-nums dark:text-amber-400">
                    {t("inv.restaurant.notConverted", {
                      sell: formatMoney(p.sellPrice.USD, "USD"),
                      cost: formatMoney(p.costPrice?.USD ?? 0, "USD")
                    })}
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground tabular-nums">
                    {t("inv.restaurant.prices", {
                      sell: formatMoney(p.sellPrice?.CDF ?? 0, "CDF", locale),
                      cost: formatMoney(p.costPrice?.CDF ?? 0, "CDF", locale),
                      margin: formatMoney(
                        p.marginBase ?? (p.sellPrice?.CDF ?? 0) - (p.costPrice?.CDF ?? 0),
                        "CDF",
                        locale
                      )
                    })}
                  </p>
                )}
                <PromoNote item={p} locale={locale} />
              </div>

              {/* Apart from the status on purpose: "sold out today" and "off the
                  website" are different decisions. */}
              <label className="flex items-center gap-2 text-sm" title={t("df.product.inStockHint")}>
                <Switch
                  checked={p.isAvailable}
                  disabled={!canWrite || patching}
                  onCheckedChange={(on) => patch({ id: p.id, b: { isAvailable: on } })}
                />
                {t("df.product.inStock")}
              </label>

              {canWrite ? (
                <>
                  <Button
                    variant="ghost"
                    size="icon"
                    title={t("df.product.edit")}
                    aria-label={t("df.product.editAria", { name: lz(p.name) })}
                    onClick={() => edit(p)}
                  >
                    <Pencil className="size-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant={p.status === "PUBLISHED" ? "outline" : "secondary"}
                    disabled={acting}
                    onClick={() =>
                      act({ id: p.id, action: p.status === "PUBLISHED" ? "deactivate" : "publish" })
                    }
                  >
                    {p.status === "PUBLISHED" ? t("inv.restaurant.deactivate") : t("common.publish")}
                  </Button>
                </>
              ) : (
                <Badge variant="secondary">{label(LISTING_STATUS, p.status)}</Badge>
              )}
              {remove(p)}

              {editing?.item.id === p.id ? (
                <div className="grid w-full items-end gap-3 rounded-lg border bg-muted/30 p-3 lg:grid-cols-[1fr_1fr_auto]">
                  <ProductFields
                    draft={editing.draft}
                    onChange={(next) => setEditing((ed) => ed && { ...ed, draft: next })}
                    action={
                      <div className="flex gap-2">
                        <Button
                          disabled={!editing.draft.name.fr?.trim() || saving}
                          onClick={() => save(editing)}
                        >
                          {saving ? t("inv.restaurant.saving") : t("common.save")}
                        </Button>
                        <Button variant="ghost" disabled={saving} onClick={() => setEditing(null)}>
                          {t("common.cancel")}
                        </Button>
                      </div>
                    }
                  />
                  {editing.draft.promo ? (
                    <PromotionFields
                      className="mt-1 lg:col-span-3"
                      value={editing.draft.promo}
                      rows={onePrice(Number(editing.draft.sell.CDF) || 0, t)}
                      onChange={(change) =>
                        setEditing(
                          (ed) =>
                            ed && { ...ed, draft: { ...ed.draft, promo: { ...ed.draft.promo!, ...change } } }
                        )
                      }
                    />
                  ) : null}
                </div>
              ) : null}

              {/* Behind a disclosure: twenty open uploaders is a page nobody can
                  scan. Saved the moment they change — nothing to forget. */}
              <details className="w-full">
                <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
                  {t(p.videoUrl ? "df.product.mediaWithVideo" : "df.product.media", {
                    n: p.images?.length ?? 0
                  })}
                </summary>
                <div className="grid gap-4 pt-3 lg:grid-cols-2">
                  <ImageUploader
                    label={t("df.product.photos")}
                    folder="duty-free"
                    value={p.images ?? []}
                    onChange={(v) => patch({ id: p.id, b: { images: v } })}
                  />
                  <VideoField
                    onBusy={busy}
                    saving={patching}
                    disabled={!canWrite}
                    value={p.videoUrl ?? ""}
                    // "" is what removes it on the server.
                    onChange={(v) => patch({ id: p.id, b: { videoUrl: v } })}
                  />
                </div>
              </details>
            </div>
          ))}
        </div>
      )}
      {products.length > PAGE_SIZE ? (
        <Pager {...page.pager} noun={t("df.product.one")} plural={t("df.product.other")} />
      ) : null}
    </Card>
  );
}
