import type { Localized, TagTranslations } from "@/api/functions/admin.api";
import { currentLocale } from "@/lib/i18n/messages";

/**
 * A stored text as an editor holds it: its languages, or — from a record saved
 * before the text had languages — the plain string, which is French.
 */
export const toLocalized = (v: unknown): Localized =>
  typeof v === "string"
    ? { fr: v }
    : v && typeof v === "object"
      ? { ...(v as Localized) }
      : {};

/**
 * A stored text in the panel's language, else English, else French (French:
 * else English), else whichever language is filled.
 */
export const lz = (v: unknown, locale: string = currentLocale()) => {
  const l = toLocalized(v);
  return l[locale] || l.en || l.fr || Object.values(l).find(Boolean) || "";
};

/**
 * A word of an item's list in the panel's language, else English, else the
 * word itself. The French is the word itself.
 */
export const tagText = (
  map: TagTranslations | undefined,
  word: string,
  locale: string = currentLocale()
) => (locale !== "fr" && (map?.[word]?.[locale] || map?.[word]?.en)) || word;
