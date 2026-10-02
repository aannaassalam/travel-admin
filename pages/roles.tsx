import {
  createRole,
  deleteRole,
  listRoles,
  Role,
  settle,
  updateRole
} from "@/api/functions/access.api";
import AdminLayout from "@/components/Layout/AdminLayout";
import QueryError from "@/components/QueryError";
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
          toast.success(`Role “${saved.name}” saved`);
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
          toast.success(`Role “${role.name}” deleted`);
        },
        (message) => toast.error(message)
      )
    );

  // Mirrors the server: nobody edits the role they hold, or a role that
  // reaches beyond their own permissions. The controls are not offered at all.
  const lockReason = (role: Role) =>
    role.id === admin?.roleId
      ? "Your own role"
      : role.permissions.some((p) => !admin?.permissions.includes(p))
        ? "Beyond your own access"
        : null;

  const columns = canWrite ? 5 : 4;

  return (
    <AdminLayout
      title="Roles"
      description="What each kind of staff account is allowed to do"
    >
      {dialog}
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="max-w-2xl text-sm text-muted-foreground">
            A staff user holds exactly one role and can do only what it lists.
            Super admins can do everything and are not governed by a role.
          </p>
          {canWrite ? (
            <Button size="sm" onClick={() => setEditing({})}>
              New role
            </Button>
          ) : null}
        </div>

        <div className="rounded-lg border bg-background">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Permissions</TableHead>
                <TableHead className="text-right">Users</TableHead>
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
                    Loading…
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
                    No roles yet. Staff users cannot be added until one exists.
                  </TableCell>
                </TableRow>
              ) : (
                data.roles.map((role) => {
                  const locked = lockReason(role);
                  return (
                    <TableRow key={role.id}>
                      <TableCell className="font-medium">
                        {role.name}
                        {role.id === admin?.roleId ? (
                          <Badge variant="secondary" className="ml-2">
                            Your role
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
                            .join(" · ") || "No permissions"}
                        </p>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {role.permissions.length}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {role.userCount}
                      </TableCell>
                      {canWrite ? (
                        <TableCell className="text-right">
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
                                Edit
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-destructive hover:text-destructive"
                                onClick={() => setPendingDelete(role)}
                              >
                                Delete
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
            <AlertDialogTitle>Delete “{pendingDelete?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              This cannot be undone. A role that users still hold cannot be
              deleted — move them to another role first.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => pendingDelete && remove(pendingDelete)}
            >
              Delete role
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
          <DialogTitle>{role ? `Edit “${role.name}”` : "New role"}</DialogTitle>
          <DialogDescription>
            Viewing and editing are separate. Edit does nothing in this panel
            without View, so tick both. Changes apply to everyone holding the
            role straight away.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label className="text-xs">Name</Label>
            <Input
              value={name}
              autoFocus
              onChange={(e) => setName(e.target.value)}
              placeholder="Reservations agent"
            />
          </div>
          <div>
            <Label className="text-xs">Description</Label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Who this role is for"
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
                            You don&apos;t hold this yourself, so you can&apos;t
                            grant it.
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
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy || !name.trim()}>
            {busy ? "Saving…" : role ? "Save changes" : "Create role"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
