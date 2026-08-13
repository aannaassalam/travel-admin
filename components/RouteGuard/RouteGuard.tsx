import { getMe } from "@/api/functions/auth.api";
import { clearAuthToken, getAuthToken } from "@/lib/functions/auth.lib";
import { useQuery } from "@tanstack/react-query";
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
    staleTime: 5 * 60 * 1000
  });

  useEffect(() => {
    if (publicRoute) return;
    if (!hasToken || isError) {
      clearAuthToken();
      router.replace(`/login?next=${encodeURIComponent(router.asPath)}`);
    }
  }, [publicRoute, hasToken, isError, router]);

  if (publicRoute) return <>{children}</>;

  // Render nothing until the session is confirmed, so protected content is
  // never briefly painted for someone who is about to be redirected out.
  if (!hasToken || isError || isLoading || !admin) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="size-6 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-foreground" />
          <p className="text-sm text-muted-foreground">Checking your session…</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
