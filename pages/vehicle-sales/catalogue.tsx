import {
  addStarterCatalogue,
  deleteCatalogueEntry,
  listCatalogue,
  saveCatalogueEntry,
  type CatalogueKind,
  type SpecValueType,
  type VehicleSpec
} from "@/api/functions/admin.api";
import DeleteButton from "@/components/DeleteButton";
import LocalizedInput, { type Localized } from "@/components/Form/LocalizedInput";
import { OptionSelect } from "@/components/Form/OptionSelect";
import AdminLayout from "@/components/Layout/AdminLayout";
import Pager, { usePaged } from "@/components/Pager";
import QueryError from "@/components/QueryError";
import { message } from "@/components/Transfers/transfers.lib";
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
import { lz } from "@/lib/functions/localized.lib";
import type { TranslationKey } from "@/lib/i18n/messages";
import { useT } from "@/lib/i18n/useT";
import { useCan } from "@/lib/permissions";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Sparkles, Trash2 } from "lucide-react";
import { useRouter } from "next/router";
import { useState } from "react";
import { toast } from "sonner";

/**
 * The lists every vehicle for sale is described with: types of vehicles,
 * specifications (gearbox, fuel, engine size…) and accessories. One tab each,
 * edited in a dialog. An empty catalogue offers the common list in one click.
 */

const KINDS: CatalogueKind[] = ["types", "specs", "accessories"];

const TAB: Record<CatalogueKind, TranslationKey> = {
  types: "vs.cat.tab.types",
  specs: "vs.cat.tab.specs",
  accessories: "vs.cat.tab.accessories"
};

const VALUE_TYPE: Record<SpecValueType, TranslationKey> = {
  CHOICE: "vs.cat.valueType.CHOICE",
  NUMBER: "vs.cat.valueType.NUMBER",
  TEXT: "vs.cat.valueType.TEXT"
};

/** A key from a name, as the website's filters carry it: "Boîte auto" → "boite-auto". */
const slugify = (s = "") =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

/** Any of the three, as far as this screen cares. */
interface Entry {
  id: string;
  name: Localized;
  sortOrder: number;
  isActive: boolean;
  vehicleCount?: number;
  slug?: string;
  key?: string;
  group?: Localized;
  valueType?: SpecValueType;
  unit?: string;
  choices?: VehicleSpec["choices"];
  filterable?: boolean;
  onCard?: boolean;
}

export default function VehicleCataloguePage() {
  const router = useRouter();
  const { t } = useT();
  const asked = router.query.tab as CatalogueKind;
  const tab = KINDS.includes(asked) ? asked : "types";
  return (
    <AdminLayout title={t("nav.vehicleSales.catalogue")} description={t("vs.cat.description")}>
      <Tabs
        value={tab}
        onValueChange={(next) =>
          router.replace({ query: { tab: next } }, undefined, { shallow: true })
        }
      >
        <TabsList>
          {KINDS.map((k) => (
            <TabsTrigger key={k} value={k}>
              {t(TAB[k])}
            </TabsTrigger>
          ))}
        </TabsList>
        {KINDS.map((k) => (
          <TabsContent key={k} value={k} className="mt-3">
            <CatalogueTab kind={k} />
          </TabsContent>
        ))}
      </Tabs>
    </AdminLayout>
  );
}

