// NEXT_PUBLIC_ prefix is required: this module is imported by the axios
// instance, which runs in the browser.
export const baseUrl = process.env.NEXT_PUBLIC_BASE_URL;

// This app talks to the admin surface only. /api/v1 is the customer API and is
// deliberately a different surface with different guards and DTOs (guide §2.1).
export const baseUrlApi = `${process.env.NEXT_PUBLIC_BASE_URL}/admin/v1`;
export const baseUrlMedia = process.env.NEXT_PUBLIC_BASE_URL;

export const mediaUrl = (url: string) => {
  return `${baseUrlMedia}/${url}`;
};

/**
 * Resolves a stored file URL for use in the browser.
 *
 * The local storage driver returns a path relative to the API host
 * (`/uploads/...`), which the browser would otherwise resolve against the
 * FRONTEND origin and 404. S3 or CloudFront return an absolute URL, which must
 * be passed through untouched — so switching drivers needs no change here.
 */
export const assetUrl = (url?: string) => {
  if (!url) return "";
  if (/^(https?:)?\/\//.test(url) || url.startsWith("data:")) return url;
  return `${baseUrl}${url.startsWith("/") ? "" : "/"}${url}`;
};

export const endpoints = {
  auth: {
    login: "/auth/login",
    logout: "/auth/logout",
    me: "/auth/me",
    stepUp: "/auth/step-up",
    password: "/auth/password",
    sessions: "/auth/sessions"
  },
  auditLogs: "/audit-logs"
};
