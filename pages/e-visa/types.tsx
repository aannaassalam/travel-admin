import {
  deleteVisaConfig,
  listVisaConfig,
  saveVisaConfig,
  type VisaConfigKind,
  type VisaPersonType
} from "@/api/functions/visa.api";
import DeleteButton from "@/components/DeleteButton";
import LocalizedInput, {
  type Localized
} from "@/components/Form/LocalizedInput";
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
import { lz, toLocalized } from "@/lib/functions/localized.lib";
import { useT } from "@/lib/i18n/useT";
import { useCan } from "@/lib/permissions";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Pencil, Plus } from "lucide-react";
import { useRouter } from "next/router";
import { useState } from "react";
import { toast } from "sonner";

/**
 * The two lists every application chooses from: kinds of visa (tourist,
 * business…) and kinds of traveller (adult, minor…). One tab each, edited in a
 * dialog, as the vehicles catalogue.
 */

const KINDS: VisaConfigKind[] = ["types", "person-types"];

/** Either of the two, as far as this screen cares. */
type Entry = Partial<Omit<VisaPersonType, "id">> & {
  id: string;
  name: Localized;
  sortOrder: number;
  isActive: boolean;
};

export default function VisaTypesPage() {
  const router = useRouter();
  const { t } = useT();
  const asked = router.query.tab as VisaConfigKind;
  const tab = KINDS.includes(asked) ? asked : "types";
  return (
    <AdminLayout
      title={t("nav.evisa.types")}
      description={t("visa.types.description")}
    >
      <Tabs
        value={tab}
        onValueChange={(next) =>
          router.replace({ query: { tab: next } }, undefined, { shallow: true })
        }
      >
        <TabsList>
          <TabsTrigger value="types">{t("visa.types.tab.types")}</TabsTrigger>
          <TabsTrigger value="person-types">
            {t("visa.types.tab.person")}
          </TabsTrigger>
        </TabsList>
        {KINDS.map((k) => (
          <TabsContent key={k} value={k} className="mt-3">
            <ConfigTab kind={k} />
          </TabsContent>
        ))}
      </Tabs>
    </AdminLayout>
  );
}

