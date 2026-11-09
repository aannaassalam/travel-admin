import {
  deleteDutyFreeEntry,
  listDutyFree,
  needsAddress,
  POINT_KINDS,
  saveDutyFreeEntry,
  type DutyFreeCategory,
  type DutyFreeListKind,
  type DutyFreePoint,
  type PointKind
} from "@/api/functions/dutyFree.api";
import DeleteButton from "@/components/DeleteButton";
import AssetImage from "@/components/Form/AssetImage";
import ImageUploader from "@/components/Form/ImageUploader";
import LocalizedInput, { type Localized } from "@/components/Form/LocalizedInput";
import MoneyInput, { formToMoney, moneyToForm } from "@/components/Form/MoneyInput";
import { OptionSelect } from "@/components/Form/OptionSelect";
import AdminLayout from "@/components/Layout/AdminLayout";
import Pager, { usePaged } from "@/components/Pager";
import QueryError from "@/components/QueryError";
import { CitySelect, message } from "@/components/Transfers/transfers.lib";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatFC } from "@/lib/functions/format.lib";
import { lz } from "@/lib/functions/localized.lib";
import type { TranslationKey } from "@/lib/i18n/messages";
import { useT } from "@/lib/i18n/useT";
import { useCan } from "@/lib/permissions";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MapPin, Pencil, Plus } from "lucide-react";
import { useRouter } from "next/router";
import { useState } from "react";
import { toast } from "sonner";

/**
 * The lists Duty Free runs on: the categories customers browse (the website
 * shows categories, never shops) and the delivery points an order is brought
 * to. One tab each, edited in a dialog, as the vehicles-for-sale catalogue.
 */

const KINDS: DutyFreeListKind[] = ["categories", "points"];

/** Our office, Airport, Bus terminal… in the panel's language. */
const pointKindLabel =(t: ReturnType<typeof useT>["t"], kind: string) =>
  t(`df.point.kind.${kind}` as TranslationKey);

export default function DutyFreeCataloguePage() {
  const router = useRouter();
  const { t } = useT();
  const asked = router.query.tab as DutyFreeListKind;
  const tab = KINDS.includes(asked) ? asked : "categories";
  return (
    <AdminLayout title={t("nav.dutyFree")} description={t("df.cat.description")}>
      <Tabs
        value={tab}
        onValueChange={(next) =>
          router.replace({ query: { tab: next } }, undefined, { shallow: true })
        }
      >
        <TabsList>
          {KINDS.map((k) => (
            <TabsTrigger key={k} value={k}>
              {t(`df.cat.tab.${k}`)}
            </TabsTrigger>
          ))}
        </TabsList>
        {KINDS.map((k) => (
          <TabsContent key={k} value={k} className="mt-3">
            <ListTab kind={k} />
          </TabsContent>
        ))}
      </Tabs>
    </AdminLayout>
  );
}

type Entry = DutyFreeCategory | DutyFreePoint;

