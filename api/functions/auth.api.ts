import axiosInstance from "@/api/axiosInstance";
import { endpoints } from "@/api/endpoints";

export interface AdminUser {
  id: string;
  email: string;
  name: string;
  /** The account kind: SUPER_ADMIN, BREAK_GLASS or STAFF. */
  role: string;
  isActive: boolean;
  createdAt: string;
  /** Effective permissions — the full catalogue for SUPER_ADMIN / BREAK_GLASS. */
  permissions: string[];
  roleId: string | null;
  roleName: string;
  /** True while signed in with a temporary password: only /auth/* answers. */
  mustChangePassword: boolean;
}

export interface LoginResponse {
  token: string;
  expiresIn: number;
  admin: AdminUser;
}

export const login = async (payload: { email: string; password: string }) => {
  const { data } = await axiosInstance.post<LoginResponse>(
    endpoints.auth.login,
    payload
  );
  return data;
};

export const getMe = async () => {
  const { data } = await axiosInstance.get<{ admin: AdminUser }>(
    endpoints.auth.me
  );
  return data.admin;
};

export const logout = async () => {
  const { data } = await axiosInstance.post(endpoints.auth.logout, {});
  return data;
};

/** Signs out every session, including this one — send the user to /login. */
export const changePassword = async (payload: {
  currentPassword: string;
  newPassword: string;
}) => {
  const { data } = await axiosInstance.patch(endpoints.auth.password, payload);
  return data;
};
