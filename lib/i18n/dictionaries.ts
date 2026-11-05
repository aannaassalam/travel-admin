/**
 * §2.3: admin UI in French by default, English toggle available.
 *
 * ponytail: a plain dictionary + hook rather than next-intl or react-intl. Two
 * locales and flat keys don't need ICU message syntax, a build step, or a
 * provider tree — and `fr` being the first-listed default is the whole
 * requirement. Swap in a library if plurals/dates/gender rules arrive.
 */

/**
 * The language the ADMIN INTERFACE is shown in. French by default; the same
 * seven languages as the public site (2026-10-31). Arabic is right to left.
 */
export const LOCALES = ["fr", "en", "pt", "es", "zh", "ar", "ru"] as const;
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
export const CONTENT_LOCALES = ["fr", "en", "pt", "es", "zh", "ar", "ru"] as const;
export type ContentLocale = (typeof CONTENT_LOCALES)[number];

export const LOCALE_LABELS: Record<string, string> = {
  fr: "Français",
  en: "English",
  pt: "Português",
  es: "Español",
  zh: "中文",
  ar: "العربية",
  ru: "Русский"
};

/** Languages written right to left: the panel mirrors its layout for them. */
export const RTL_LOCALES: readonly string[] = ["ar"];
export const isRtl = (locale: string) => RTL_LOCALES.includes(locale);

/** How numbers are written in each panel language. Arabic keeps Latin digits, as on receipts. */
const NUMBER_LOCALES: Record<Locale, string> = {
  fr: "fr-FR",
  en: "en-US",
  pt: "pt-PT",
  es: "es",
  zh: "zh-CN",
  ar: "ar-u-nu-latn",
  ru: "ru-RU"
};
/** The Intl locale for a panel language: `n.toLocaleString(numberLocale(locale))`. */
export const numberLocale = (locale: string) =>
  NUMBER_LOCALES[locale as Locale] ?? NUMBER_LOCALES[DEFAULT_LOCALE];