function CatalogueTab({ kind }: { kind: CatalogueKind }) {
  const { t } = useT();
  const queryClient = useQueryClient();
  const { can } = useCan();
  const canWrite = can("inventory:write");
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["vs-catalogue", kind],
    queryFn: () => listCatalogue(kind),
    refetchOnMount: "always"
  });
  const items = (data?.items ?? []) as Entry[];
  const { rows, pager } = usePaged(items);
  // The dialog: open with the entry it edits, or with none to add one.
  const [editing, setEditing] = useState<{ entry?: Entry } | null>(null);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["vs-catalogue"] });

  const { mutate: starter, isPending: starting } = useMutation({
    mutationFn: addStarterCatalogue,
    meta: { showToast: false },
    onSuccess: () => {
      toast.success(t("vs.cat.starterDone"));
      refresh();
    },
    onError: (e) => toast.error(message(e, t("inv.restaurant.saveFailed")))
  });

  const columns = canWrite ? 5 : 4;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm text-muted-foreground">{t(`vs.cat.intro.${kind}`)}</p>
        {canWrite ? (
          <Button size="sm" className="ms-auto gap-2" onClick={() => setEditing({})}>
            <Plus className="size-4" />
            {t(`vs.cat.add.${kind}`)}
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
                <TableHead>{t("vs.cat.col.details")}</TableHead>
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
                    <p className="text-sm text-muted-foreground">{t("vs.cat.empty")}</p>
                    {canWrite ? (
                      <Button
                        size="sm"
                        className="mt-3 gap-2"
                        disabled={starting}
                        onClick={() => starter()}
                      >
                        <Sparkles className="size-4" />
                        {t("vs.cat.starter")}
                      </Button>
                    ) : null}
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((e) => (
                  <TableRow key={e.id} className={e.isActive ? "" : "opacity-60"}>
                    <TableCell>
                      <p className="font-medium">{lz(e.name)}</p>
                      <p className="font-mono text-xs text-muted-foreground" dir="ltr">
                        {e.slug ?? e.key}
                      </p>
                    </TableCell>
                    <TableCell className="whitespace-normal text-sm text-muted-foreground">
                      <Details entry={e} />
                    </TableCell>
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
                            onClick={() => setEditing({ entry: e })}
                          >
                            <Pencil className="size-4" />
                          </Button>
                          <DeleteButton
                            permission="inventory:delete"
                            what={t("vs.cat.deleteWhat", { name: lz(e.name) })}
                            consequence={t("vs.cat.deleteConsequence")}
                            onDelete={() => deleteCatalogueEntry(kind, e.id)}
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
        <EntryDialog
          kind={kind}
          entry={editing.entry}
          onClose={() => setEditing(null)}
          onSaved={refresh}
        />
      ) : null}
    </div>
  );
}

/** What the table says about an entry besides its name. */
function Details({ entry: e }: { entry: Entry }) {
  const { t } = useT();
  const bits = [
    e.valueType ? t(VALUE_TYPE[e.valueType]) : "",
    e.valueType === "NUMBER" && e.unit ? e.unit : "",
    e.valueType === "CHOICE" ? (e.choices ?? []).map((c) => lz(c.label)).join(", ") : "",
    lz(e.group),
    e.filterable ? t("vs.cat.filterable") : "",
    e.onCard ? t("vs.cat.onCard") : "",
    e.vehicleCount !== undefined ? t("vs.cat.vehicleCount", { n: e.vehicleCount }) : ""
  ].filter(Boolean);
  return <>{bits.join(" · ") || "—"}</>;
}

