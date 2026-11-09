import { getMe } from "@/api/functions/auth.api";
import { tr, type TranslationKey } from "@/lib/i18n/messages";
import { useQuery } from "@tanstack/react-query";

/**
 * Roles & permissions — the client's single source of truth.
 *
 * The API is the security boundary. Everything here only decides what the UI
 * shows, so nobody sees a control they cannot use or lands on a page that would
 * just fail. It is still deny-by-default: no entry means no access.
 *
 * A write permission does NOT imply the matching read; each is checked alone.
 */

/**
 * A permission and its words in the panel's language, read when shown: the
 * action ("View", "Edit"…) from `perm.action.<read|write|delete|export>`, the
 * description from `perm.<key>` (lib/i18n/dictionaries.ts).
 */
const perm = <K extends `${string}:${string}`>(key: K) => ({
  key,
  get label() {
    return tr(`perm.action.${key.split(":")[1]}` as TranslationKey);
  },
  get description() {
    return tr(`perm.${key}` as TranslationKey);
  }
});

/** A group of the role editor, named by `perm.group.<id>`. */
const group = <P extends readonly ReturnType<typeof perm>[]>(id: string, permissions: P) => ({
  get label() {
    return tr(`perm.group.${id}` as TranslationKey);
  },
  permissions
});

/**
 * The catalogue, grouped for the role editor. `Permission` is derived from this
 * list, so a permission cannot exist without a label and a place in the matrix.
 */
export const PERMISSION_GROUPS = [
  group("dashboard", [perm("dashboard:read")]),
  group("orders", [perm("orders:read"), perm("orders:write")]),
  group("enquiries", [perm("enquiries:read"), perm("enquiries:write"), perm("enquiries:delete")]),
  group("inventory", [perm("inventory:read"), perm("inventory:write"), perm("inventory:delete")]),
  group("customers", [
    perm("customers:read"),
    perm("customers:write"),
    perm("customers:delete"),
    perm("customers:export")
  ]),
  group("payments", [perm("payments:read")]),
  group("content", [perm("content:read"), perm("content:write"), perm("content:delete")]),
  group("notifications", [
    perm("notifications:read"),
    perm("notifications:write"),
    perm("notifications:delete")
  ]),
  group("settings", [perm("settings:read"), perm("settings:write")]),
  group("audit", [perm("audit:read")]),
  group("users", [perm("users:read"), perm("users:write"), perm("users:delete")]),
  group("roles", [perm("roles:read"), perm("roles:write")])
] as const;

export type Permission =
  (typeof PERMISSION_GROUPS)[number]["permissions"][number]["key"];

/**
 * What each page needs before it may be opened, keyed by the Next pathname
 * PATTERN (`router.pathname`, e.g. "/bookings/[id]"). `null` means any signed-in
 * admin. A page with no entry here is a forbidden page, so adding a file under
 * pages/ without adding it here fails closed.
 *
 * /login is not listed: it is public and never reaches this check.
 */
export const ROUTE_PERMISSIONS: Record<string, Permission | null> = {
  "/": "dashboard:read",
  "/bookings": "orders:read",
  "/bookings/[id]": "orders:read",
  "/enquiries": "enquiries:read",
  "/locations": "inventory:read",
  "/suppliers": "inventory:read",
  "/inventory": "inventory:read",
  // The hotel's page (details + rooms tabs); the old rooms address sends there.
  "/inventory/[id]": "inventory:read",
  "/inventory/hotel/[id]": "inventory:read",
  "/inventory/listing/[id]": "inventory:read",
  "/inventory/restaurant/[id]": "inventory:read",
  "/vehicle-sales": "inventory:read",
  "/vehicle-sales/vehicles/[id]": "inventory:read",
  "/vehicle-sales/parkings": "inventory:read",
  "/vehicle-sales/parkings/[id]": "inventory:read",
  "/vehicle-sales/catalogue": "inventory:read",
  "/duty-free/shops": "inventory:read",
  "/duty-free/shops/[id]": "inventory:read",
  "/duty-free/catalogue": "inventory:read",
  // E-Visa: applications are bookings work; countries and types are inventory.
  "/e-visa/applications": "orders:read",
  "/e-visa/applications/[id]": "orders:read",
  "/e-visa/countries": "inventory:read",
  "/e-visa/countries/[id]": "inventory:read",
  "/e-visa/types": "inventory:read",
  // Transfers: rides are bookings; the fleet (drivers, vehicles, categories,
  // places) is inventory. No permissions of their own.
  "/transfers": "orders:read",
  "/transfers/rides/[id]": "orders:read",
  "/transfers/drivers": "inventory:read",
  "/transfers/vehicles": "inventory:read",
  "/transfers/categories": "inventory:read",
  "/transfers/places": "inventory:read",
  "/customers": "customers:read",
  "/customers/[id]": "customers:read",
  "/payments": "payments:read",
  "/content": "content:read",
  "/partners": "content:read",
  "/reviews": "content:read",
  "/notifications": "notifications:read",
  "/settings": "settings:read",
  "/audit-log": "audit:read",
  "/users": "users:read",
  "/roles": "roles:read",
  "/account": null,
  // Next's own not-found and error screens. They show no data, and without
  // them a mistyped URL would read as "no access" instead of "not found".
  "/404": null,
  "/_error": null
};

/** May someone holding `permissions` open `pathname`? Unknown pathname: no. */
export const canOpenRoute = (
  permissions: readonly string[] | undefined,
  pathname: string
): boolean => {
  if (!Object.prototype.hasOwnProperty.call(ROUTE_PERMISSIONS, pathname)) {
    return false;
  }
  const needed = ROUTE_PERMISSIONS[pathname];
  return needed === null || Boolean(permissions?.includes(needed));
};

/**
 * The signed-in admin and a permission check for hiding controls.
 *
 * Read-only on purpose: RouteGuard owns fetching ["admin", "me"] and renders no
 * page until it has it. While the admin is not loaded, can() is false.
 */
export function useCan() {
  const { data: admin } = useQuery({
    queryKey: ["admin", "me"],
    queryFn: getMe,
    enabled: false
  });
  const can = (permission: Permission): boolean =>
    Boolean(admin?.permissions?.includes(permission));
  return { can, admin };
}