export const fr = {
  // Navigation (§3)
  "nav.dashboard": "Tableau de bord",
  "nav.bookings": "Réservations",
  "nav.enquiries": "Demandes",
  "nav.locations": "Localités",
  "nav.suppliers": "Fournisseurs",
  "nav.inventory": "Inventaire",
  "nav.transfers": "Transferts",
  "nav.transfers.rides": "Courses",
  "nav.transfers.drivers": "Chauffeurs",
  "nav.transfers.vehicles": "Véhicules",
  "nav.transfers.categories": "Catégories de véhicule",
  "nav.transfers.places": "Lieux",
  "nav.vehicleSales": "Véhicules à vendre",
  "nav.vehicleSales.vehicles": "Véhicules",
  "nav.vehicleSales.parkings": "Parkings",
  "nav.vehicleSales.catalogue": "Catalogue",
  "nav.customers": "Clients",
  "nav.payments": "Paiements",
  "nav.content": "Contenu du site",
  "nav.partners": "Partenaires",
  "nav.reviews": "Avis clients",
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
  "login.title": "Flexi Agency Admin",
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
  "inv.sellPrice": "Prix de vente (FC)",
  "inv.costPrice": "Prix d’achat (FC)",
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
  "book.type": "Type",
  "label.booking.HOTEL": "Chambre d'hôtel",
  "label.booking.FLIGHT": "Billet d'avion",
  "label.booking.BUS": "Billet de bus",
  "label.booking.CAR": "Location de voiture",
  "label.booking.TRANSFER": "Taxis & Transferts",
  "label.booking.RESTAURANT": "Restaurant",
  "label.booking.PROPERTY": "Immobilier",
  "label.booking.ACTIVITY": "Activités",
  "label.booking.VEHICLE_SALE": "Véhicule à vendre",
  "book.travel": "Voyage",
  "book.cashDeadline": "Échéance espèces",
  "book.queue.needsAction": "À traiter",
  "book.queue.cashPending": "Espèces en attente",
  "book.queue.awaitingConfirmation": "À confirmer",
  "book.queue.departingSoon": "Départs proches",
  "book.queue.cancellations": "Annulations",
  "book.queue.all": "Toutes les commandes",

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
  "notif.title": "Notifications",

  // Shared pieces: dialogs, lists, pickers, the header
  "common.close": "Fermer",
  "common.previous": "Précédent",
  "common.next": "Suivant",
  "common.previousPage": "Page précédente",
  "common.nextPage": "Page suivante",
  "common.morePages": "Autres pages",
  "common.pagination": "Pagination",
  "common.select": "Choisir…",
  "common.option": "Option",
  "common.noOption": "Aucune option trouvée",
  "common.noMatch": "Aucune correspondance",
  "common.searchOrCreate": "Rechercher ou créer…",
  "common.createNamed": "Créer « {name} »",
  "common.typeToSearchOrCreate": "Tapez pour rechercher un élément ou en créer un",
  "common.selectCountryCode": "Choisir l’indicatif du pays…",
  "common.searchCountry": "Rechercher un pays…",
  "common.noCountry": "Aucun pays trouvé.",
  "common.commandTitle": "Palette de commandes",
  "common.commandDescription": "Cherchez une commande à exécuter…",
  "common.requestFailed": "Une erreur s’est produite pendant le traitement de votre demande.",
  "common.saveRevertedFailed": "Impossible d’enregistrer — la modification a été annulée",
  "common.language": "Langue",
  "nav.bookings.completed": "Terminées",
  "nav.inventory.HOTEL": "Hôtels",
  "nav.inventory.RESTAURANT": "Restaurants",
  "nav.inventory.FLIGHT": "Vols",
  "nav.inventory.BUS": "Bus",
  "nav.inventory.CAR": "Voitures",
  "nav.inventory.PROPERTY": "Immobilier",
  "nav.inventory.ACTIVITY": "Activités & circuits",

  // Display currency (this device only) and the money boxes
  "currency.label": "Devise d’affichage (cet appareil)",
  "currency.note": "Taux du bureau : 1 {code} = {rate}",
  "money.hint": "Francs entiers. L’USD et l’EUR sont calculés à partir des taux de change des Paramètres.",
  "money.hintConverted": "Saisi en {code} au taux du bureau, enregistré en francs entiers.",
  "money.notConverted":
    "Pas encore converti : {amount}, d’avant le passage des prix en francs. Laissez-le pour la conversion, ou saisissez le prix en FC.",
  "localized.firstRequired": "{language} est obligatoire : c’est la langue de repli des autres.",
  "tags.title": "Traductions",
  "tags.count": "{n}/{total} traduits",

  // Words for the codes the API speaks (lib/functions/labels.lib.ts)
  "label.order.DRAFT": "Brouillon",
  "label.order.SUBMITTED": "En attente de confirmation",
  "label.order.CONFIRMED": "Confirmée",
  "label.order.COMPLETED": "Terminée",
  "label.order.CANCELLED": "Annulée",
  "label.payment.UNPAID": "Non payée",
  "label.payment.PENDING": "Paiement en attente",
  "label.payment.PAID": "Payée",
  "label.payment.FAILED": "Paiement échoué",
  "label.payment.REVERSED": "Paiement annulé",
  "label.fulfilment.NOT_STARTED": "Non commencée",
  "label.fulfilment.DOCUMENTS_PENDING": "Documents en attente",
  "label.fulfilment.DOCUMENTS_ISSUED": "Documents émis",
  "label.fulfilment.DELIVERED": "Livrée",
  "label.method.CASH": "Espèces",
  "label.method.ONLINE": "En ligne",
  "label.channel.WEB": "Site web",
  "label.channel.IOS": "Application iPhone",
  "label.channel.ANDROID": "Application Android",
  "label.channel.ADMIN": "Panneau d’administration",
  "label.document.ETICKET": "Billet électronique",
  "label.document.VOUCHER": "Bon d’échange",
  "label.document.INVOICE": "Facture",
  "label.timeline.ORDER_CREATED": "Réservation créée",
  "label.timeline.PAYMENT_STARTED": "Paiement lancé",
  "label.timeline.PAYMENT_RECEIVED": "Paiement reçu",
  "label.timeline.PAYMENT_FAILED": "Paiement échoué",
  "label.timeline.PAYMENT_RETURNED": "Le client est revenu de la page de paiement",
  "label.timeline.PAYMENT_NOTIFIED": "Avis MaxiCash non compris",
  "label.timeline.PAYMENT_METHOD_CHANGED": "Mode de paiement modifié",
  "label.timeline.CASH_RECEIVED": "Espèces reçues au bureau",
  "label.timeline.STATUS_CONFIRMED": "Réservation confirmée",
  "label.timeline.STATUS_COMPLETED": "Réservation terminée",
  "label.timeline.STATUS_CANCELLED": "Réservation annulée",
  "label.timeline.AUTO_CANCELLED": "Annulée automatiquement : échéance espèces dépassée",
  "label.timeline.INVENTORY_RELEASED": "Stock remis en vente",
  "label.timeline.DOCUMENTS_ISSUED": "Documents émis",
  "label.timeline.DOCUMENT_REMOVED": "Document supprimé",
  "label.timeline.NOTE_ADDED": "Note interne ajoutée",
  "label.cancel.CASH_DEADLINE_EXPIRED": "Échéance espèces dépassée",
  "label.cancel.CUSTOMER_REQUEST": "Demande du client",
  "label.cancel.CANNOT_DELIVER": "Nous ne pouvons pas fournir la prestation",
  "label.cancel.FRAUD_OR_DUPLICATE": "Fraude ou doublon",
  "label.cancel.OTHER": "Autre",
  "label.vertical.HOTEL": "Hôtels",
  "label.vertical.FLIGHT": "Vols",
  "label.vertical.BUS": "Bus",
  "label.vertical.CAR": "Location de voitures",
  "label.vertical.ACTIVITY": "Activités",
  "label.vertical.PROPERTY": "Immobilier",
  "label.vertical.RESTAURANT": "Restaurants",
  "label.vertical.TRANSFER": "Transferts",
  "label.vertical.VEHICLE_SALE": "Véhicules à vendre",
  "label.listing.INACTIVE": "Inactif",
  "label.listing.DRAFT": "Brouillon",
  "label.listing.PUBLISHED": "Publié",
  "label.listing.EXPIRED": "Expiré",
  "label.listing.SOLD_OUT": "Complet",
  "label.listing.ARCHIVED": "Archivé",
  "label.deactivatePrompt":
    "Désactiver « {name} » ?\n\nIl ne peut plus être réservé à partir de maintenant et disparaît du site d’ici quelques minutes. Les réservations existantes ne sont pas touchées, et vous pouvez le republier quand vous le souhaitez.",
  "label.notification.ORDER_CREATED": "Réservation créée",
  "label.notification.ORDER_CONFIRMED": "Réservation confirmée",
  "label.notification.ORDER_COMPLETED": "Réservation terminée",
  "label.notification.ORDER_CANCELLED": "Réservation annulée",
  "label.notification.PAYMENT_RECEIVED": "Paiement reçu",
  "label.notification.CASH_DEADLINE_REMINDER": "Rappel d’échéance espèces",
  "label.notification.DOCUMENTS_ISSUED": "Documents prêts",
  "label.notification.ENQUIRY_RECEIVED": "Demande reçue",
  "label.notification.QUOTE_SENT": "Devis envoyé",
  "label.notification.TRANSFER_BOOKED": "Transfert : course réservée (espèces au chauffeur)",
  "label.notification.TRANSFER_ASSIGNED": "Transfert : chauffeur attribué",
  "label.notification.TRANSFER_STARTED": "Transfert : course commencée",
  "label.notification.TRANSFER_COMPLETED": "Transfert : course terminée",
  "label.notification.DRIVER_RIDE_ASSIGNED": "Chauffeur : nouvelle course",
  "label.notification.DRIVER_RIDE_REMOVED": "Chauffeur : course retirée",
  "label.notification.DRIVER_WELCOME": "Chauffeur : bienvenue",
  "label.notification.TRANSFER_ALERT": "Transfert : alerte de sécurité (au bureau)",
  "label.notification.OFFICE_NEW": "E-mail au bureau : nouvelle réservation",
  "label.notification.OFFICE_NEW_PAID": "E-mail au bureau : nouvelle réservation, payée en ligne",
  "label.notification.OFFICE_PAID": "E-mail au bureau : paiement reçu",
  "label.notification.OFFICE_CONFIRMED": "E-mail au bureau : réservation confirmée",
  "label.notification.OFFICE_DOCUMENTS": "E-mail au bureau : documents joints",
  "label.notification.OFFICE_COMPLETED": "E-mail au bureau : réservation terminée",
  "label.route.ORDER_CONFIRMED":
    "SMS à la réservation en espèces · application seulement quand le bureau confirme",
  "label.route.PAYMENT_RECEIVED":
    "SMS quand un paiement en ligne finalise une nouvelle réservation · application seulement sinon",
  "label.route.TRANSFER_BOOKED":
    "SMS à la réservation d’une course en espèces · application seulement quand le bureau confirme",
  "label.route.ORDER_COMPLETED": "SMS et application · application seulement pour une course déjà terminée",
  "label.route.TRANSFER_COMPLETED": "SMS et application",
  "label.route.TRANSFER_ALERT": "SMS (sécurité)",
  "label.routeAppOnly": "Application seulement — pas de SMS",
  "label.routeToDriver": "SMS (les chauffeurs n’ont pas d’application)",
  "label.delivery.SKIPPED": "Non envoyé",

  // The permission catalogue (lib/permissions.ts)
  "perm.group.dashboard": "Tableau de bord",
  "perm.group.orders": "Réservations",
  "perm.group.enquiries": "Demandes",
  "perm.group.inventory": "Inventaire & localités",
  "perm.group.customers": "Clients",
  "perm.group.payments": "Paiements",
  "perm.group.content": "Contenu du site",
  "perm.group.notifications": "Notifications",
  "perm.group.settings": "Paramètres",
  "perm.group.audit": "Journal d’audit",
  "perm.group.users": "Utilisateurs",
  "perm.group.roles": "Rôles",
  "perm.action.read": "Voir",
  "perm.action.write": "Modifier",
  "perm.action.delete": "Supprimer",
  "perm.action.export": "Exporter",
  "perm.dashboard:read":
    "Voir les totaux de l’entreprise : chiffre d’affaires, marge, espèces non encaissées, et le nombre de réservations, demandes et paiements à traiter.",
  "perm.orders:read":
    "Voir chaque réservation avec le téléphone, l’e-mail et l’adresse de livraison du client, les voyageurs, le coût et la marge, et ouvrir ses documents. Les numéros de passeport restent masqués ; en afficher un demande son mot de passe et est journalisé.",
  "perm.orders:write":
    "Confirmer, terminer ou annuler des réservations, enregistrer les espèces reçues et joindre les billets. L’annulation, la clôture et l’encaissement d’espèces sont irréversibles. Nécessite Voir.",
  "perm.enquiries:read":
    "Voir les demandes avec le nom, le numéro de téléphone, l’e-mail et le message du client.",
  "perm.enquiries:write":
    "Faire passer les demandes d’une étape à l’autre ou les marquer perdues. Passer une demande à « Devis envoyé » prévient le client dans l’application, s’il l’a (aucun SMS n’est envoyé). Nécessite Voir.",
  "perm.enquiries:delete":
    "Supprimer définitivement des demandes. Redemande le mot de passe ; le journal d’audit conserve ce qui a été supprimé. Nécessite Voir.",
  "perm.inventory:read":
    "Voir les hôtels, restaurants, annonces, fournisseurs, localités et trajets, y compris les prix d’achat, les marges et les fournisseurs — et exporter chacun d’eux en tableur.",
  "perm.inventory:write":
    "Ajouter, modifier, copier, publier, désactiver et archiver l’inventaire, les localités et les trajets ; importer l’inventaire depuis un tableur ; fixer les prix et le stock ; téléverser des photos. Nécessite Voir.",
  "perm.inventory:delete":
    "Supprimer définitivement des hôtels (avec leurs chambres et leurs prix), des restaurants (avec leurs menus), des plats, des types de chambre et des annonces. Les réservations déjà faites gardent leurs propres détails. Redemande le mot de passe. Nécessite Voir.",
  "perm.customers:read":
    "Voir les clients : nom, numéro de téléphone complet, e-mail, ville, notes internes, historique des réservations et total dépensé.",
  "perm.customers:write":
    "Modifier le nom, l’e-mail, les notes et le téléphone d’un client (le numéro avec lequel il se connecte) ; le bloquer ou le débloquer. Nécessite Voir.",
  "perm.customers:delete":
    "Supprimer les comptes clients sans réservation. Un compte avec des réservations peut seulement être bloqué. Redemande le mot de passe. Nécessite Voir.",
  "perm.customers:export":
    "Télécharger le nom, le téléphone et l’e-mail de tous les clients dans un seul fichier, après avoir ressaisi le mot de passe. Pas encore de bouton dans ce panneau (API uniquement).",
  "perm.payments:read":
    "Voir la liste des paiements : référence de réservation, nom du client, montant, mode et statut.",
  "perm.content:read":
    "Voir les pages modifiables du site (bannière d’accueil, À propos, Contact, Aide, pied de page), les partenaires affichés sur l’accueil et dans l’application, les avis clients avec le nom du client, et les textes légaux avec leurs versions.",
  "perm.content:write":
    "Modifier les pages et les images du site, ajouter et modifier les partenaires et leurs logos, approuver ou refuser les avis clients (un avis approuvé apparaît sur le site et compte dans la note de l’élément), et publier de nouvelles versions des conditions, de la politique de remboursement et de la politique de confidentialité — y compris le texte que les clients acceptent au paiement. Nécessite Voir.",
  "perm.content:delete":
    "Supprimer des partenaires, des avis clients et les versions des textes légaux enregistrées mais jamais mises en ligne. Chaque version publiée est conservée. Redemande le mot de passe. Nécessite Voir.",
  "perm.notifications:read":
    "Voir les messages envoyés aux clients et le journal d’envoi. Les numéros de téléphone sont masqués ; le texte des messages nécessite aussi Réservations : Voir.",
  "perm.notifications:write":
    "Modifier les messages que reçoivent les clients, et envoyer un SMS de test avec n’importe quel texte à n’importe quel numéro. Nécessite Voir.",
  "perm.notifications:delete":
    "Supprimer des modèles de message. L’événement n’envoie alors plus rien sur ce canal jusqu’à ce qu’un modèle soit de nouveau enregistré (une notification de l’application reprend le texte du SMS). Redemande le mot de passe. Nécessite Voir.",
  "perm.settings:read":
    "Voir les coordonnées de l’entreprise, les durées de blocage et les autres paramètres d’exploitation.",
  "perm.settings:write":
    "Modifier les coordonnées publiques, les durées de blocage, les devises, la conservation des passeports et le mode maintenance. Redemande le mot de passe. Nécessite Voir.",
  "perm.audit:read":
    "Voir chaque action et connexion du personnel : qui, depuis quelle adresse IP, quand, pourquoi, et ce qui a été modifié.",
  "perm.users:read":
    "Voir le nom, l’e-mail, le téléphone, le rôle, le statut et la dernière connexion de chaque utilisateur du panneau.",
  "perm.users:write":
    "Ajouter des utilisateurs, changer leur rôle, les désactiver et réinitialiser leurs mots de passe (le nouveau mot de passe leur est affiché). Seulement dans la limite de ses propres accès. Redemande le mot de passe. Nécessite Voir.",
  "perm.users:delete":
    "Supprimer définitivement des utilisateurs du panneau, dans les mêmes limites que pour les modifier. Pour en mettre un à l’arrêt tout en le gardant, désactivez-le. Redemande le mot de passe. Nécessite Voir et Modifier.",
  "perm.roles:read": "Voir chaque rôle et les permissions qu’il donne.",
  "perm.roles:write":
    "Créer, modifier et supprimer des rôles, avec seulement les permissions qu’on détient soi-même et jamais sur son propre rôle. Redemande le mot de passe. Nécessite Voir."
};

