import {
  AssignableRoles,
  createUser,
  listAssignableRoles,
  listUsers,
  PanelUser,
  resetUserPassword,
  settle,
  TemporaryPassword,
  updateUser,
  UserRoleChoice
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
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
import { formatDateTime } from "@/lib/functions/format.lib";
import { useCan } from "@/lib/permissions";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

/**
 * The people who can sign in to this panel (not customers).
 *
 * There is no delete: a user is deactivated, because audit-log entries point at
 * them. Without users:write this page is read-only — no mutation control is
 * rendered and the assignable roles are never requested.
 */

// The role picker's value for the super-admin kind; every other value is the id
// of a role document.
const SUPER_ADMIN = "SUPER_ADMIN";

const toChoice = (value: string): UserRoleChoice =>
  value === SUPER_ADMIN
    ? { role: "SUPER_ADMIN" }
    : { role: "STAFF", roleId: value };

type Confirmation = {
  user: PanelUser;
  action: "deactivate" | "reactivate" | "reset";
};

const CONFIRM_COPY: Record<
  Confirmation["action"],
  { title: string; body: string; button: string }
> = {
  deactivate: {
    title: "Deactivate",
    body: "They can no longer sign in and their open sessions stop working. Nothing is deleted: their history stays in the audit log and the account can be reactivated.",
    button: "Deactivate"
  },
  reactivate: {
    title: "Reactivate",
    body: "They can sign in again, with the role they had.",
    button: "Reactivate"
  },
  reset: {
    title: "Reset the password of",
    body: "A new temporary password is generated and shown to you once. They must replace it the next time they sign in.",
    button: "Reset password"
  }
};

/** Held in component state only, and dropped when its dialog closes. */
type Secret = TemporaryPassword & { email: string };

export default function UsersPage() {
  const queryClient = useQueryClient();
  const { can, admin } = useCan();
  const { guard, dialog } = useStepUp();
  const canWrite = can("users:write");

  const [adding, setAdding] = useState(false);
  const [changingRole, setChangingRole] = useState<PanelUser | null>(null);
  const [confirming, setConfirming] = useState<Confirmation | null>(null);
  const [secret, setSecret] = useState<Secret | null>(null);

  const {
    data: users,
    isLoading,
    isError,
    refetch
  } = useQuery({
    queryKey: ["access", "users"],
    queryFn: listUsers
  });

  const { data: assignable } = useQuery({
    queryKey: ["access", "assignable-roles"],
    queryFn: listAssignableRoles,
    enabled: canWrite
  });

  const { mutate: run, isPending } = useMutation({
    // Wrapped: a stale step-up opens the password prompt and retries afterwards.
    // The action resolves to nothing, so a temporary password never sits in the
    // mutation cache.
    mutationFn: (action: () => Promise<void>) => guard(action),
    // settle() reports each outcome itself, so nothing is toasted twice.
    meta: { showToast: false }
  });

  // Roles show their user count, so that list is refreshed too.
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ["access"], refetchType: "all" });

  const add = (
    body: Parameters<typeof createUser>[0],
    fail: (message: string) => void
  ) =>
    run(
      settle(
        () => createUser(body),
        ({ user, ...issued }) => {
          setAdding(false);
          setSecret({ email: user.email, ...issued });
          refresh();
        },
        fail
      )
    );

  const changeRole = (
    user: PanelUser,
    value: string,
    fail: (message: string) => void
  ) =>
    run(
      settle(
        () => updateUser(user.id, toChoice(value)),
        ({ user: saved, temporaryPasswordCancelled }) => {
          setChangingRole(null);
          refresh();
          // Whoever issued the temporary password still knows it, and may not
          // have been allowed to grant this access — so it no longer works.
          if (temporaryPasswordCancelled) {
            toast.warning(
              `${saved.name} is now ${saved.roleName}. Their temporary password was cancelled: use Reset password to issue a new one.`,
              { duration: 12000 }
            );
          } else {
            toast.success(`${saved.name} is now ${saved.roleName}`);
          }
        },
        fail
      )
    );

  const confirmed = ({ user, action }: Confirmation) => {
    const fail = (message: string) => toast.error(message);
    if (action === "reset") {
      return run(
        settle(
          () => resetUserPassword(user.id),
          (issued) => {
            setSecret({ email: user.email, ...issued });
            refresh();
          },
          fail
        )
      );
    }
    run(
      settle(
        () => updateUser(user.id, { isActive: action === "reactivate" }),
        ({ user: saved }) => {
          refresh();
          toast.success(
            `${saved.name} ${saved.isActive ? "reactivated" : "deactivated"}`
          );
        },
        fail
      )
    );
  };

  // Mirrors the server, so no row offers an action it would refuse: not your
  // own account, never a break-glass account, a super admin only if you may
  // assign that kind, and staff only when their role is one you could hand out.
  const manageable = (u: PanelUser) => {
    if (!assignable || u.id === admin?.id) return false;
    if (u.role === "BREAK_GLASS") return false;
    // The server lets a super admin act on every other account.
    if (assignable.canAssignSuperAdmin) return true;
    // Staff: a role you could hand out, or one that no longer exists (the
    // server sends an empty roleName and treats it as no permissions).
    return (
      u.role === "STAFF" &&
      (!u.roleId || !u.roleName || assignable.roles.some((r) => r.id === u.roleId))
    );
  };

  const columns = canWrite ? 5 : 4;

  return (
    <AdminLayout title="Users" description="Who can sign in to this panel">
      {dialog}
      <div className="flex flex-col gap-4">
        {canWrite ? (
          <div className="flex justify-end">
            <Button size="sm" onClick={() => setAdding(true)}>
              Add user
            </Button>
          </div>
        ) : null}

        <div className="rounded-lg border bg-background">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last sign-in</TableHead>
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
              ) : !users?.length ? (
                <TableRow>
                  <TableCell
                    colSpan={columns}
                    className="py-10 text-center text-sm text-muted-foreground"
                  >
                    No users.
                  </TableCell>
                </TableRow>
              ) : (
                users.map((u) => {
                  const self = u.id === admin?.id;
                  return (
                    <TableRow key={u.id}>
                      <TableCell>
                        <p className="font-medium">
                          {u.name}
                          {self ? (
                            <Badge variant="secondary" className="ml-2">
                              You
                            </Badge>
                          ) : null}
                        </p>
                        <p className="text-sm text-muted-foreground">{u.email}</p>
                      </TableCell>
                      <TableCell>
                        {/* The kind comes from the account, not from the role's
                            free-text name, so a staff role cannot pass itself
                            off as a super admin by what it is called. */}
                        {u.role === "STAFF" ? (
                          u.roleName || (
                            <span className="text-muted-foreground">
                              No role (no access)
                            </span>
                          )
                        ) : (
                          <Badge variant="secondary">{u.roleName}</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          <Badge
                            variant="secondary"
                            className={
                              u.isActive
                                ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                                : "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                            }
                          >
                            {u.isActive ? "Active" : "Deactivated"}
                          </Badge>
                          {u.mustChangePassword ? (
                            <Badge
                              variant="secondary"
                              className="bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                            >
                              Must change password
                            </Badge>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {u.lastLoginAt ? formatDateTime(u.lastLoginAt) : "Never"}
                      </TableCell>
                      {canWrite ? (
                        <TableCell className="text-right">
                          {manageable(u) ? (
                            // One menu, not three buttons: three across pushed
                            // the column off the right edge of a laptop screen.
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="outline" size="sm">
                                  Manage
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem
                                  onSelect={() => setChangingRole(u)}
                                >
                                  Change role
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onSelect={() =>
                                    setConfirming({ user: u, action: "reset" })
                                  }
                                >
                                  Reset password
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onSelect={() =>
                                    setConfirming({
                                      user: u,
                                      action: u.isActive
                                        ? "deactivate"
                                        : "reactivate"
                                    })
                                  }
                                >
                                  {u.isActive ? "Deactivate" : "Reactivate"}
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          ) : null}
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

      {adding ? (
        <AddUserDialog
          assignable={assignable}
          busy={isPending}
          onSubmit={add}
          onClose={() => setAdding(false)}
        />
      ) : null}

      {changingRole ? (
        <ChangeRoleDialog
          user={changingRole}
          assignable={assignable}
          busy={isPending}
          onSubmit={changeRole}
          onClose={() => setChangingRole(null)}
        />
      ) : null}

      <AlertDialog
        open={Boolean(confirming)}
        onOpenChange={(open) => !open && setConfirming(null)}
      >
        {confirming ? (
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {CONFIRM_COPY[confirming.action].title} {confirming.user.name}?
              </AlertDialogTitle>
              <AlertDialogDescription>
                {CONFIRM_COPY[confirming.action].body}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => confirmed(confirming)}>
                {CONFIRM_COPY[confirming.action].button}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        ) : null}
      </AlertDialog>

      {secret ? (
        <TemporaryPasswordDialog
          secret={secret}
          onClose={() => setSecret(null)}
        />
      ) : null}
    </AdminLayout>
  );
}

/** Only roles the server says this admin may assign are offered. */
function RoleSelect({
  value,
  onChange,
  assignable
}: {
  value: string;
  onChange: (value: string) => void;
  assignable?: AssignableRoles;
}) {
  return (
    <select
      required
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-9 w-full rounded-md border bg-transparent px-3 text-sm"
    >
      <option value="">Select…</option>
      {assignable?.roles.map((r) => (
        <option key={r.id} value={r.id}>
          {r.name}
        </option>
      ))}
      {assignable?.canAssignSuperAdmin ? (
        <option value={SUPER_ADMIN}>Super admin (every permission)</option>
      ) : null}
    </select>
  );
}

function FormError({ message }: { message: string | null }) {
  return message ? (
    <p
      role="alert"
      className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
    >
      {message}
    </p>
  ) : null;
}

function AddUserDialog({
  assignable,
  busy,
  onSubmit,
  onClose
}: {
  assignable?: AssignableRoles;
  busy: boolean;
  onSubmit: (
    body: Parameters<typeof createUser>[0],
    fail: (message: string) => void
  ) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState("");
  const [error, setError] = useState<string | null>(null);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add user</DialogTitle>
          <DialogDescription>
            A temporary password is generated for them and shown to you once.
            They must replace it the first time they sign in.
          </DialogDescription>
        </DialogHeader>
        {/* A real form: the browser checks required fields and the email shape
            before anything is sent. The server validates again. */}
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            onSubmit(
              {
                name: name.trim(),
                email: email.trim(),
                ...(phone.trim() && { phone: phone.trim() }),
                ...toChoice(role)
              },
              setError
            );
          }}
        >
          <div>
            <Label className="text-xs">Name</Label>
            <Input
              required
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div>
            <Label className="text-xs">Email</Label>
            <Input
              required
              type="email"
              autoComplete="off"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div>
            <Label className="text-xs">Phone (optional)</Label>
            <Input
              type="tel"
              placeholder="+243812345678"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>
          <div>
            <Label className="text-xs">Role</Label>
            <RoleSelect value={role} onChange={setRole} assignable={assignable} />
          </div>
          <FormError message={error} />
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "Adding…" : "Add user"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ChangeRoleDialog({
  user,
  assignable,
  busy,
  onSubmit,
  onClose
}: {
  user: PanelUser;
  assignable?: AssignableRoles;
  busy: boolean;
  onSubmit: (
    user: PanelUser,
    value: string,
    fail: (message: string) => void
  ) => void;
  onClose: () => void;
}) {
  const current =
    user.role === "SUPER_ADMIN" ? SUPER_ADMIN : (user.roleId ?? "");
  const [role, setRole] = useState(current);
  const [error, setError] = useState<string | null>(null);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Change role for {user.name}</DialogTitle>
          <DialogDescription>
            Currently {user.roleName}. The new role replaces it entirely and
            applies straight away.
          </DialogDescription>
        </DialogHeader>
        <div>
          <Label className="text-xs">New role</Label>
          <RoleSelect value={role} onChange={setRole} assignable={assignable} />
        </div>
        <FormError message={error} />
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={busy || !role || role === current}
            onClick={() => {
              setError(null);
              onSubmit(user, role, setError);
            }}
          >
            {busy ? "Saving…" : "Change role"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * The one and only time a temporary password is visible. It is rendered from
 * component state and goes nowhere else — not a toast, not storage, not the
 * URL, not the console.
 */
function TemporaryPasswordDialog({
  secret,
  onClose
}: {
  secret: Secret;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(secret.temporaryPassword);
      setCopied(true);
    } catch {
      // Also lands here when the browser offers no clipboard (plain http).
      toast.error("Could not copy. Select the password and copy it by hand.");
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      {/* A stray click outside must not throw away a password that cannot be
          shown again. */}
      <DialogContent
        showCloseButton={false}
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Temporary password</DialogTitle>
          <DialogDescription>
            For {secret.email}. It will not be shown again, works until{" "}
            {formatDateTime(secret.expiresAt)}, and must be replaced the first
            time they sign in.
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2">
          <code className="flex-1 select-all break-all rounded-md border bg-muted px-3 py-2 font-mono text-sm">
            {secret.temporaryPassword}
          </code>
          <Button variant="outline" size="sm" onClick={copy}>
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          {secret.emailed
            ? "It was also emailed to them."
            : "It was not emailed. Give it to them yourself, in person or by phone."}
        </p>
        <DialogFooter>
          <Button onClick={onClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