function ListTab({ kind }: { kind: DutyFreeListKind }) {
  const { t, locale } = useT();
  const queryClient = useQueryClient();
  const { can } = useCan();
  const canWrite = can("inventory:write");
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["df-list", kind],
    queryFn: () => listDutyFree(kind),
    refetchOnMount: "always"
  });
  const items = (data?.items ?? []) as Entry[];
  const { rows, pager } = usePaged(items);
  // The dialog: open with the entry it edits, or with none to add one.
  const [editing, setEditing] = useState<{ entry?: Entry } | null>(null);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["df-list"] });
  const isPoints = kind === "points";
  const columns = (isPoints ? 6 : 4) + (canWrite ? 1 : 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm text-muted-foreground">{t(`df.cat.intro.${kind}`)}</p>
        {canWrite ? (
          <Button size="sm" className="ms-auto gap-2" onClick={() => setEditing({})}>
            <Plus className="size-4" />
            {t(`df.cat.add.${kind}`)}
          </Button>
        ) : null}
      </div>

      {isError ? (
        <QueryError error={error} onRetry={() => refetch()} />
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-background">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("common.name")}</TableHead>
                {isPoints ? (
                  <>
                    <TableHead>{t("common.city")}</TableHead>
                    <TableHead className="text-end">{t("df.point.col.fee")}</TableHead>
                    <TableHead className="text-end">{t("df.point.col.time")}</TableHead>
                  </>
                ) : (
                  <TableHead>{t("vs.cat.col.details")}</TableHead>
                )}
                <TableHead className="text-end">{t("vs.cat.order")}</TableHead>
                <TableHead>{t("common.status")}</TableHead>
                {canWrite ? <TableHead className="text-end">{t("common.actions")}</TableHead> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={columns} className="py-10 text-center text-muted-foreground">
                    {t("common.loading")}
                  </TableCell>
                </TableRow>
              ) : !rows.length ? (
                <TableRow>
                  <TableCell colSpan={columns} className="py-10 text-center">
                    <p className="text-sm text-muted-foreground">{t(`df.cat.empty.${kind}`)}</p>
                    {canWrite ? (
                      <Button size="sm" className="mt-3 gap-2" onClick={() => setEditing({})}>
                        <Plus className="size-4" />
                        {t(`df.cat.add.${kind}`)}
                      </Button>
                    ) : null}
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((e) => (
                  <TableRow key={e.id} className={e.isActive ? "" : "opacity-60"}>
                    {isPoints ? (
                      <PointCells point={e as DutyFreePoint} locale={locale} />
                    ) : (
                      <CategoryCells category={e as DutyFreeCategory} />
                    )}
                    <TableCell className="text-end tabular-nums">{e.sortOrder}</TableCell>
                    <TableCell>
                      <Badge variant={e.isActive ? "secondary" : "outline"}>
                        {e.isActive ? t("vs.cat.active") : t("vs.cat.off")}
                      </Badge>
                    </TableCell>
                    {canWrite ? (
                      <TableCell>
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            title={t("common.edit")}
                            aria-label={t("vs.cat.editTitle", { name: lz(e.name) })}
                            onClick={() => setEditing({ entry: e })}
                          >
                            <Pencil className="size-4" />
                          </Button>
                          <DeleteButton
                            permission="inventory:delete"
                            what={t("vs.cat.deleteWhat", { name: lz(e.name) })}
                            consequence={t(`df.cat.deleteConsequence.${kind}`)}
                            onDelete={() => deleteDutyFreeEntry(kind, e.id)}
                            onDeleted={refresh}
                          />
                        </div>
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}
      <Pager {...pager} />

      {editing ? (
        isPoints ? (
          <PointDialog
            point={editing.entry as DutyFreePoint | undefined}
            onClose={() => setEditing(null)}
          />
        ) : (
          <CategoryDialog
            category={editing.entry as DutyFreeCategory | undefined}
            onClose={() => setEditing(null)}
          />
        )
      ) : null}
    </div>
  );
}

function CategoryCells({ category: c }: { category: DutyFreeCategory }) {
  const { t } = useT();
  return (
    <>
      <TableCell>
        <div className="flex items-center gap-3">
          <AssetImage
            src={c.image}
            className="size-9 shrink-0"
            title={c.image ? undefined : t("inv.list.noImage")}
          />
          <div className="min-w-0">
            <p className="font-medium">{lz(c.name)}</p>
            <p className="font-mono text-xs text-muted-foreground" dir="ltr">
              {c.slug}
            </p>
          </div>
        </div>
      </TableCell>
      <TableCell className="text-sm text-muted-foreground">
        {c.shopCount !== undefined ? t("df.cat.counts", { shops: c.shopCount }) : "—"}
      </TableCell>
    </>
  );
}

function PointCells({ point: p, locale }: { point: DutyFreePoint; locale: string }) {
  const { t } = useT();
  const fee = p.fee?.CDF ?? 0;
  return (
    <>
      <TableCell>
        <p className="font-medium">{lz(p.name)}</p>
        <p className="text-xs text-muted-foreground">
          {pointKindLabel(t, p.kind)} ·{" "}
          {needsAddress(p.kind) ? t("df.point.asksAddress") : p.address || t("df.point.noAddress")}
        </p>
      </TableCell>
      <TableCell>{p.city || "—"}</TableCell>
      <TableCell className="text-end tabular-nums">
        {fee ? formatFC(fee, locale) : t("df.point.free")}
      </TableCell>
      <TableCell className="text-end tabular-nums text-muted-foreground">
        {p.etaMinutes ? t("df.point.minutes", { n: p.etaMinutes }) : "—"}
      </TableCell>
    </>
  );
}

/** Save and close, or say why not: the two dialogs' shared ending. The list reloads by itself (MutationCache). */
function useSaveEntry(kind: DutyFreeListKind, id: string | undefined, onDone: () => void) {
  const { t } = useT();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) => saveDutyFreeEntry(kind, id, body),
    meta: { showToast: false },
    onSuccess: () => {
      toast.success(id ? t("vs.saved") : t("vs.cat.added"));
      onDone();
    },
    onError: (e) => toast.error(message(e, t("inv.restaurant.saveFailed")))
  });
}

function DialogShell({
  title,
  intro,
  busy,
  canSave,
  onSave,
  onClose,
  children
}: {
  title: string;
  intro: string;
  busy: boolean;
  canSave: boolean;
  onSave: () => void;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const { t } = useT();
  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{intro}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">{children}</div>
        <DialogFooter>
          <Button variant="ghost" disabled={busy} onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button disabled={busy || !canSave} onClick={onSave}>
            {busy ? t("inv.restaurant.saving") : t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CategoryDialog({ category, onClose }: { category?: DutyFreeCategory; onClose: () => void }) {
  const { t } = useT();
  const [name, setName] = useState<Localized>(category?.name ?? {});
  const [image, setImage] = useState<string[]>(category?.image ? [category.image] : []);
  const [sortOrder, setSortOrder] = useState(String(category?.sortOrder ?? 0));
  const [isActive, setIsActive] = useState(category?.isActive ?? true);
  const { mutate: save, isPending } = useSaveEntry("categories", category?.id, onClose);

  return (
    <DialogShell
      title={category ? t("vs.cat.editTitle", { name: lz(category.name) }) : t("df.cat.add.categories")}
      intro={t("df.cat.intro.categories")}
      busy={isPending}
      canSave={Boolean(name.fr?.trim())}
      onClose={onClose}
      onSave={() =>
        save({
          name,
          // "" takes the cover away.
          image: image[0] ?? "",
          sortOrder: Number(sortOrder) || 0,
          isActive
        })
      }
    >
      <div className="sm:col-span-2">
        <LocalizedInput
          label={t("common.name")}
          required
          value={name}
          onChange={setName}
          placeholder="Parfums"
        />
      </div>
      <div className="sm:col-span-2">
        <ImageUploader
          label={t("df.cat.cover")}
          folder="duty-free"
          single
          value={image}
          onChange={setImage}
        />
        <p className="mt-1 text-[11px] text-muted-foreground">{t("df.cat.coverHint")}</p>
      </div>
      <div>
        <Label className="text-xs">{t("vs.cat.order")}</Label>
        <Input type="number" step={1} value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} />
      </div>
      <label className="flex items-center gap-3 self-end pb-2 text-sm">
        <Switch checked={isActive} onCheckedChange={setIsActive} />
        {t("df.cat.activeSwitch")}
      </label>
    </DialogShell>
  );
}

function PointDialog({ point, onClose }: { point?: DutyFreePoint; onClose: () => void }) {
  const { t } = useT();
  const [name, setName] = useState<Localized>(point?.name ?? {});
  const [city, setCity] = useState(point?.city ?? "");
  const [kind, setKind] = useState<PointKind>(point?.kind ?? "AIRPORT");
  const [address, setAddress] = useState(point?.address ?? "");
  const [fee, setFee] = useState<Record<string, string>>(moneyToForm(point?.fee));
  const [etaMinutes, setEtaMinutes] = useState(String(point?.etaMinutes ?? 60));
  const [sortOrder, setSortOrder] = useState(String(point?.sortOrder ?? 0));
  const [isActive, setIsActive] = useState(point?.isActive ?? true);
  const { mutate: save, isPending } = useSaveEntry("points", point?.id, onClose);
  const isOffice = !needsAddress(kind);
  const isOther = kind === "OTHER";

  return (
    <DialogShell
      title={point ? t("vs.cat.editTitle", { name: lz(point.name) }) : t("df.cat.add.points")}
      intro={t("df.cat.intro.points")}
      busy={isPending}
      // A fee is always typed, 0 for free: a blank box is not a price.
      canSave={Boolean(name.fr?.trim()) && (fee.CDF ?? "").trim() !== ""}
      onClose={onClose}
      onSave={() =>
        save({
          name,
          city,
          kind,
          // Only the office's own address is shown; the others ask the customer.
          address: isOffice ? address.trim() : "",
          fee: formToMoney(fee),
          etaMinutes: Number(etaMinutes) || 0,
          sortOrder: Number(sortOrder) || 0,
          isActive
        })
      }
    >
      <div className="sm:col-span-2">
        <Label className="text-xs">{t("df.point.kind")} *</Label>
        <OptionSelect
          aria-label={t("df.point.kind")}
          value={kind}
          onChange={(v) => setKind(v as PointKind)}
          options={POINT_KINDS.map((k) => ({
            value: k,
            label: (
              <>
                <span>{pointKindLabel(t, k)}</span>
                <span className="text-xs text-muted-foreground">
                  · {needsAddress(k) ? t("df.point.asksAddress") : t("df.point.noAddress")}
                </span>
              </>
            )
          }))}
        />
        {/* What the customer will be asked, said for the kind chosen. */}
        <p className="mt-2 flex gap-2 rounded-md bg-muted/60 px-3 py-2 text-xs">
          <MapPin className="mt-px size-3.5 shrink-0 text-muted-foreground" />
          {t(`df.point.explain.${kind}` as TranslationKey)}
        </p>
      </div>
      <div className="sm:col-span-2">
        <LocalizedInput
          label={t("common.name")}
          required
          value={name}
          onChange={setName}
          placeholder={isOffice ? pointKindLabel(t, "OFFICE") : t("df.point.namePlaceholder")}
        />
      </div>
      {/* Points are per town: a new town gets its own office, airport… */}
      <CitySelect value={city} onChange={setCity} />
      <div>
        <Label className="text-xs">{t("df.point.eta")}</Label>
        <Input type="number" min={0} step={5} value={etaMinutes} onChange={(e) => setEtaMinutes(e.target.value)} />
      </div>
      {isOffice ? (
        <div className="sm:col-span-2">
          <Label className="text-xs">{t("df.point.officeAddress")}</Label>
          <Input value={address} onChange={(e) => setAddress(e.target.value)} />
        </div>
      ) : null}
      <div className="sm:col-span-2">
        <MoneyInput
          label={isOther ? t("df.point.otherFee") : t("df.point.fee")}
          hint={isOther ? t("df.point.otherFeeHint") : t("df.point.feeHint")}
          value={fee}
          onChange={setFee}
          requireBase
        />
      </div>
      <div>
        <Label className="text-xs">{t("vs.cat.order")}</Label>
        <Input type="number" step={1} value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} />
      </div>
      <label className="flex items-center gap-3 self-end pb-2 text-sm">
        <Switch checked={isActive} onCheckedChange={setIsActive} />
        {t("df.point.activeSwitch")}
      </label>
    </DialogShell>
  );
}
