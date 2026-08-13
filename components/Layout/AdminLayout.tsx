import { getMe, logout as logoutApi } from "@/api/functions/auth.api";
import GlobalSearch from "@/components/Search/GlobalSearch";
import { Button } from "@/components/ui/button";
import { clearAuthToken } from "@/lib/functions/auth.lib";
import { LOCALE_LABELS, LOCALES } from "@/lib/i18n/dictionaries";
import { useT } from "@/lib/i18n/useT";
import { cn } from "@/lib/utils";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Bell,
  Building2,
  CalendarRange,
  FileText,
  LayoutDashboard,
  LogOut,
  MapPin,
  MessageSquare,
  Search,
  Settings,
  ShieldCheck,
  Ticket,
  Users,
  Wallet
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import type { TranslationKey } from "@/lib/i18n/dictionaries";

/**
 * Information architecture from guide §3, including its sub-levels.
 *
 * §3: "fixed sidebar, never collapsing more than one level" — so children are
 * exactly one deep and expand in place rather than nesting further.
 */
interface NavItem {
  href: string;
  key: TranslationKey;
  icon: typeof Ticket;
  children?: { href: string; label: string }[];
}

const NAV: NavItem[] = [
  { href: "/", key: "nav.dashboard", icon: LayoutDashboard },
  {
    href: "/bookings",
    key: "nav.bookings",
    icon: Ticket,
    children: [
      { href: "/bookings?queue=needs-action", label: "Needs action" },
      { href: "/bookings?queue=cash-pending", label: "Cash pending" },
      { href: "/bookings?queue=departing-soon", label: "Departing soon" },
      { href: "/bookings?queue=cancellations", label: "Cancellations" },
      { href: "/bookings?queue=all", label: "All orders" }
    ]
  },
  { href: "/enquiries", key: "nav.enquiries", icon: MessageSquare },
  // Where the business operates — everything the public search box offers.
  { href: "/locations", key: "nav.locations", icon: MapPin },
  {
    href: "/inventory",
    key: "nav.inventory",
    icon: CalendarRange,
    children: [
      { href: "/inventory?group=HOTEL", label: "Hotels" },
      { href: "/inventory?group=FLIGHT", label: "Flights" },
      { href: "/inventory?group=BUS", label: "Bus" },
      { href: "/inventory?group=CAR", label: "Cars" },
      { href: "/inventory?group=ACTIVITY", label: "Activities & Tours" },
      { href: "/inventory?group=PROPERTY", label: "Properties" }
    ]
  },
  { href: "/customers", key: "nav.customers", icon: Users },
  { href: "/payments", key: "nav.payments", icon: Wallet },
  { href: "/content", key: "nav.content", icon: Building2 },
  { href: "/notifications", key: "nav.notifications", icon: Bell },
  { href: "/settings", key: "nav.settings", icon: Settings },
  { href: "/security", key: "nav.security", icon: ShieldCheck },
  { href: "/audit-log", key: "nav.auditLog", icon: FileText }
];

export default function AdminLayout({
  children,
  title,
  description
}: {
  children: React.ReactNode;
  title: string;
  description?: string;
}) {
  const router = useRouter();
  const { t, locale, setLocale } = useT();
  const [searchOpen, setSearchOpen] = useState(false);

  const { data: admin } = useQuery({
    queryKey: ["admin", "me"],
    queryFn: getMe,
    staleTime: 5 * 60 * 1000
  });

  /** §13: Cmd/Ctrl+K global search from anywhere. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const { mutate: signOut, isPending } = useMutation({
    mutationFn: logoutApi,
    onSettled: () => {
      clearAuthToken();
      router.replace("/login");
    }
  });

  /** §13: unmissable banner distinguishing staging from production. */
  const env = process.env.NEXT_PUBLIC_ENV_LABEL;

  return (
    <div className="flex min-h-screen bg-muted/30">
      <GlobalSearch open={searchOpen} onOpenChange={setSearchOpen} />

      <aside className="sticky top-0 hidden h-screen w-[260px] shrink-0 flex-col border-r bg-background md:flex">
        <div className="flex h-16 items-center gap-2 border-b px-5">
          <div className="flex size-8 items-center justify-center rounded-md bg-foreground text-sm font-semibold text-background">
            T
          </div>
          <span className="font-semibold tracking-tight">Travel Admin</span>
        </div>

        <nav className="flex-1 overflow-y-auto p-3">
          {NAV.map(({ href, key, icon: Icon, children }) => {
            const active =
              href === "/"
                ? router.pathname === "/"
                : router.pathname.startsWith(href);
            // Children reveal themselves for the section you are already in —
            // no manual expand/collapse state to remember.
            const showChildren = active && children?.length;
            return (
              <div key={href}>
                <Link
                  href={href}
                  className={cn(
                    "mb-0.5 flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                    active
                      ? "bg-foreground font-medium text-background"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  <Icon className="size-4 shrink-0" />
                  {t(key)}
                </Link>
                {showChildren ? (
                  <div className="mb-1 ml-4 border-l pl-3">
                    {children!.map((c) => {
                      const childActive =
                        router.asPath === c.href ||
                        (c.href.includes("?") &&
                          router.asPath.endsWith(c.href.split("?")[1]));
                      return (
                        <Link
                          key={c.label}
                          href={c.href}
                          className={cn(
                            "block rounded px-2 py-1 text-[13px] transition-colors",
                            childActive
                              ? "font-medium text-foreground"
                              : "text-muted-foreground hover:text-foreground"
                          )}
                        >
                          {c.label}
                        </Link>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            );
          })}
        </nav>

        <div className="border-t p-3">
          {/* §2.3: English toggle alongside the French default. */}
          <div className="mb-3 flex gap-1">
            {LOCALES.map((l) => (
              <button
                key={l}
                onClick={() => setLocale(l)}
                className={cn(
                  "flex-1 rounded px-2 py-1 text-xs transition-colors",
                  locale === l
                    ? "bg-muted font-medium"
                    : "text-muted-foreground hover:bg-muted/50"
                )}
              >
                {LOCALE_LABELS[l]}
              </button>
            ))}
          </div>
          <div className="mb-2 px-2">
            <p className="truncate text-sm font-medium">{admin?.name}</p>
            <p className="truncate text-xs text-muted-foreground">
              {admin?.email}
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start gap-3 text-muted-foreground"
            disabled={isPending}
            onClick={() => signOut()}
          >
            <LogOut className="size-4" />
            {t("nav.signOut")}
          </Button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {env ? (
          <div className="bg-amber-400 px-4 py-1 text-center text-xs font-semibold text-amber-950">
            {env}
          </div>
        ) : null}

        <header className="sticky top-0 z-10 flex h-16 items-center justify-between gap-4 border-b bg-background/95 px-6 backdrop-blur">
          <div className="min-w-0">
            <h1 className="truncate text-lg font-semibold tracking-tight">
              {title}
            </h1>
            {description ? (
              <p className="truncate text-sm text-muted-foreground">
                {description}
              </p>
            ) : null}
          </div>
          <button
            onClick={() => setSearchOpen(true)}
            className="hidden shrink-0 items-center gap-2 rounded-md border px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted lg:flex"
          >
            <Search className="size-3.5" />
            {t("common.search")}
            <kbd className="rounded border bg-muted px-1 text-[10px]">⌘K</kbd>
          </button>
        </header>

        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