function ConfigTab({ kind }: { kind: VisaConfigKind }) {
  const { t } = useT();
  const { can } = useCan();
  const canWrite = can("inventory:write");
  const person = kind === "person-types";
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["visa-config", kind],
    queryFn: () => listVisaConfig(kind),
    refetchOnMount: "always"
  });
  const items = (data?.items ?? []) as Entry[];
  const { rows, pager } = usePaged(items);
  const [editing, setEditing] = useState<{ entry?: Entry } | null>(null);
  const columns = canWrite ? 5 : 4;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm text-muted-foreground">
          {person ? t("visa.types.intro.person") : t("visa.types.intro.types")}
        </p>
        {canWrite ? (
          <Button
            size="sm"
            className="ms-auto gap-2"
            onClick={() => setEditing({})}
          >
            <Plus className="size-4" />
            {person ? t("visa.types.add.person") : t("visa.types.add.types")}
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
                <TableHead>
                  {person
                    ? t("visa.types.extraDocuments")
                    : t("visa.types.descriptionLabel")}
                </TableHead>
                <TableHead className="text-end">{t("vs.cat.order")}</TableHead>
                <TableHead>{t("common.status")}</TableHead>
                {canWrite ? (
                  <TableHead className="text-end">
                    {t("common.actions")}
                  </TableHead>
                ) : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell
                    colSpan={columns}
                    className="py-10 text-center text-muted-foreground"
                  >
                    {t("common.loading")}
                  </TableCell>
                </TableRow>
              ) : !rows.length ? (
                <TableRow>
                  <TableCell
                    colSpan={columns}
                    className="py-10 text-center text-sm text-muted-foreground"
                  >
                    {t("visa.types.empty")}
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((e) => (
                  <TableRow
                    key={e.id}
                    className={e.isActive ? "" : "opacity-60"}
                  >
                    <TableCell>
                      <p className="font-medium">{lz(e.name)}</p>
                      {person && e.isMinor ? (
                        <Badge variant="outline" className="mt-1">
                          {t("visa.minor")}
                        </Badge>
                      ) : null}
                    </TableCell>
                    <TableCell className="max-w-md whitespace-normal text-sm text-muted-foreground">
                      {lz(person ? e.extraDocuments : e.description) || "—"}
                    </TableCell>
                    <TableCell className="text-end tabular-nums">
                      {e.sortOrder}
                    </TableCell>
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
                            aria-label={t("common.edit")}
                            onClick={() => setEditing({ entry: e })}
                          >
                            <Pencil className="size-4" />
                          </Button>
                          {/* In use: the server refuses; switching it off is the way. */}
                          {e.usage ? null : (
                            <DeleteButton
                              permission="inventory:delete"
                              what={t("vs.cat.deleteWhat", {
                                name: lz(e.name)
                              })}
                              consequence={t("visa.types.deleteConsequence")}
                              onDelete={() => deleteVisaConfig(kind, e.id)}
                              onDeleted={() => refetch()}
                            />
                          )}
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
        />
      ) : null}
    </div>
  );
}

function EntryDialog({
  kind,
  entry,
  onClose
}: {
  kind: VisaConfigKind;
  entry?: Entry;
  onClose: () => void;
}) {
  const { t } = useT();
  const person = kind === "person-types";
  const [name, setName] = useState<Localized>(toLocalized(entry?.name));
  const [description, setDescription] = useState<Localized>(
    toLocalized(entry?.description)
  );
  const [extraDocuments, setExtraDocuments] = useState<Localized>(
    toLocalized(entry?.extraDocuments)
  );
  const [isMinor, setIsMinor] = useState(entry?.isMinor ?? false);
  const [sortOrder, setSortOrder] = useState(String(entry?.sortOrder ?? 0));
  const [isActive, setIsActive] = useState(entry?.isActive ?? true);

  const { mutate: save, isPending } = useMutation({
    mutationFn: () =>
      saveVisaConfig(kind, entry?.id, {
        name,
        description,
        ...(person ? { extraDocuments, isMinor } : {}),
        sortOrder: Number(sortOrder) || 0,
        isActive
      }),
    meta: { showToast: false },
    onSuccess: () => {
      toast.success(entry ? t("vs.saved") : t("vs.cat.added"));
      onClose();
    },
    onError: (e) => toast.error(message(e, t("inv.restaurant.saveFailed")))
  });

  return (
    <Dialog open onOpenChange={(open) => !open && !isPending && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {entry
              ? t("vs.cat.editTitle", { name: lz(entry.name) })
              : person
                ? t("visa.types.add.person")
                : t("visa.types.add.types")}
          </DialogTitle>
          <DialogDescription>
            {person
              ? t("visa.types.intro.person")
              : t("visa.types.intro.types")}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <LocalizedInput
              label={t("common.name")}
              required
              value={name}
              onChange={setName}
            />
          </div>
          <div className="sm:col-span-2">
            <LocalizedInput
              label={t("visa.types.descriptionLabel")}
              multiline
              value={description}
              onChange={setDescription}
              placeholder={
                person ? undefined : t("visa.types.descriptionPlaceholder")
              }
            />
          </div>
          {person ? (
            <>
              <div className="sm:col-span-2">
                <LocalizedInput
                  label={t("visa.types.extraDocuments")}
                  multiline
                  value={extraDocuments}
                  onChange={setExtraDocuments}
                  placeholder={t("visa.types.extraDocumentsPlaceholder")}
                />
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {t("visa.types.extraDocumentsHint")}
                </p>
              </div>
              <label className="flex items-start gap-3 text-sm sm:col-span-2">
                <Switch checked={isMinor} onCheckedChange={setIsMinor} />
                <span>
                  {t("visa.types.isMinor")}
                  <span className="block text-[11px] text-muted-foreground">
                    {t("visa.types.isMinorHint")}
                  </span>
                </span>
              </label>
            </>
          ) : null}
          <div>
            <Label className="text-xs">{t("vs.cat.order")}</Label>
            <Input
              type="number"
              step={1}
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value)}
            />
          </div>
          <label className="flex items-center gap-3 self-end pb-2 text-sm">
            <Switch checked={isActive} onCheckedChange={setIsActive} />
            {t("visa.types.activeSwitch")}
          </label>
        </div>

        <DialogFooter>
          <Button variant="ghost" disabled={isPending} onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button
            disabled={isPending || !name.fr?.trim()}
            onClick={() => save()}
          >
            {isPending ? t("inv.restaurant.saving") : t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
