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
import { deleteUser } from "@/api/functions/admin.api";
import DeleteButton from "@/components/DeleteButton";
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
import type { TranslationKey } from "@/lib/i18n/messages";
import { useT } from "@/lib/i18n/useT";
import { useCan } from "@/lib/permissions";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

/**
 * The people who can sign in to this panel (not customers).
 *
 * A user is switched off by deactivating: the account is kept and can come
 * back. Deleting one for good is users:delete, offered on the rows this admin
 * may manage. Without users:write this page is read-only — no mutation control
 * is rendered and the assignable roles are never requested.
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

/** Keys; `title` takes the user's {name}. */
const CONFIRM_COPY: Record<
  Confirmation["action"],
  { title: TranslationKey; body: TranslationKey; button: TranslationKey }
> = {
  deactivate: {
    title: "sys.users.deactivateTitle",
    body: "sys.users.deactivateBody",
    button: "sys.users.deactivate"
  },
  reactivate: {
    title: "sys.users.reactivateTitle",
    body: "sys.users.reactivateBody",
    button: "sys.users.reactivate"
  },
  reset: {
    title: "sys.users.resetTitle",
    body: "sys.users.resetBody",
    button: "sys.users.resetPassword"
  }
};

/** Held in component state only, and dropped when its dialog closes. */
type Secret = TemporaryPassword & { email: string };

