import {
  createPartner,
  deletePartner,
  listPartners,
  updatePartner,
  uploadPartnerLogo,
  type Partner
} from "@/api/functions/partners.api";
import DeleteButton from "@/components/DeleteButton";
import AssetImage from "@/components/Form/AssetImage";
import ImageUploader from "@/components/Form/ImageUploader";
import AdminLayout from "@/components/Layout/AdminLayout";
import Pager, { usePaged } from "@/components/Pager";
import QueryError from "@/components/QueryError";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import { useCan } from "@/lib/permissions";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AxiosError } from "axios";
import { Pencil, Plus, Search } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

/**
 * Partners: the logos in the "Our partners" section of the website's homepage
 * and the app's Explore screen, each opening the partner's website when it has
 * one. While none is switched on, the section is not shown at all.
 */

// The order box holds text while it is typed; a blank one is the default, 0.
const BLANK = { name: "", logo: "", website: "", sortOrder: "0" };

const message = (e: unknown, fallback: string) =>
  (e as AxiosError<{ message?: string }>).response?.data?.message ?? fallback;

export default function PartnersPage() {
  const queryClient = useQueryClient();
  const { can } = useCan();
  const canWrite = can("content:write");
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState({ ...BLANK });
  // The partner the form is changing; null while it adds a new one.
  const [editing, setEditing] = useState<Partner | null>(null);
  const [showForm, setShowForm] = useState(false);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["partners"],
    queryFn: listPartners,
    refetchOnMount: "always"
  });
  const needle = search.trim().toLowerCase();
  const matching = (data?.items ?? []).filter(
    (p) =>
      !needle ||
      [p.name, p.website].some((v) => v?.toLowerCase().includes(needle))
  );
  const { rows, pager } = usePaged(matching, needle);

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ["partners"] });

  const close = () => {
    setDraft({ ...BLANK });
    setEditing(null);
    setShowForm(false);
  };

  const { mutate: save, isPending: saving } = useMutation({
    mutationFn: () => {
      const body = { ...draft, sortOrder: Number(draft.sortOrder) || 0 };
      return editing
        ? updatePartner(editing.id, { ...body, version: editing.version })
        : createPartner(body);
    },
    meta: { showToast: false },
    onSuccess: () => {
      // Cached on the way out, as the site's wording is.
      toast.success(
        `${editing ? "Partner saved" : "Partner added"} — the website shows it within a few minutes`
      );
      close();
      refresh();
    },
    onError: (e) => {
      toast.error(message(e, "Could not save the partner"));
      // 409: saved by someone else meanwhile. Re-read the list, or Edit starts
      // again from the same old version and is refused again.
      if ((e as AxiosError).response?.status === 409) refresh();
    }
  });

  const { mutate: setActive } = useMutation({
    mutationFn: (p: Partner) => updatePartner(p.id, { isActive: !p.isActive }),
    meta: { showToast: false },
    onSuccess: (_r, p) => {
      toast.success(
        p.isActive
          ? "Switched off — no longer on the website or in the app"
          : "Switched back on"
      );
      refresh();
    },
    onError: (e) => toast.error(message(e, "Could not change it"))
  });

  const edit = (p: Partner) => {
    setEditing(p);
    setDraft({
      name: p.name,
      logo: p.logo,
      website: p.website,
      sortOrder: String(p.sortOrder)
    });
    setShowForm(true);
  };

  const columns = canWrite ? 5 : 4;

  return (
    <AdminLayout
      title="Partners"
      description="Logos in the “Our partners” section of the website’s homepage and the app — lowest order first."
    >
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative w-full max-w-xs">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder="Name or website"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {canWrite ? (
            <Button
              size="sm"
              className="ml-auto gap-2"
              onClick={() => {
                setEditing(null);
                setDraft({ ...BLANK });
                setShowForm((open) => !open || Boolean(editing));
              }}
            >
              <Plus className="size-4" />
              Add partner
            </Button>
          ) : null}
        </div>

        {canWrite && showForm ? (
          <Card className="gap-0 p-5">
            <h2 className="mb-4 text-sm font-medium">
              {editing ? `Edit ${editing.name}` : "New partner"}
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <Label className="text-xs">Partner name *</Label>
                <Input
                  value={draft.name}
                  maxLength={120}
                  placeholder="Congo Airways, Pullman Kinshasa…"
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, name: e.target.value }))
                  }
                />
              </div>
              <div>
                <Label className="text-xs">Website</Label>
                <Input
                  type="url"
                  value={draft.website}
                  placeholder="https://…"
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, website: e.target.value }))
                  }
                />
              </div>
              <div>
                <Label className="text-xs">Order</Label>
                <Input
                  type="number"
                  step={1}
                  value={draft.sortOrder}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, sortOrder: e.target.value }))
                  }
                />
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Lowest first; partners with the same number go by name.
                </p>
              </div>
              <div className="sm:col-span-2 lg:col-span-3">
                <ImageUploader
                  label="Logo *"
                  folder="partners"
                  single
                  upload={uploadPartnerLogo}
                  permission="content:write"
                  value={draft.logo ? [draft.logo] : []}
                  onChange={(next) =>
                    setDraft((d) => ({ ...d, logo: next[0] ?? "" }))
                  }
                />
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Shown at the same height as the other logos. A PNG or WebP
                  with a transparent background looks best.
                </p>
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <Button
                size="sm"
                disabled={!draft.name.trim() || !draft.logo || saving}
                onClick={() => save()}
              >
                {editing ? "Save partner" : "Add partner"}
              </Button>
              <Button size="sm" variant="ghost" onClick={close}>
                Cancel
              </Button>
            </div>
          </Card>
        ) : null}

        {isError ? (
          <QueryError error={error} onRetry={() => refetch()} />
        ) : (
          <div className="rounded-lg border bg-background">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Logo</TableHead>
                  <TableHead>Partner</TableHead>
                  <TableHead className="text-right">Order</TableHead>
                  <TableHead>Status</TableHead>
                  {canWrite ? (
                    <TableHead className="text-right">Actions</TableHead>
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
                      Loading…
                    </TableCell>
                  </TableRow>
                ) : !rows.length ? (
                  <TableRow>
                    <TableCell
                      colSpan={columns}
                      className="py-10 text-center text-sm text-muted-foreground"
                    >
                      {needle
                        ? "No partner matches that."
                        : "No partners yet. Add one with its logo and the homepage shows an “Our partners” section."}
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((p) => (
                    <TableRow
                      key={p.id}
                      className={p.isActive ? "" : "opacity-60"}
                    >
                      <TableCell>
                        <AssetImage
                          src={p.logo}
                          title={p.name}
                          className="h-10 w-24 object-contain p-0.5"
                        />
                      </TableCell>
                      <TableCell>
                        <p className="font-medium">{p.name}</p>
                        {p.website ? (
                          <a
                            href={p.website}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block max-w-64 truncate text-xs text-muted-foreground hover:underline"
                            title={p.website}
                          >
                            {p.website}
                          </a>
                        ) : (
                          <p className="text-xs text-muted-foreground">
                            No website: the logo is not a link
                          </p>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {p.sortOrder}
                      </TableCell>
                      <TableCell>
                        <Badge variant={p.isActive ? "secondary" : "outline"}>
                          {p.isActive ? "Shown" : "Switched off"}
                        </Badge>
                      </TableCell>
                      {canWrite ? (
                        <TableCell>
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Edit"
                              onClick={() => edit(p)}
                            >
                              <Pencil className="size-4" />
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setActive(p)}
                            >
                              {p.isActive ? "Switch off" : "Switch on"}
                            </Button>
                            <DeleteButton
                              permission="content:delete"
                              what={`the partner “${p.name}”`}
                              consequence="Its logo leaves the website and the app; switching it off keeps it here instead."
                              onDelete={() => deletePartner(p.id)}
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
        <Pager {...pager} noun="partner" />
      </div>
    </AdminLayout>
  );
}
