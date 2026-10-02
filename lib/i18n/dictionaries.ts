/**
 * §2.3: admin UI in French by default, English toggle available.
 *
 * ponytail: a plain dictionary + hook rather than next-intl or react-intl. Two
 * locales and flat keys don't need ICU message syntax, a build step, or a
 * provider tree — and `fr` being the first-listed default is the whole
 * requirement. Swap in a library if plurals/dates/gender rules arrive.
 */

/**
 * The language the ADMIN INTERFACE is shown in. French by default, English
 * toggle. Two locales because that is what the administrator needs.
 */
export const LOCALES = ["fr", "en"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "fr";

/**
 * The languages CONTENT can be translated into — a different, larger set.
 *
 * The admin panel being bilingual does not mean the catalogue is: the public
 * site serves Portuguese and Spanish too, and the backend stores all four.
 * Conflating the two meant pt/es could never be typed, while the translation
 * indicator still marked them missing.
 */
export const CONTENT_LOCALES = ["fr", "en", "pt", "es"] as const;
export type ContentLocale = (typeof CONTENT_LOCALES)[number];

export const LOCALE_LABELS: Record<string, string> = {
  fr: "Français",
  en: "English",
  pt: "Português",
  es: "Español"
};

const fr = {
  // Navigation (§3)
  "nav.dashboard": "Tableau de bord",
  "nav.bookings": "Réservations",
  "nav.enquiries": "Demandes",
  "nav.locations": "Localités",
  "nav.inventory": "Inventaire",
  "nav.customers": "Clients",
  "nav.payments": "Paiements",
  "nav.content": "Contenu",
  "nav.notifications": "Notifications",
  "nav.settings": "Paramètres",
  "nav.users": "Utilisateurs",
  "nav.roles": "Rôles",
  "nav.auditLog": "Journal d’audit",
  "nav.signOut": "Se déconnecter",
  "nav.changePassword": "Changer le mot de passe",

  // Common
  "common.search": "Rechercher…",
  "common.loading": "Chargement…",
  "common.save": "Enregistrer",
  "common.cancel": "Annuler",
  "common.create": "Créer",
  "common.edit": "Modifier",
  "common.duplicate": "Dupliquer",
  "common.archive": "Archiver",
  "common.publish": "Publier",
  "common.status": "Statut",
  "common.city": "Ville",
  "common.total": "Total",
  "common.reason": "Motif",
  "common.reasonRequired": "Motif (obligatoire)",
  "common.noResults": "Aucun résultat.",
  "common.required": "Obligatoire",
  "common.back": "Retour",
  "common.apply": "Appliquer",
  "common.name": "Nom",
  "common.phone": "Téléphone",
  "common.email": "E-mail",
  "common.notes": "Notes internes",
  "common.actions": "Actions",
  "common.updated": "Mis à jour",
  "common.created": "Créé",

  // Login
  "login.title": "Administration Travel",
  "login.subtitle": "Connectez-vous pour gérer l’inventaire et les réservations",
  "login.email": "E-mail",
  "login.password": "Mot de passe",
  "login.submit": "Se connecter",
  "login.submitting": "Connexion…",
  "login.provisioned": "Les comptes sont créés par l’administrateur système.",
  "login.failed": "Connexion impossible. Réessayez.",

  // Dashboard (§4)
  "dash.title": "Tableau de bord",
  "dash.subtitle": "Écoulement, marge et capital engagé — pas seulement le chiffre d’affaires",
  "dash.headline": "Indicateurs · 30 derniers jours",
  "dash.netRevenue": "Chiffre d’affaires net",
  "dash.grossMargin": "Marge brute",
  "dash.marginPercent": "Marge %",
  "dash.orders": "Commandes",
  "dash.conversion": "Taux de conversion",
  "dash.cashOutstanding": "Espèces à encaisser",
  "dash.capital": "Capital engagé",
  "dash.atRisk": "Stock à risque",
  "dash.spoilage": "Invendus / stock mort",
  "dash.sellThrough": "Taux d’écoulement",
  "dash.needsAttention": "À traiter",
  "dash.queues": "Files d’attente",
  "dash.dataAsOf": "Données au",

  // Inventory (§5)
  "inv.title": "Inventaire",
  "inv.newHotel": "Nouvel hôtel",
  "inv.newListing": "Nouvelle annonce",
  "inv.hotel": "Hôtel",
  "inv.roomType": "Type de chambre",
  "inv.roomTypes": "Types de chambre",
  "inv.supplier": "Fournisseur",
  "inv.translations": "Traductions",
  "inv.availability": "Disponibilité & tarifs",
  "inv.sellPrice": "Prix de vente (USD)",
  "inv.costPrice": "Prix d’achat (USD)",
  "inv.allotment": "Quota",
  "inv.nightsSelected": "nuit(s) sélectionnée(s)",
  "inv.dragHint": "Cliquez et glissez sur les nuits pour sélectionner une plage.",
  "inv.blankKeeps": "Laissez un champ vide pour conserver la valeur actuelle.",
  "inv.emptyState": "Aucun hôtel. Ajoutez-en un, puis définissez les tarifs et quotas dans son calendrier.",

  // Bookings (§6)
  "book.title": "Réservations",
  "book.reference": "Référence",
  "book.customer": "Client",
  "book.payment": "Paiement",
  "book.documents": "Documents",
  "book.travel": "Voyage",
  "book.cashDeadline": "Échéance espèces",
  "book.queue.needsAction": "À traiter",
  "book.queue.cashPending": "Espèces en attente",
  "book.queue.awaitingConfirmation": "À confirmer",
  "book.queue.departingSoon": "Départs proches",
  "book.queue.cancellations": "Annulations",
  "book.queue.all": "Toutes les commandes",
  "book.noRefundWarning":
    "Aucun remboursement n’est effectué par cette annulation. Le stock est remis en vente. Si de l’argent doit réellement être remboursé, c’est une exception de paiement.",

  // Enquiries (§7)
  "enq.title": "Demandes",
  "enq.slaBreach": "demande(s) au-delà du délai de premier contact",
  "enq.waiting": "en attente",
  "enq.noContact": "sans contact",

  // Security (§14)

  // Audit (§14.6)
  "audit.title": "Journal d’audit",
  "audit.immutable":
    "Ce journal ne peut être ni modifié ni supprimé depuis le panneau, y compris par vous.",

  "settings.title": "Paramètres",
  "content.title": "Contenu",
  "payments.title": "Paiements",
  "notif.title": "Notifications"
};

/** Keys are identical by construction — `fr` is the source of truth. */
const en: Record<keyof typeof fr, string> = {
  "nav.dashboard": "Dashboard",
  "nav.bookings": "Bookings",
  "nav.enquiries": "Enquiries",
  "nav.locations": "Locations",
  "nav.inventory": "Inventory",
  "nav.customers": "Customers",
  "nav.payments": "Payments",
  "nav.content": "Content",
  "nav.notifications": "Notifications",
  "nav.settings": "Settings",
  "nav.users": "Users",
  "nav.roles": "Roles",
  "nav.auditLog": "Audit log",
  "nav.signOut": "Sign out",
  "nav.changePassword": "Change password",

  "common.search": "Search…",
  "common.loading": "Loading…",
  "common.save": "Save",
  "common.cancel": "Cancel",
  "common.create": "Create",
  "common.edit": "Edit",
  "common.duplicate": "Duplicate",
  "common.archive": "Archive",
  "common.publish": "Publish",
  "common.status": "Status",
  "common.city": "City",
  "common.total": "Total",
  "common.reason": "Reason",
  "common.reasonRequired": "Reason (required)",
  "common.noResults": "No results.",
  "common.required": "Required",
  "common.back": "Back",
  "common.apply": "Apply",
  "common.name": "Name",
  "common.phone": "Phone",
  "common.email": "Email",
  "common.notes": "Internal notes",
  "common.actions": "Actions",
  "common.updated": "Updated",
  "common.created": "Created",

  "login.title": "Travel Admin",
  "login.subtitle": "Sign in to manage inventory and bookings",
  "login.email": "Email",
  "login.password": "Password",
  "login.submit": "Sign in",
  "login.submitting": "Signing in…",
  "login.provisioned": "Accounts are provisioned by the system administrator.",
  "login.failed": "Could not sign in. Please try again.",

  "dash.title": "Dashboard",
  "dash.subtitle": "Sell-through, margin and capital exposure — not just revenue",
  "dash.headline": "Headline · last 30 days",
  "dash.netRevenue": "Net revenue",
  "dash.grossMargin": "Gross margin",
  "dash.marginPercent": "Margin %",
  "dash.orders": "Orders",
  "dash.conversion": "Conversion rate",
  "dash.cashOutstanding": "Cash outstanding",
  "dash.capital": "Capital exposure",
  "dash.atRisk": "At-risk inventory",
  "dash.spoilage": "Spoilage / dead stock",
  "dash.sellThrough": "Sell-through rate",
  "dash.needsAttention": "Needs attention",
  "dash.queues": "Queues",
  "dash.dataAsOf": "Data as of",

  "inv.title": "Inventory",
  "inv.newHotel": "New hotel",
  "inv.newListing": "New listing",
  "inv.hotel": "Hotel",
  "inv.roomType": "Room type",
  "inv.roomTypes": "Room types",
  "inv.supplier": "Supplier",
  "inv.translations": "Translations",
  "inv.availability": "Availability & pricing",
  "inv.sellPrice": "Sell price (USD)",
  "inv.costPrice": "Cost price (USD)",
  "inv.allotment": "Allotment",
  "inv.nightsSelected": "night(s) selected",
  "inv.dragHint": "Click and drag across nights to select a range.",
  "inv.blankKeeps": "Leave a field blank to keep its current value.",
  "inv.emptyState":
    "No hotels yet. Add one, then set nightly prices and allotment in its calendar.",

  "book.title": "Bookings",
  "book.reference": "Reference",
  "book.customer": "Customer",
  "book.payment": "Payment",
  "book.documents": "Documents",
  "book.travel": "Travel",
  "book.cashDeadline": "Cash deadline",
  "book.queue.needsAction": "Needs action",
  "book.queue.cashPending": "Cash pending",
  "book.queue.awaitingConfirmation": "Awaiting confirmation",
  "book.queue.departingSoon": "Departing soon",
  "book.queue.cancellations": "Cancellations",
  "book.queue.all": "All orders",
  "book.noRefundWarning":
    "No money is returned by cancelling. Inventory is released back to the lot. If money genuinely needs to move, that is a payment exception.",

  "enq.title": "Enquiries",
  "enq.slaBreach": "enquiry/enquiries past the first-contact deadline",
  "enq.waiting": "waiting",
  "enq.noContact": "without contact",


  "audit.title": "Audit log",
  "audit.immutable":
    "This log cannot be edited or deleted from anywhere in the panel, including by you.",

  "settings.title": "Settings",
  "content.title": "Content",
  "payments.title": "Payments",
  "notif.title": "Notifications"
};

export type TranslationKey = keyof typeof fr;

export const dictionaries: Record<Locale, Record<TranslationKey, string>> = {
  fr,
  en
};
