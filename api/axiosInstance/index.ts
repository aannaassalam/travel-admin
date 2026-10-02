import axios from "axios";
import { parseCookies } from "nookies";
import { clearAuthToken, TOKEN_COOKIE } from "@/lib/functions/auth.lib";
import { baseUrlApi } from "../endpoints";

const axiosInstance = axios.create({
  baseURL: baseUrlApi
});

axiosInstance.interceptors.request.use((config) => {
  const token = parseCookies()[TOKEN_COOKIE];
  if (token && !!config.headers) {
    config.headers["Authorization"] = `Bearer ${token}`;
  }
  // The API also sets an httpOnly session cookie; sending credentials keeps the
  // two in step, so a page load that has the cookie but not yet the header
  // still authenticates.
  config.withCredentials = true;
  return config;
});

/**
 * Sign out ONLY when the session is actually over.
 *
 * The API answers 401 for two very different things: "this session is dead"
 * and "the password you just typed is wrong". Treating both as a logout meant
 * one typo in the step-up or change-password dialog ended the whole session —
 * which is what "it keeps logging me out" turned out to be. The server now
 * tags the first kind with `code: SESSION_INVALID`, and only that signs out.
 *
 * `replace` rather than `push` so the dead page doesn't sit in history, and the
 * current path rides along so they land back where they were.
 */
const SESSION_INVALID = "SESSION_INVALID";

axiosInstance.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error?.response?.status;
    const code = error?.response?.data?.code;
    // Older builds of the API send no code; a bare 401 is still a dead session.
    const sessionOver = status === 401 && (code === SESSION_INVALID || code === undefined);
    if (sessionOver && typeof window !== "undefined") {
      clearAuthToken();
      if (!window.location.pathname.startsWith("/login")) {
        // Keep the query string too, so they land back on the exact view —
        // pathname alone drops filters, the queue tab, the ?days period, etc.
        const here = window.location.pathname + window.location.search;
        window.location.replace(`/login?next=${encodeURIComponent(here)}`);
      }
    }
    return Promise.reject(error);
  }
);

export default axiosInstance;
