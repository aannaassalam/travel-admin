import { getMe } from "@/api/functions/auth.api";
import AdminLayout, { NAV, useSignOut } from "@/components/Layout/AdminLayout";
import { Button } from "@/components/ui/button";
import { clearAuthToken, getAuthToken } from "@/lib/functions/auth.lib";
import { canOpenRoute } from "@/lib/permissions";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/router";
import { useEffect } from "react";

/**
 * Routes reachable without a session. Everything else is protected — the guard
 * is deny-by-default, so a new page is guarded the moment it is created rather
 * than when someone remembers to wrap it.
 */
export const PUBLIC_ROUTES = ["/login"];

const isPublic = (pathname: string) =>
  PUBLIC_ROUTES.some((r) => pathname === r || pathname.startsWith(`${r}/`));

export default function RouteGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = router.pathname;
  const publicRoute = isPublic(pathname);
  const hasToken = Boolean(getAuthToken());
  const queryClient = useQueryClient();

  /**
   * A cookie only proves a token exists, not that it is still valid — it may be
   * expired, revoked from the Security screen, or invalidated by a password
   * change. So the token is verified against the server before anything renders.
   */
  const { data: admin, isLoading, isError } = useQuery({
    queryKey: ["admin", "me"],
    queryFn: getMe,
    enabled: hasToken && !publicRoute,
    retry: false,
    /**
     * Re-read whenever the tab is looked at again, and once a minute while it
     * stays open. Permissions live on the server and can change under an open
     * tab; without this the sidebar and the controls kept showing a role the
     * user no longer held until they happened to reload.
     */
    staleTime: 0,
    refetchOnWindowFocus: true,
    refetchInterval: 60 * 1000
  });

  /**
   * Only a failed FIRST check ends the session here. Once an admin is loaded,
   * a background refresh that fails (a dropped connection) must not sign them
   * out; a session that is really over is reported by the API as a 401, which
   * the axios interceptor turns into the sign-out.
   */
  const sessionFailed = isError && !admin;

  useEffect(() => {
    if (publicRoute) return;
    if (!hasToken || sessionFailed) {
      clearAuthToken();
      // Cleared after leaving, so nothing still mounted refetches with a dead
      // session — and the next person to sign in here starts from nothing.
      router
        .replace(`/login?next=${encodeURIComponent(router.asPath)}`)
        .then(() => queryClient.clear());
    }
  }, [publicRoute, hasToken, sessionFailed, router, queryClient]);

  /**
   * Where this session has to go instead of the page it asked for, if anywhere.
   *
   * A temporary password must be replaced before anything else answers, so that
   * comes first. Otherwise only "/" redirects — to the first page in nav order
   * this admin may open — because it is where sign-in lands everyone. With
   * nothing to open there is nowhere to send them, so nothing redirects and the
   * no-access state below is shown instead of a loop.
   */
  let redirectTo: string | undefined;
  if (admin && !publicRoute) {
    if (admin.mustChangePassword) {
      if (pathname !== "/account") redirectTo = "/account";
    } else if (pathname === "/" && !canOpenRoute(admin.permissions, "/")) {
      redirectTo = NAV.find((n) => canOpenRoute(admin.permissions, n.href))?.href;
    }
  }

  useEffect(() => {
    if (redirectTo) router.replace(redirectTo);
  }, [redirectTo, router]);

  if (publicRoute) return <>{children}</>;

  // Render nothing until the session is confirmed, so protected content is
  // never briefly painted for someone who is about to be redirected out.
  if (!hasToken || sessionFailed || isLoading || !admin || redirectTo) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="size-6 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-foreground" />
          <p className="text-sm text-muted-foreground">Checking your session…</p>
        </div>
      </div>
    );
  }

  // Deny-by-default: a page with no entry in ROUTE_PERMISSIONS is refused too.
  // The page is not rendered at all, so none of its queries fire.
  if (!canOpenRoute(admin.permissions, pathname)) return <NoAccess />;

  return <>{children}</>;
}

/** Inside the layout, so the pages this admin CAN open stay one click away. */
function NoAccess() {
  const { signOut, isPending } = useSignOut();
  return (
    <AdminLayout title="No access">
      <div className="mx-auto flex max-w-md flex-col items-center gap-3 py-16 text-center">
        <h2 className="text-lg font-semibold tracking-tight">
          You don&apos;t have access to this page
        </h2>
        <p className="text-sm text-muted-foreground">
          Your role doesn&apos;t include it. If you need it, ask an administrator
          to change your role.
        </p>
        {/* The sidebar is hidden on small screens; signing out must not be. */}
        <Button
          variant="outline"
          size="sm"
          disabled={isPending}
          onClick={() => signOut()}
        >
          Sign out
        </Button>
      </div>
    </AdminLayout>
  );
}