export default function UsersPage() {
  const queryClient = useQueryClient();
  const { t } = useT();
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
  // Newest first, as the server lists them, until a column heading is pressed.
  const [sort, setSort] = useState<Sort>("");
  const head = { sort, onSort: setSort };
  const { rows, pager } = usePaged(
    sortRows(users ?? [], sort, {
      user: (u) => u.name,
      role: (u) => u.roleName,
      // Active first, going up.
      status: (u) => !u.isActive,
      lastSignIn: (u) => (u.lastLoginAt ? Date.parse(u.lastLoginAt) : null)
    }),
    sort
  );

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
              t("sys.users.roleChangedCancelled", { name: saved.name, role: saved.roleName }),
              { duration: 12000 }
            );
          } else {
            toast.success(t("sys.users.roleChanged", { name: saved.name, role: saved.roleName }));
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
            t(saved.isActive ? "sys.users.reactivated" : "sys.users.deactivated", {
              name: saved.name
            })
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
    <AdminLayout title={t("nav.users")} description={t("sys.users.description")}>
      {dialog}
      <div className="flex flex-col gap-4">
        {canWrite ? (
          <div className="flex justify-end">
            <Button size="sm" onClick={() => setAdding(true)}>
              {t("sys.users.add")}
            </Button>
          </div>
        ) : null}

        <div className="rounded-lg border bg-background">
          <Table>
            <TableHeader>
              <TableRow>
                <SortHead column="user" {...head}>
                  {t("sys.users.colUser")}
                </SortHead>
                <SortHead column="role" {...head}>
                  {t("sys.users.colRole")}
                </SortHead>
                <SortHead column="status" {...head}>
                  {t("common.status")}
                </SortHead>
                <SortHead column="lastSignIn" {...head}>
                  {t("sys.users.colLastSignIn")}
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
              ) : !users?.length ? (
                <TableRow>
                  <TableCell
                    colSpan={columns}
                    className="py-10 text-center text-sm text-muted-foreground"
                  >
                    {t("sys.users.none")}
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((u) => {
                  const self = u.id === admin?.id;
                  return (
                    <TableRow key={u.id}>
                      <TableCell>
                        <p className="font-medium">
                          {u.name}
                          {self ? (
                            <Badge variant="secondary" className="ms-2">
                              {t("sys.users.you")}
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
                              {t("sys.users.noRole")}
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
                            {u.isActive ? t("sys.users.active") : t("sys.users.inactive")}
                          </Badge>
                          {u.mustChangePassword ? (
                            <Badge
                              variant="secondary"
                              className="bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                            >
                              {t("sys.users.mustChange")}
                            </Badge>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {u.lastLoginAt ? formatDateTime(u.lastLoginAt) : t("sys.users.never")}
                      </TableCell>
                      {canWrite ? (
                        <TableCell className="text-end">
                          {manageable(u) ? (
                            <div className="flex items-center justify-end gap-1">
                              {/* One menu, not three buttons: three across
                                  pushed the column off the right edge of a
                                  laptop screen. */}
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="outline" size="sm">
                                    {t("sys.users.manage")}
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem
                                    onSelect={() => setChangingRole(u)}
                                  >
                                    {t("sys.users.changeRole")}
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onSelect={() =>
                                      setConfirming({
                                        user: u,
                                        action: "reset"
                                      })
                                    }
                                  >
                                    {t("sys.users.resetPassword")}
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
                                    {u.isActive
                                      ? t("sys.users.deactivate")
                                      : t("sys.users.reactivate")}
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                              <DeleteButton
                                permission="users:delete"
                                what={t("sys.users.deleteWhat", { name: u.name })}
                                consequence={t("sys.users.deleteConsequence")}
                                onDelete={() => deleteUser(u.id)}
                                onDeleted={refresh}
                              />
                            </div>
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

        <Pager {...pager} noun={t("sys.users.noun")} plural={t("sys.users.nouns")} />
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
                {t(CONFIRM_COPY[confirming.action].title, { name: confirming.user.name })}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {t(CONFIRM_COPY[confirming.action].body)}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
              <AlertDialogAction onClick={() => confirmed(confirming)}>
                {t(CONFIRM_COPY[confirming.action].button)}
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
  const { t } = useT();
  return (
    <select
      required
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-9 w-full rounded-md border bg-transparent px-3 text-sm"
    >
      <option value="">{t("sys.users.select")}</option>
      {assignable?.roles.map((r) => (
        <option key={r.id} value={r.id}>
          {r.name}
        </option>
      ))}
      {assignable?.canAssignSuperAdmin ? (
        <option value={SUPER_ADMIN}>{t("sys.users.superAdmin")}</option>
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
  const { t } = useT();

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("sys.users.add")}</DialogTitle>
          <DialogDescription>{t("sys.users.addDescription")}</DialogDescription>
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
            <Label className="text-xs">{t("common.name")}</Label>
            <Input
              required
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div>
            <Label className="text-xs">{t("common.email")}</Label>
            <Input
              required
              type="email"
              autoComplete="off"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div>
            <Label className="text-xs">{t("sys.users.phoneOptional")}</Label>
            <Input
              type="tel"
              dir="ltr"
              placeholder="+243812345678"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>
          <div>
            <Label className="text-xs">{t("sys.users.colRole")}</Label>
            <RoleSelect value={role} onChange={setRole} assignable={assignable} />
          </div>
          <FormError message={error} />
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? t("sys.users.adding") : t("sys.users.add")}
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
  const { t } = useT();

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("sys.users.changeRoleFor", { name: user.name })}</DialogTitle>
          <DialogDescription>
            {t("sys.users.currently", { role: user.roleName })}
          </DialogDescription>
        </DialogHeader>
        <div>
          <Label className="text-xs">{t("sys.roles.new")}</Label>
          <RoleSelect value={role} onChange={setRole} assignable={assignable} />
        </div>
        <FormError message={error} />
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button
            disabled={busy || !role || role === current}
            onClick={() => {
              setError(null);
              onSubmit(user, role, setError);
            }}
          >
            {busy ? t("sys.saving") : t("sys.users.changeRole")}
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
  const { t } = useT();

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(secret.temporaryPassword);
      setCopied(true);
    } catch {
      // Also lands here when the browser offers no clipboard (plain http).
      toast.error(t("sys.users.copyFailed"));
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
          <DialogTitle>{t("sys.users.tempPassword")}</DialogTitle>
          <DialogDescription>
            {t("sys.users.tempFor", {
              email: secret.email,
              date: formatDateTime(secret.expiresAt)
            })}
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2">
          {/* Left to right in every language, so it is read and copied in order. */}
          <code dir="ltr" className="flex-1 select-all break-all rounded-md border bg-muted px-3 py-2 font-mono text-sm">
            {secret.temporaryPassword}
          </code>
          <Button variant="outline" size="sm" onClick={copy}>
            {copied ? t("sys.users.copied") : t("sys.users.copy")}
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          {secret.emailed ? t("sys.users.emailed") : t("sys.users.notEmailed")}
        </p>
        <DialogFooter>
          <Button onClick={onClose}>{t("sys.users.done")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
