import {
  createSupplier,
  deleteSupplier,
  listSuppliers,
  updateSupplier,
  type Supplier,
  type SupplierInput
} from "@/api/functions/admin.api";
import DeleteButton from "@/components/DeleteButton";
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
import { Textarea } from "@/components/ui/textarea";
import { useCan } from "@/lib/permissions";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AxiosError } from "axios";
import { Pencil, Plus, Search } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

/**
 * Suppliers: hotels, airlines and bus companies (the "travel agency" of a
 * route), car hire firms, property owners, tour operators.
 *
 * Recorded once here and picked from a list on every hotel and listing, so
 * whoever is on duty can call the supplier from a booking. A supplier that is
 * still named somewhere is switched off rather than deleted.
 */

const BLANK: Required<Omit<SupplierInput, "isActive">> = {
  name: "",
  contactName: "",
  phone: "",
  email: "",
  address: "",
  notes: ""
};

const message = (e: unknown, fallback: string) =>
  (e as AxiosError<{ message?: string }>).response?.data?.message ?? fallback;

export default function SuppliersPage() {
  const queryClient = useQueryClient();
  const { can } = useCan();
  const canWrite = can("inventory:write");
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState({ ...BLANK });
  // The supplier the form is changing; null while it adds a new one.
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [showForm, setShowForm] = useState(false);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["suppliers"],
    queryFn: () => listSuppliers(),
    refetchOnMount: "always"
  });
  const needle = search.trim().toLowerCase();
  const matching = (data?.items ?? []).filter(
    (s) =>
      !needle ||
      [s.name, s.contactName, s.phone, s.email].some((v) => v?.toLowerCase().includes(needle))
  );
  const { rows, pager } = usePaged(matching, needle);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["suppliers"] });

  const { mutate: save, isPending: saving } = useMutation({
    mutationFn: () => (editing ? updateSupplier(editing.id, draft) : createSupplier(draft)),
    meta: { showToast: false },
    onSuccess: () => {
      toast.success(editing ? "Supplier saved" : "Supplier added");
      setDraft({ ...BLANK });
      setEditing(null);
      setShowForm(false);
      refresh();
    },
    onError: (e) => toast.error(message(e, "Could not save the supplier"))
  });

  const { mutate: setActive } = useMutation({
    mutationFn: (s: Supplier) => updateSupplier(s.id, { isActive: !s.isActive }),
    meta: { showToast: false },
    onSuccess: (_r, s) => {
      toast.success(s.isActive ? "Switched off — no longer offered on new items" : "Switched back on");
      refresh();
    },
    onError: (e) => toast.error(message(e, "Could not change it"))
  });

  const edit = (s: Supplier) => {
    setEditing(s);
    setDraft({
      name: s.name,
      contactName: s.contactName,
      phone: s.phone,
      email: s.email,
      address: s.address,
      notes: s.notes
    });
    setShowForm(true);
  };

  const field = (key: keyof typeof BLANK, label: string, placeholder?: string) => (
    <div>
      <Label className="text-xs">
        {label}
        {key === "name" ? " *" : ""}
      </Label>
      <Input
        value={draft[key]}
        placeholder={placeholder}
        onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
      />
    </div>
  );

  return (
    <AdminLayout
      title="Suppliers"
      description="Who you buy from — hotels, travel agencies, car hire, owners, tour operators. Picked on every hotel and listing."
    >
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative w-full max-w-xs">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder="Name, contact, phone or email"
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
              Add supplier
            </Button>
          ) : null}
        </div>

        {canWrite && showForm ? (
          <Card className="gap-0 p-5">
            <h2 className="mb-4 text-sm font-medium">
              {editing ? `Edit ${editing.name}` : "New supplier"}
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {field("name", "Supplier name", "Transco, Hôtel du Fleuve, Congo Airways…")}
              {field("contactName", "Contact person", "Who to ask for")}
              {field("phone", "Phone number", "+243 81 000 00 00")}
              {field("email", "Email", "reservations@…")}
              <div className="sm:col-span-2">{field("address", "Address", "Street, district, city")}</div>
              <div className="sm:col-span-2 lg:col-span-3">
                <Label className="text-xs">Notes</Label>
                <Textarea
                  rows={2}
                  value={draft.notes}
                  placeholder="Opening hours, how they prefer to be reached, payment terms…"
                  onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
                />
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <Button size="sm" disabled={!draft.name.trim() || saving} onClick={() => save()}>
                {editing ? "Save supplier" : "Add supplier"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setShowForm(false);
                  setEditing(null);
                }}
              >
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
                  <TableHead>Supplier</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Address</TableHead>
                  <TableHead className="text-right">Used on</TableHead>
                  <TableHead>Status</TableHead>
                  {canWrite ? <TableHead className="text-right">Actions</TableHead> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                      Loading…
                    </TableCell>
                  </TableRow>
                ) : !rows.length ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                      {needle
                        ? "No supplier matches that."
                        : "No suppliers yet. Add the hotels, agencies and firms you buy from, then pick them on each item."}
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((s) => {
                    const used = (s.usedBy?.hotels ?? 0) + (s.usedBy?.listings ?? 0);
                    return (
                      <TableRow key={s.id} className={s.isActive ? "" : "opacity-60"}>
                        <TableCell>
                          <p className="font-medium">{s.name}</p>
                          {s.notes ? (
                            <p className="max-w-64 truncate text-xs text-muted-foreground" title={s.notes}>
                              {s.notes}
                            </p>
                          ) : null}
                        </TableCell>
                        {/* One column: who to ask for, and how to reach them. */}
                        <TableCell className="text-sm">
                          {s.contactName ? <p>{s.contactName}</p> : null}
                          {s.phone ? (
                            <a
                              href={`tel:${s.phone.replace(/\s/g, "")}`}
                              className="block whitespace-nowrap hover:underline"
                            >
                              {s.phone}
                            </a>
                          ) : null}
                          {s.email ? (
                            <a
                              href={`mailto:${s.email}`}
                              className="block max-w-64 truncate text-muted-foreground hover:underline"
                              title={s.email}
                            >
                              {s.email}
                            </a>
                          ) : null}
                          {!s.contactName && !s.phone && !s.email ? "—" : null}
                        </TableCell>
                        <TableCell className="max-w-56 whitespace-normal text-muted-foreground">
                          {s.address || "—"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {s.usedBy?.hotels ? `${s.usedBy.hotels} hotel${s.usedBy.hotels > 1 ? "s" : ""}` : ""}
                          {s.usedBy?.hotels && s.usedBy?.listings ? " · " : ""}
                          {s.usedBy?.listings
                            ? `${s.usedBy.listings} listing${s.usedBy.listings > 1 ? "s" : ""}`
                            : ""}
                          {!used ? "—" : ""}
                        </TableCell>
                        <TableCell>
                          <Badge variant={s.isActive ? "secondary" : "outline"}>
                            {s.isActive ? "Active" : "Switched off"}
                          </Badge>
                        </TableCell>
                        {canWrite ? (
                          <TableCell>
                            <div className="flex items-center justify-end gap-1">
                              <Button variant="ghost" size="icon" title="Edit" onClick={() => edit(s)}>
                                <Pencil className="size-4" />
                              </Button>
                              <Button variant="outline" size="sm" onClick={() => setActive(s)}>
                                {s.isActive ? "Switch off" : "Switch on"}
                              </Button>
                              <DeleteButton
                                permission="inventory:delete"
                                what={`the supplier “${s.name}”`}
                                consequence="Only a supplier nothing is named against can be deleted; otherwise switch it off."
                                disabled={used > 0}
                                onDelete={() => deleteSupplier(s.id)}
                                onDeleted={refresh}
                              />
                            </div>
                          </TableCell>
                        ) : null}
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        )}
        <Pager {...pager} noun="supplier" />
      </div>
    </AdminLayout>
  );
}
