import axiosInstance from "@/api/axiosInstance";
import { endpoints } from "@/api/endpoints";

export interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: string;
  isActive: boolean;
  createdAt: string;
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
