import { destroyCookie, parseCookies, setCookie } from "nookies";
import type { GetServerSidePropsContext } from "next";

/**
 * Admin session token storage.
 *
 * A cookie rather than localStorage so getServerSideProps can read it, which is
 * what lets a protected page redirect before it ever renders.
 */
export const TOKEN_COOKIE = "token";

/**
 * Only used if the server does not tell us. The real lifetime comes from the
 * login response's `expiresIn`, so this file no longer has to be kept in step
 * with the backend's session policy by hand — the previous hardcoded 8h would
 * have silently expired the cookie early the moment the server was retuned.
 */
const FALLBACK_MAX_AGE = 7 * 24 * 60 * 60;

export const setAuthToken = (token: string, expiresInSeconds?: number) => {
  setCookie(null, TOKEN_COOKIE, token, {
    path: "/",
    maxAge: expiresInSeconds || FALLBACK_MAX_AGE,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production"
  });
};

export const clearAuthToken = () => {
  destroyCookie(null, TOKEN_COOKIE, { path: "/" });
};

export const getAuthToken = (ctx?: GetServerSidePropsContext) =>
  parseCookies(ctx)[TOKEN_COOKIE];
