import axiosInstance from "@/api/axiosInstance";
import { AxiosError } from "axios";

/** Roles and admin-panel users (not customers) on the /admin/v1 surface. */

// --- Roles ------------------------------------------------------------------

export interface Role {
  id: string;
  name: string;
  description: string;
  permissions: string[];
  userCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface RoleInput {
  name: string;
  description?: string;
  permissions: string[];
}

export const listRoles = async () =>
  (await axiosInstance.get<{ roles: Role[]; catalogue: string[] }>("/roles"))
    .data;

/** Step-up gated, like every mutation in this file. */
export const createRole = async (body: RoleInput) =>
  (await axiosInstance.post<{ role: Role }>("/roles", body)).data.role;

export const updateRole = async (id: string, body: Partial<RoleInput>) =>
  (await axiosInstance.patch<{ role: Role }>(`/roles/${id}`, body)).data.role;

/** 409 ROLE_IN_USE while any user still holds the role. */
export const deleteRole = async (id: string) =>
  (await axiosInstance.delete(`/roles/${id}`)).data;

// --- Users ------------------------------------------------------------------

export interface PanelUser {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  /** The account kind: SUPER_ADMIN, BREAK_GLASS or STAFF. */
  role: string;
  roleId: string | null;
  roleName: string;
  isActive: boolean;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

/** What the caller may hand out — the server has already filtered it. */
export interface AssignableRoles {
  roles: { id: string; name: string; permissions: string[] }[];
  canAssignSuperAdmin: boolean;
}

/**
 * `temporaryPassword` is returned exactly once. Show it, then drop it: it must
 * not reach a log, a toast, storage, the URL or the query cache.
 */
export interface TemporaryPassword {
  temporaryPassword: string;
  /** After this it no longer signs in and has to be reset again. */
  expiresAt: string;
  emailed: boolean;
}

export type UserRoleChoice =
  | { role: "SUPER_ADMIN" }
  | { role: "STAFF"; roleId: string };

export const listUsers = async () =>
  (await axiosInstance.get<{ users: PanelUser[] }>("/users")).data.users;

export const listAssignableRoles = async () =>
  (await axiosInstance.get<AssignableRoles>("/users/assignable-roles")).data;

export const createUser = async (
  body: { name: string; email: string; phone?: string } & UserRoleChoice
) =>
  (
    await axiosInstance.post<{ user: PanelUser } & TemporaryPassword>(
      "/users",
      body
    )
  ).data;

/** There is no delete: deactivate with `isActive: false` (audit entries point at users). */
export const updateUser = async (
  id: string,
  body: { name?: string; phone?: string; isActive?: boolean } | UserRoleChoice
) =>
  (
    await axiosInstance.patch<{
      user: PanelUser;
      /** Their access changed while still on a temporary password: reset it. */
      temporaryPasswordCancelled?: boolean;
    }>(`/users/${id}`, body)
  ).data;

export const resetUserPassword = async (id: string) =>
  (await axiosInstance.post<TemporaryPassword>(`/users/${id}/reset-password`, {}))
    .data;

// --- Refusals ---------------------------------------------------------------

type ApiError = AxiosError<{ message?: string; code?: string }>;

const REFUSALS: Record<string, string> = {
  PASSWORD_CHANGE_REQUIRED: "Change your temporary password first.",
  SELF_MODIFY: "You can't change your own account here.",
  FORBIDDEN_TARGET: "You aren't allowed to manage this user.",
  ROLE_EXCEEDS_GRANTOR:
    "That reaches beyond your own permissions, so you can't grant or change it.",
  OWN_ROLE: "You can't change the role you hold yourself.",
  LAST_SUPER_ADMIN:
    "This is the last active super admin. Add another one before changing this account.",
  ROLE_IN_USE:
    "This role is still assigned to users. Move them to another role first.",
  EMAIL_TAKEN: "A user with this email already exists.",
  ROLE_NAME_TAKEN: "A role with this name already exists."
};

export const accessErrorMessage = (err: unknown) => {
  const data = (err as ApiError)?.response?.data;
  return (
    REFUSALS[data?.code ?? ""] ??
    data?.message ??
    "That didn't go through. Please try again."
  );
};

/** The one 403 that re-typing the password fixes. */
const isStepUpRequired = (err: unknown) => {
  const res = (err as ApiError)?.response;
  return res?.status === 403 && res.data?.code === "STEP_UP_REQUIRED";
};

/**
 * Wraps a step-up gated call for useStepUp's guard().
 *
 * guard() reads EVERY 403 as "ask for the password" and discards whatever its
 * retry returns. So the call reports its own outcome: `done` runs on whichever
 * attempt lands — a temporary password returned by the retry is not lost — and
 * any refusal that is not about step-up goes to `fail` instead of raising a
 * password prompt that could never succeed.
 */
export const settle =
  <T>(
    call: () => Promise<T>,
    done: (result: T) => void,
    fail: (message: string) => void
  ) =>
  async () => {
    try {
      done(await call());
    } catch (err) {
      if (isStepUpRequired(err)) throw err;
      fail(accessErrorMessage(err));
    }
  };
