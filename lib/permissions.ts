import { getMe } from "@/api/functions/auth.api";
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
 * The catalogue, grouped for the role editor. `Permission` is derived from this
 * list, so a permission cannot exist without a label and a place in the matrix.
 */
export const PERMISSION_GROUPS = [
  {
    label: "Dashboard",
    permissions: [
      {
        key: "dashboard:read",
        label: "View",
        description:
          "See company totals: revenue, margin, unpaid cash, stock at risk, and counts of bookings, enquiries and payments needing action."
      }
    ]
  },
  {
    label: "Bookings",
    permissions: [
      {
        key: "orders:read",
        label: "View",
        description:
          "See every booking with the customer's phone, email and delivery address, travellers, cost and margin, and open its documents. Passport numbers stay masked; revealing one needs their password and is logged."
      },
      {
        key: "orders:write",
        label: "Edit",
        description:
          "Confirm, complete or cancel bookings, record cash received and attach tickets. Cancelling, completing and cash received cannot be undone. Needs View."
      }
    ]
  },
  {
    label: "Enquiries",
    permissions: [
      {
        key: "enquiries:read",
        label: "View",
        description:
          "See enquiries with the customer's name, phone number, email and message."
      },
      {
        key: "enquiries:write",
        label: "Edit",
        description:
          "Move enquiries between stages or mark them lost. Moving one to Quoted sends the customer a message. Needs View."
      },
      {
        key: "enquiries:delete",
        label: "Delete",
        description:
          "Delete enquiries for good. Asks for the password again; the audit log keeps what was removed. Needs View."
      }
    ]
  },
  {
    label: "Inventory & locations",
    permissions: [
      {
        key: "inventory:read",
        label: "View",
        description:
          "See hotels, restaurants, listings, suppliers, locations and routes, including cost prices, margins and suppliers — and export any of them as a spreadsheet."
      },
      {
        key: "inventory:write",
        label: "Edit",
        description:
          "Add, edit, copy, publish, deactivate and archive inventory, locations and routes; import inventory from a spreadsheet; set prices and stock; upload photos. Needs View."
      },
      {
        key: "inventory:delete",
        label: "Delete",
        description:
          "Delete hotels (with their rooms and prices), restaurants (with their menus), dishes, room types and listings for good. Bookings already made keep their own details. Asks for the password again. Needs View."
      }
    ]
  },
  {
    label: "Customers",
    permissions: [
      {
        key: "customers:read",
        label: "View",
        description:
          "See customers: name, full phone number, email, city, internal notes, booking history and total spent."
      },
      {
        key: "customers:write",
        label: "Edit",
        description:
          "Change a customer's name, email, notes and phone (the number they sign in with); block or unblock them. Needs View."
      },
      {
        key: "customers:delete",
        label: "Delete",
        description:
          "Delete customer accounts that have no bookings. An account with bookings can only be blocked. Asks for the password again. Needs View."
      },
      {
        key: "customers:export",
        label: "Export",
        description:
          "Download every customer's name, phone and email in one file, after re-entering the password. No button in this panel yet (API only)."
      }
    ]
  },
  {
    label: "Payments",
    permissions: [
      {
        key: "payments:read",
        label: "View",
        description:
          "See the payments list: booking reference, customer name, amount, method and status."
      }
    ]
  },
  {
    label: "Website content",
    permissions: [
      {
        key: "content:read",
        label: "View",
        description:
          "See the website's editable pages (home banner, About, Contact, Help, footer) and the legal texts with their versions."
      },
      {
        key: "content:write",
        label: "Edit",
        description:
          "Change the website's pages and pictures, and publish new versions of the terms, refund policy and privacy policy — including the wording customers accept at checkout. Needs View."
      },
      {
        key: "content:delete",
        label: "Delete",
        description:
          "Delete versions of the legal texts that were stored but never went on the website. Every published version is kept. Asks for the password again. Needs View."
      }
    ]
  },
  {
    label: "Notifications",
    permissions: [
      {
        key: "notifications:read",
        label: "View",
        description:
          "See the messages sent to customers and the delivery log. Phone numbers are masked; message text also needs Bookings: View."
      },
      {
        key: "notifications:write",
        label: "Edit",
        description:
          "Change the messages customers receive, and send a test SMS with any wording to any phone number. Needs View."
      },
      {
        key: "notifications:delete",
        label: "Delete",
        description:
          "Delete message templates. The event then sends nothing on that channel until a template is saved again (an app notification falls back to the SMS wording). Asks for the password again. Needs View."
      }
    ]
  },
  {
    label: "Settings",
    permissions: [
      {
        key: "settings:read",
        label: "View",
        description:
          "See company contact details, hold times and the other operating settings."
      },
      {
        key: "settings:write",
        label: "Edit",
        description:
          "Change public contact details, hold times, currencies, passport retention and maintenance mode. Asks for the password again. Needs View."
      }
    ]
  },
  {
    label: "Audit log",
    permissions: [
      {
        key: "audit:read",
        label: "View",
        description:
          "See every staff action and sign-in: who, from which IP address, when, why, and what was changed."
      }
    ]
  },
  {
    label: "Users",
    permissions: [
      {
        key: "users:read",
        label: "View",
        description:
          "See every panel user's name, email, phone, role, status and last sign-in."
      },
      {
        key: "users:write",
        label: "Edit",
        description:
          "Add users, change their role, deactivate them and reset passwords (the new password is shown to them). Only up to their own access. Asks for the password again. Needs View."
      },
      {
        key: "users:delete",
        label: "Delete",
        description:
          "Delete panel users for good, within the same limits as editing them. Deactivating is the way to switch one off and keep it. Asks for the password again. Needs View and Edit."
      }
    ]
  },
  {
    label: "Roles",
    permissions: [
      {
        key: "roles:read",
        label: "View",
        description: "See every role and the permissions it holds."
      },
      {
        key: "roles:write",
        label: "Edit",
        description:
          "Create, change and delete roles, using only permissions they hold themselves and never their own role. Asks for the password again. Needs View."
      }
    ]
  }
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
  "/inventory/[id]": "inventory:read",
  "/inventory/hotel/[id]": "inventory:read",
  "/inventory/listing/[id]": "inventory:read",
  "/inventory/restaurant/[id]": "inventory:read",
  "/customers": "customers:read",
  "/customers/[id]": "customers:read",
  "/payments": "payments:read",
  "/content": "content:read",
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