/** Keys are identical by construction — `fr` is the source of truth. */
export const en: Record<keyof typeof fr, string> = {
  "nav.dashboard": "Dashboard",
  "nav.bookings": "Bookings",
  "nav.enquiries": "Enquiries",
  "nav.locations": "Locations",
  "nav.suppliers": "Suppliers",
  "nav.inventory": "Inventory",
  "nav.transfers": "Transfers",
  "nav.transfers.rides": "Rides",
  "nav.transfers.drivers": "Drivers",
  "nav.transfers.vehicles": "Vehicles",
  "nav.transfers.categories": "Vehicle categories",
  "nav.transfers.places": "Places",
  "nav.vehicleSales": "Vehicles for sale",
  "nav.vehicleSales.vehicles": "Vehicles",
  "nav.vehicleSales.parkings": "Parkings",
  "nav.vehicleSales.catalogue": "Catalogue",
  "nav.customers": "Customers",
  "nav.payments": "Payments",
  "nav.content": "Website content",
  "nav.partners": "Partners",
  "nav.reviews": "Customer reviews",
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

  "login.title": "Flexi Agency Admin",
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
  "inv.sellPrice": "Sell price (FC)",
  "inv.costPrice": "Cost price (FC)",
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
  "book.type": "Type",
  "label.booking.HOTEL": "Hotel room",
  "label.booking.FLIGHT": "Flight ticket",
  "label.booking.BUS": "Bus ticket",
  "label.booking.CAR": "Car rental",
  "label.booking.TRANSFER": "Taxi & Transfers",
  "label.booking.RESTAURANT": "Restaurant",
  "label.booking.PROPERTY": "Properties",
  "label.booking.ACTIVITY": "Activities",
  "label.booking.VEHICLE_SALE": "Vehicle for sale",
  "book.travel": "Travel",
  "book.cashDeadline": "Cash deadline",
  "book.queue.needsAction": "Needs action",
  "book.queue.cashPending": "Cash pending",
  "book.queue.awaitingConfirmation": "Awaiting confirmation",
  "book.queue.departingSoon": "Departing soon",
  "book.queue.cancellations": "Cancellations",
  "book.queue.all": "All orders",

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
  "notif.title": "Notifications",

  "common.close": "Close",
  "common.previous": "Previous",
  "common.next": "Next",
  "common.previousPage": "Go to previous page",
  "common.nextPage": "Go to next page",
  "common.morePages": "More pages",
  "common.pagination": "pagination",
  "common.select": "Select...",
  "common.option": "Option",
  "common.noOption": "No option found",
  "common.noMatch": "No match found",
  "common.searchOrCreate": "Search or create...",
  "common.createNamed": "Create \"{name}\"",
  "common.typeToSearchOrCreate": "Type to search for record or create one",
  "common.selectCountryCode": "Select country code...",
  "common.searchCountry": "Search country...",
  "common.noCountry": "No country found.",
  "common.commandTitle": "Command Palette",
  "common.commandDescription": "Search for a command to run...",
  "common.requestFailed": "An error occurred while processing your request.",
  "common.saveRevertedFailed": "Could not save — put back",
  "common.language": "Language",
  "nav.bookings.completed": "Completed",
  "nav.inventory.HOTEL": "Hotels",
  "nav.inventory.RESTAURANT": "Restaurants",
  "nav.inventory.FLIGHT": "Flights",
  "nav.inventory.BUS": "Bus",
  "nav.inventory.CAR": "Cars",
  "nav.inventory.PROPERTY": "Properties",
  "nav.inventory.ACTIVITY": "Activities & Tours",

  "currency.label": "Display currency (this device)",
  "currency.note": "Office rate: 1 {code} = {rate}",
  "money.hint": "Whole francs. USD and EUR are worked out from the exchange rates in Settings.",
  "money.hintConverted": "Typed in {code} at the office's rate, saved in whole francs.",
  "money.notConverted":
    "Not converted yet: {amount} from before prices were in francs. Leave it for the conversion, or type the price in FC.",
  "localized.firstRequired": "{language} is required — it is what other languages fall back to.",
  "tags.title": "Translations",
  "tags.count": "{n}/{total} translated",

  "label.order.DRAFT": "Draft",
  "label.order.SUBMITTED": "Awaiting confirmation",
  "label.order.CONFIRMED": "Confirmed",
  "label.order.COMPLETED": "Completed",
  "label.order.CANCELLED": "Cancelled",
  "label.payment.UNPAID": "Unpaid",
  "label.payment.PENDING": "Payment pending",
  "label.payment.PAID": "Paid",
  "label.payment.FAILED": "Payment failed",
  "label.payment.REVERSED": "Payment reversed",
  "label.fulfilment.NOT_STARTED": "Not started",
  "label.fulfilment.DOCUMENTS_PENDING": "Documents pending",
  "label.fulfilment.DOCUMENTS_ISSUED": "Documents issued",
  "label.fulfilment.DELIVERED": "Delivered",
  "label.method.CASH": "Cash",
  "label.method.ONLINE": "Online",
  "label.channel.WEB": "Website",
  "label.channel.IOS": "iPhone app",
  "label.channel.ANDROID": "Android app",
  "label.channel.ADMIN": "Admin panel",
  "label.document.ETICKET": "E-ticket",
  "label.document.VOUCHER": "Voucher",
  "label.document.INVOICE": "Invoice",
  "label.timeline.ORDER_CREATED": "Booking created",
  "label.timeline.PAYMENT_STARTED": "Payment started",
  "label.timeline.PAYMENT_RECEIVED": "Payment received",
  "label.timeline.PAYMENT_FAILED": "Payment failed",
  "label.timeline.PAYMENT_RETURNED": "Customer came back from the payment page",
  "label.timeline.PAYMENT_NOTIFIED": "MaxiCash notice not understood",
  "label.timeline.PAYMENT_METHOD_CHANGED": "Payment method changed",
  "label.timeline.CASH_RECEIVED": "Cash received at the office",
  "label.timeline.STATUS_CONFIRMED": "Booking confirmed",
  "label.timeline.STATUS_COMPLETED": "Booking completed",
  "label.timeline.STATUS_CANCELLED": "Booking cancelled",
  "label.timeline.AUTO_CANCELLED": "Cancelled automatically — cash deadline passed",
  "label.timeline.INVENTORY_RELEASED": "Stock released back for sale",
  "label.timeline.DOCUMENTS_ISSUED": "Documents issued",
  "label.timeline.DOCUMENT_REMOVED": "Document removed",
  "label.timeline.NOTE_ADDED": "Internal note added",
  "label.cancel.CASH_DEADLINE_EXPIRED": "Cash deadline expired",
  "label.cancel.CUSTOMER_REQUEST": "Customer request",
  "label.cancel.CANNOT_DELIVER": "We cannot deliver",
  "label.cancel.FRAUD_OR_DUPLICATE": "Fraud or duplicate",
  "label.cancel.OTHER": "Other",
  "label.vertical.HOTEL": "Hotels",
  "label.vertical.FLIGHT": "Flights",
  "label.vertical.BUS": "Bus",
  "label.vertical.CAR": "Car hire",
  "label.vertical.ACTIVITY": "Activities",
  "label.vertical.PROPERTY": "Property",
  "label.vertical.RESTAURANT": "Restaurants",
  "label.vertical.TRANSFER": "Transfers",
  "label.vertical.VEHICLE_SALE": "Vehicles for sale",
  "label.listing.INACTIVE": "Inactive",
  "label.listing.DRAFT": "Draft",
  "label.listing.PUBLISHED": "Published",
  "label.listing.EXPIRED": "Expired",
  "label.listing.SOLD_OUT": "Sold out",
  "label.listing.ARCHIVED": "Archived",
  "label.deactivatePrompt":
    "Deactivate “{name}”?\n\nIt can no longer be booked from this moment, and disappears from the website within a few minutes. Existing bookings are not affected, and you can publish it again whenever you like.",
  "label.notification.ORDER_CREATED": "Booking created",
  "label.notification.ORDER_CONFIRMED": "Booking confirmed",
  "label.notification.ORDER_COMPLETED": "Booking completed",
  "label.notification.ORDER_CANCELLED": "Booking cancelled",
  "label.notification.PAYMENT_RECEIVED": "Payment received",
  "label.notification.CASH_DEADLINE_REMINDER": "Cash deadline reminder",
  "label.notification.DOCUMENTS_ISSUED": "Documents ready",
  "label.notification.ENQUIRY_RECEIVED": "Enquiry received",
  "label.notification.QUOTE_SENT": "Quote sent",
  "label.notification.TRANSFER_BOOKED": "Transfer: ride booked (cash to the driver)",
  "label.notification.TRANSFER_ASSIGNED": "Transfer: driver assigned",
  "label.notification.TRANSFER_STARTED": "Transfer: ride started",
  "label.notification.TRANSFER_COMPLETED": "Transfer: ride completed",
  "label.notification.DRIVER_RIDE_ASSIGNED": "Driver: new ride",
  "label.notification.DRIVER_RIDE_REMOVED": "Driver: ride taken off them",
  "label.notification.DRIVER_WELCOME": "Driver: welcome",
  "label.notification.TRANSFER_ALERT": "Transfer: security alert (to the office)",
  "label.notification.OFFICE_NEW": "Office e-mail: new booking",
  "label.notification.OFFICE_NEW_PAID": "Office e-mail: new booking, paid online",
  "label.notification.OFFICE_PAID": "Office e-mail: payment received",
  "label.notification.OFFICE_CONFIRMED": "Office e-mail: booking confirmed",
  "label.notification.OFFICE_DOCUMENTS": "Office e-mail: documents attached",
  "label.notification.OFFICE_COMPLETED": "Office e-mail: booking completed",
  "label.route.ORDER_CONFIRMED":
    "Texted when a cash booking is made · app only when the office confirms",
  "label.route.PAYMENT_RECEIVED":
    "Texted when an online payment completes a new booking · app only otherwise",
  "label.route.TRANSFER_BOOKED":
    "Texted when a cash ride is booked · app only when the office confirms",
  "label.route.ORDER_COMPLETED": "Texted and sent to the app · app only for a ride that has already ended",
  "label.route.TRANSFER_COMPLETED": "Texted and sent to the app",
  "label.route.TRANSFER_ALERT": "Texted (safety)",
  "label.routeAppOnly": "App only — not texted",
  "label.routeToDriver": "Texted (drivers have no app)",
  "label.delivery.SKIPPED": "Not sent",

  "perm.group.dashboard": "Dashboard",
  "perm.group.orders": "Bookings",
  "perm.group.enquiries": "Enquiries",
  "perm.group.inventory": "Inventory & locations",
  "perm.group.customers": "Customers",
  "perm.group.payments": "Payments",
  "perm.group.content": "Website content",
  "perm.group.notifications": "Notifications",
  "perm.group.settings": "Settings",
  "perm.group.audit": "Audit log",
  "perm.group.users": "Users",
  "perm.group.roles": "Roles",
  "perm.action.read": "View",
  "perm.action.write": "Edit",
  "perm.action.delete": "Delete",
  "perm.action.export": "Export",
  "perm.dashboard:read":
    "See company totals: revenue, margin, unpaid cash, and counts of bookings, enquiries and payments needing action.",
  "perm.orders:read":
    "See every booking with the customer's phone, email and delivery address, travellers, cost and margin, and open its documents. Passport numbers stay masked; revealing one needs their password and is logged.",
  "perm.orders:write":
    "Confirm, complete or cancel bookings, record cash received and attach tickets. Cancelling, completing and cash received cannot be undone. Needs View.",
  "perm.enquiries:read":
    "See enquiries with the customer's name, phone number, email and message.",
  "perm.enquiries:write":
    "Move enquiries between stages or mark them lost. Moving one to Quoted notifies the customer in the app, if they have it (no text is sent). Needs View.",
  "perm.enquiries:delete":
    "Delete enquiries for good. Asks for the password again; the audit log keeps what was removed. Needs View.",
  "perm.inventory:read":
    "See hotels, restaurants, listings, suppliers, locations and routes, including cost prices, margins and suppliers — and export any of them as a spreadsheet.",
  "perm.inventory:write":
    "Add, edit, copy, publish, deactivate and archive inventory, locations and routes; import inventory from a spreadsheet; set prices and stock; upload photos. Needs View.",
  "perm.inventory:delete":
    "Delete hotels (with their rooms and prices), restaurants (with their menus), dishes, room types and listings for good. Bookings already made keep their own details. Asks for the password again. Needs View.",
  "perm.customers:read":
    "See customers: name, full phone number, email, city, internal notes, booking history and total spent.",
  "perm.customers:write":
    "Change a customer's name, email, notes and phone (the number they sign in with); block or unblock them. Needs View.",
  "perm.customers:delete":
    "Delete customer accounts that have no bookings. An account with bookings can only be blocked. Asks for the password again. Needs View.",
  "perm.customers:export":
    "Download every customer's name, phone and email in one file, after re-entering the password. No button in this panel yet (API only).",
  "perm.payments:read":
    "See the payments list: booking reference, customer name, amount, method and status.",
  "perm.content:read":
    "See the website's editable pages (home banner, About, Contact, Help, footer), the partners shown on the homepage and in the app, customer reviews with the customer's name, and the legal texts with their versions.",
  "perm.content:write":
    "Change the website's pages and pictures, add and change partners and their logos, approve or reject customer reviews (an approved one goes on the website and into the item's rating), and publish new versions of the terms, refund policy and privacy policy — including the wording customers accept at checkout. Needs View.",
  "perm.content:delete":
    "Delete partners, customer reviews, and versions of the legal texts that were stored but never went on the website. Every published version is kept. Asks for the password again. Needs View.",
  "perm.notifications:read":
    "See the messages sent to customers and the delivery log. Phone numbers are masked; message text also needs Bookings: View.",
  "perm.notifications:write":
    "Change the messages customers receive, and send a test SMS with any wording to any phone number. Needs View.",
  "perm.notifications:delete":
    "Delete message templates. The event then sends nothing on that channel until a template is saved again (an app notification falls back to the SMS wording). Asks for the password again. Needs View.",
  "perm.settings:read":
    "See company contact details, hold times and the other operating settings.",
  "perm.settings:write":
    "Change public contact details, hold times, currencies, passport retention and maintenance mode. Asks for the password again. Needs View.",
  "perm.audit:read":
    "See every staff action and sign-in: who, from which IP address, when, why, and what was changed.",
  "perm.users:read":
    "See every panel user's name, email, phone, role, status and last sign-in.",
  "perm.users:write":
    "Add users, change their role, deactivate them and reset passwords (the new password is shown to them). Only up to their own access. Asks for the password again. Needs View.",
  "perm.users:delete":
    "Delete panel users for good, within the same limits as editing them. Deactivating is the way to switch one off and keep it. Asks for the password again. Needs View and Edit.",
  "perm.roles:read": "See every role and the permissions it holds.",
  "perm.roles:write":
    "Create, change and delete roles, using only permissions they hold themselves and never their own role. Asks for the password again. Needs View."
};

/** The panel's core keys (navigation, common words); each screen area adds its own in ./messages. */
export type CoreKey = keyof typeof fr;
