import {
  createRole,
  deleteRole,
  listRoles,
  Role,
  settle,
  updateRole
} from "@/api/functions/access.api";
import AdminLayout from "@/components/Layout/AdminLayout";
import Pager, { usePaged } from "@/components/Pager";
import QueryError from "@/components/QueryError";
import SortHead, { sortRows, type Sort } from "@/components/SortHead";
import { useStepUp } from "@/components/StepUp/useStepUp";
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
import { Checkbox } from "@/components/ui/checkbox";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import { useT } from "@/lib/i18n/useT";
import { Permission, PERMISSION_GROUPS, useCan } from "@/lib/permissions";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

/**
 * A role is a named set of permissions. A staff user holds exactly one role and
 * nothing beyond it; super admins hold everything and have no role to edit.
 *
 * Without roles:write this page is read-only: no mutation control is rendered.
 */
export default function RolesPage() {
  const queryClient = useQueryClient();
  const { t } = useT();
  const { can, admin } = useCan();
  const { guard, dialog } = useStepUp();
  const canWrite = can("roles:write");

  // `null`: editor closed. No `role`: creating a new one.
  const [editing, setEditing] = useState<{ role?: Role } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Role | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["access", "roles"],
    queryFn: listRoles
  });
  // By name, as the server lists them, until a column heading is pressed.
  const [sort, setSort] = useState<Sort>("");
  const head = { sort, onSort: setSort };
  const { rows, pager } = usePaged(
    sortRows(data?.roles ?? [], sort, {
      name: (r) => r.name,
      description: (r) => r.description,
      permissions: (r) => r.permissions.length,
      users: (r) => r.userCount
    }),
    sort
  );

  const { mutate: run, isPending } = useMutation({
    // Wrapped: a stale step-up opens the password prompt and retries afterwards.
    mutationFn: (action: () => Promise<void>) => guard(action),
    // settle() reports each outcome itself, so nothing is toasted twice.
    meta: { showToast: false }
  });

  // Users show their role name and roles show their user count, so both lists
  // are refreshed — including the one not on screen.
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ["access"], refetchType: "all" });

  const save = (call: () => Promise<Role>, fail: (message: string) => void) =>
    run(
      settle(
        call,
        (saved) => {
          setEditing(null);
          refresh();
          toast.success(t("sys.roles.saved", { name: saved.name }));
        },
        fail
      )
    );

  const remove = (role: Role) =>
    run(
      settle(
        () => deleteRole(role.id),
        () => {
          refresh();
          toast.success(t("sys.roles.deleted", { name: role.name }));
        },
        (message) => toast.error(message)
      )
    );

  // Mirrors the server: nobody edits the role they hold, or a role that
  // reaches beyond their own permissions. The controls are not offered at all.
  const lockReason = (role: Role) =>
    role.id === admin?.roleId
      ? t("sys.roles.ownRole")
      : role.permissions.some((p) => !admin?.permissions.includes(p))
        ? t("sys.roles.beyond")
        : null;

  const columns = canWrite ? 5 : 4;

  return (
    <AdminLayout
      title={t("nav.roles")}
      description={t("sys.roles.description")}
    >
      {dialog}
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="max-w-2xl text-sm text-muted-foreground">
            {t("sys.roles.intro")}
          </p>
          {canWrite ? (
            <Button size="sm" onClick={() => setEditing({})}>
              {t("sys.roles.new")}
            </Button>
          ) : null}
        </div>

        <div className="rounded-lg border bg-background">
          <Table>
            <TableHeader>
              <TableRow>
                <SortHead column="name" {...head}>
                  {t("common.name")}
                </SortHead>
                <SortHead column="description" {...head}>
                  {t("sys.roles.colDescription")}
                </SortHead>
                <SortHead
                  column="permissions"
                  align="right"
                  className="text-end"
                  {...head}
                >
                  {t("sys.roles.colPermissions")}
                </SortHead>
                <SortHead
                  column="users"
                  align="right"
                  className="text-end"
                  {...head}
                >
                  {t("sys.roles.colUsers")}
                </SortHead>
                {canWrite ? <TableHead /> : null}
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
              ) : isError ? (
                <TableRow>
                  <TableCell colSpan={columns} className="p-0">
                    <QueryError onRetry={() => refetch()} />
                  </TableCell>
                </TableRow>
              ) : !data?.roles.length ? (
                <TableRow>
                  <TableCell
                    colSpan={columns}
                    className="py-10 text-center text-sm text-muted-foreground"
                  >
                    {t("sys.roles.none")}
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((role) => {
                  const locked = lockReason(role);
                  return (
                    <TableRow key={role.id}>
                      <TableCell className="font-medium">
                        {role.name}
                        {role.id === admin?.roleId ? (
                          <Badge variant="secondary" className="ms-2">
                            {t("sys.roles.yours")}
                          </Badge>
                        ) : null}
                      </TableCell>
                      <TableCell className="whitespace-normal text-sm text-muted-foreground">
                        {role.description || "—"}
                        <p className="mt-1 text-xs">
                          {PERMISSION_GROUPS.map((g) => ({
                            label: g.label,
                            held: g.permissions.filter((p) =>
                              role.permissions.includes(p.key)
                            )
                          }))
                            .filter((g) => g.held.length)
                            .map(
                              (g) =>
                                `${g.label}: ${g.held.map((p) => p.label).join(", ")}`
                            )
                            .join(" · ") || t("sys.roles.noPermissions")}
                        </p>
                      </TableCell>
                      <TableCell className="text-end tabular-nums">
                        {role.permissions.length}
                      </TableCell>
                      <TableCell className="text-end tabular-nums">
                        {role.userCount}
                      </TableCell>
                      {canWrite ? (
                        <TableCell className="text-end">
                          {locked ? (
                            <span className="text-xs text-muted-foreground">
                              {locked}
                            </span>
                          ) : (
                            <>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setEditing({ role })}
                              >
                                {t("common.edit")}
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-destructive hover:text-destructive"
                                onClick={() => setPendingDelete(role)}
                              >
                                {t("sys.delete")}
                              </Button>
                            </>
                          )}
                        </TableCell>
                      ) : null}
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>

        <Pager {...pager} noun={t("sys.roles.noun")} plural={t("sys.roles.nouns")} />
      </div>

      {editing ? (
        <RoleEditor
          role={editing.role}
          can={can}
          busy={isPending}
          onSave={save}
          onClose={() => setEditing(null)}
        />
      ) : null}

      <AlertDialog
        open={Boolean(pendingDelete)}
        onOpenChange={(open) => !open && setPendingDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("sys.roles.deleteTitle", { name: pendingDelete?.name ?? "" })}
            </AlertDialogTitle>
            <AlertDialogDescription>{t("sys.roles.deleteBody")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => pendingDelete && remove(pendingDelete)}
            >
              {t("sys.roles.deleteButton")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminLayout>
  );
}

/** Create or edit. Mounted only while open, so its state starts from the role. */
function RoleEditor({
  role,
  can,
  busy,
  onSave,
  onClose
}: {
  role?: Role;
  can: (permission: Permission) => boolean;
  busy: boolean;
  onSave: (call: () => Promise<Role>, fail: (message: string) => void) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(role?.name ?? "");
  const [description, setDescription] = useState(role?.description ?? "");
  const [permissions, setPermissions] = useState<string[]>(
    role?.permissions ?? []
  );
  const [error, setError] = useState<string | null>(null);
  const { t } = useT();

  const toggle = (key: string, on: boolean) =>
    setPermissions((held) =>
      on ? [...held, key] : held.filter((p) => p !== key)
    );

  const submit = () => {
    setError(null);
    const input = {
      name: name.trim(),
      description: description.trim(),
      permissions
    };
    onSave(
      () => (role ? updateRole(role.id, input) : createRole(input)),
      setError
    );
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {role ? t("sys.roles.editTitle", { name: role.name }) : t("sys.roles.new")}
          </DialogTitle>
          <DialogDescription>{t("sys.roles.editorIntro")}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label className="text-xs">{t("common.name")}</Label>
            <Input
              value={name}
              autoFocus
              onChange={(e) => setName(e.target.value)}
              placeholder={t("sys.roles.namePlaceholder")}
            />
          </div>
          <div>
            <Label className="text-xs">{t("sys.roles.colDescription")}</Label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t("sys.roles.descriptionPlaceholder")}
            />
          </div>
        </div>

        <div className="divide-y rounded-md border">
          {PERMISSION_GROUPS.map((group) => (
            <div
              key={group.label}
              className="grid gap-2 p-3 sm:grid-cols-[150px_1fr]"
            >
              <p className="text-sm font-medium">{group.label}</p>
              <div className="flex flex-col gap-2">
                {group.permissions.map((p) => {
                  const held = can(p.key);
                  const id = `permission-${p.key}`;
                  return (
                    <div key={p.key} className="flex items-start gap-2">
                      <Checkbox
                        id={id}
                        className="mt-0.5"
                        checked={permissions.includes(p.key)}
                        disabled={!held}
                        onCheckedChange={(v) => toggle(p.key, v === true)}
                      />
                      <label htmlFor={id} className="text-sm">
                        <span className="font-medium">{p.label}</span>
                        <span className="text-muted-foreground">
                          {" "}
                          — {p.description}
                        </span>
                        {/* The server refuses to grant what the grantor lacks. */}
                        {!held ? (
                          <span className="block text-[11px] text-muted-foreground">
                            {t("sys.roles.notHeld")}
                          </span>
                        ) : null}
                      </label>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {error ? (
          <p
            role="alert"
            className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {error}
          </p>
        ) : null}

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button onClick={submit} disabled={busy || !name.trim()}>
            {busy ? t("sys.saving") : role ? t("sys.roles.saveChanges") : t("sys.roles.create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