function EntryDialog({
  kind,
  entry,
  onClose,
  onSaved
}: {
  kind: CatalogueKind;
  entry?: Entry;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useT();
  const [name, setName] = useState<Localized>(entry?.name ?? {});
  const [key, setKey] = useState(entry?.slug ?? entry?.key ?? "");
  const [group, setGroup] = useState<Localized>(entry?.group ?? {});
  const [valueType, setValueType] = useState<SpecValueType>(entry?.valueType ?? "CHOICE");
  const [unit, setUnit] = useState(entry?.unit ?? "");
  const [choices, setChoices] = useState(entry?.choices ?? []);
  const [filterable, setFilterable] = useState(entry?.filterable ?? true);
  const [onCard, setOnCard] = useState(entry?.onCard ?? false);
  const [sortOrder, setSortOrder] = useState(String(entry?.sortOrder ?? 0));
  const [isActive, setIsActive] = useState(entry?.isActive ?? true);

  // A key is fixed once made: vehicles and the website's filters hold it.
  const finalKey = key.trim() || slugify(name.fr);
  const withKeys = choices.map((c) => ({ ...c, key: c.key || slugify(c.label.fr) }));
  const isSpec = kind === "specs";
  const choiceKeys = withKeys.map((c) => c.key);
  const choicesOk =
    !isSpec ||
    valueType !== "CHOICE" ||
    (withKeys.length > 0 &&
      choiceKeys.every(Boolean) &&
      new Set(choiceKeys).size === choiceKeys.length);

  const { mutate: save, isPending } = useMutation({
    mutationFn: () =>
      saveCatalogueEntry(kind, entry?.id, {
        name,
        ...(entry ? {} : kind === "types" ? { slug: finalKey } : { key: finalKey }),
        ...(kind === "accessories" ? { group } : {}),
        ...(isSpec
          ? {
              ...(entry ? {} : { valueType }),
              unit: valueType === "NUMBER" ? unit.trim() : "",
              choices: valueType === "CHOICE" ? withKeys : [],
              filterable,
              onCard
            }
          : {}),
        sortOrder: Number(sortOrder) || 0,
        isActive
      }),
    meta: { showToast: false },
    onSuccess: () => {
      toast.success(entry ? t("vs.saved") : t("vs.cat.added"));
      onSaved();
      onClose();
    },
    onError: (e) => toast.error(message(e, t("inv.restaurant.saveFailed")))
  });

  return (
    <Dialog open onOpenChange={(open) => !open && !isPending && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {entry ? t("vs.cat.editTitle", { name: lz(entry.name) }) : t(`vs.cat.add.${kind}`)}
          </DialogTitle>
          <DialogDescription>{t(`vs.cat.intro.${kind}`)}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <LocalizedInput label={t("common.name")} required value={name} onChange={setName} />
          </div>
          <div>
            <Label className="text-xs">{kind === "types" ? t("vs.cat.slug") : t("vs.cat.key")}</Label>
            <Input
              dir="ltr"
              className="font-mono"
              disabled={Boolean(entry)}
              value={key}
              placeholder={slugify(name.fr)}
              onChange={(e) => setKey(slugify(e.target.value))}
            />
            <p className="mt-1 text-[11px] text-muted-foreground">{t("vs.cat.keyHint")}</p>
          </div>
          <div>
            <Label className="text-xs">{t("vs.cat.order")}</Label>
            <Input type="number" step={1} value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} />
          </div>

          {kind === "accessories" ? (
            <div className="sm:col-span-2">
              <LocalizedInput
                label={t("vs.cat.group")}
                placeholder={t("vs.cat.groupPlaceholder")}
                value={group}
                onChange={setGroup}
              />
            </div>
          ) : null}

          {isSpec ? (
            <>
              <div>
                <Label className="text-xs">{t("vs.cat.valueType")}</Label>
                <OptionSelect
                  aria-label={t("vs.cat.valueType")}
                  disabled={Boolean(entry)}
                  value={valueType}
                  onChange={(v) => setValueType(v as SpecValueType)}
                  options={(Object.keys(VALUE_TYPE) as SpecValueType[]).map((v) => ({
                    value: v,
                    label: t(VALUE_TYPE[v])
                  }))}
                />
              </div>
              {valueType === "NUMBER" ? (
                <div>
                  <Label className="text-xs">{t("vs.cat.unit")}</Label>
                  <Input
                    dir="ltr"
                    value={unit}
                    maxLength={12}
                    placeholder="cc, kg, ch"
                    onChange={(e) => setUnit(e.target.value)}
                  />
                </div>
              ) : null}
              {valueType === "CHOICE" ? (
                <div className="space-y-3 sm:col-span-2">
                  <Label className="text-xs">{t("vs.cat.choices")} *</Label>
                  {withKeys.map((c, i) => (
                    <div key={i} className="flex items-end gap-2">
                      <div className="flex-1">
                        <LocalizedInput
                          label={c.key || t("vs.cat.choice", { n: i + 1 })}
                          required
                          value={c.label}
                          onChange={(label) =>
                            setChoices((cs) => cs.map((x, n) => (n === i ? { ...x, label } : x)))
                          }
                        />
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        title={t("vs.cat.removeChoice")}
                        aria-label={t("vs.cat.removeChoice")}
                        onClick={() => setChoices((cs) => cs.filter((_, n) => n !== i))}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  ))}
                  <Button
                    size="sm"
                    variant="secondary"
                    className="gap-2"
                    onClick={() => setChoices((cs) => [...cs, { key: "", label: {} }])}
                  >
                    <Plus className="size-4" />
                    {t("vs.cat.addChoice")}
                  </Button>
                  {!choicesOk ? (
                    <p className="text-xs text-amber-700 dark:text-amber-400">{t("vs.cat.choicesNeeded")}</p>
                  ) : null}
                </div>
              ) : null}
              <label className="flex items-center gap-3 text-sm">
                <Switch checked={filterable} onCheckedChange={setFilterable} />
                {t("vs.cat.filterableSwitch")}
              </label>
              <label className="flex items-center gap-3 text-sm">
                <Switch checked={onCard} onCheckedChange={setOnCard} />
                {t("vs.cat.onCardSwitch")}
              </label>
            </>
          ) : null}

          <label className="flex items-center gap-3 text-sm">
            <Switch checked={isActive} onCheckedChange={setIsActive} />
            {t("vs.cat.activeSwitch")}
          </label>
        </div>

        <DialogFooter>
          <Button variant="ghost" disabled={isPending} onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button
            disabled={isPending || !name.fr?.trim() || !finalKey || !choicesOk}
            onClick={() => save()}
          >
            {isPending ? t("inv.restaurant.saving") : t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
