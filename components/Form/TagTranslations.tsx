import type { TagTranslations as TagMap } from "@/api/functions/admin.api";
import { Input } from "@/components/ui/input";
import { CONTENT_LOCALES, isRtl, LOCALE_LABELS } from "@/lib/i18n/dictionaries";
import { useT } from "@/lib/i18n/useT";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";

/** French is the word itself; these are typed beside it. */
const OTHERS = CONTENT_LOCALES.filter((l) => l !== "fr");

/**
 * Under a list of words (amenities, cuisines, features…): each word, French as
 * typed in the list, with a box per other language. The words stay French in
 * the list — filters and search read them — and the item's `tagTranslations`
 * carries what the website shows instead. Several lists of one item share the
 * one map; each block shows only its own words.
 */
export default function TagTranslations({
  words,
  value,
  onChange,
  disabled
}: {
  words: string[];
  value: TagMap;
  onChange: (next: TagMap) => void;
  disabled?: boolean;
}) {
  const { t } = useT();
  const list = [...new Set(words.map((w) => w.trim()).filter(Boolean))];
  const done = list.filter((w) => OTHERS.some((l) => value[w]?.[l])).length;
  // Follows the words until clicked: closed while nothing is translated yet.
  const [toggled, setToggled] = useState<boolean | null>(null);
  const open = toggled ?? done > 0;

  if (!list.length) return null;
  const Chevron = open ? ChevronDown : ChevronRight;

  return (
    <div className="mt-2 rounded-md border">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setToggled(!open)}
        className="flex w-full items-center gap-1.5 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
      >
        <Chevron className="size-3.5 rtl:-scale-x-100" />
        {t("tags.title")}
        <span className="ms-auto tabular-nums">
          {t("tags.count", { n: done, total: list.length })}
        </span>
      </button>
      {open ? (
        <div className="overflow-x-auto border-t">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-muted-foreground">
                <th className="px-2 py-1 text-start font-medium uppercase" title={LOCALE_LABELS.fr}>
                  fr
                </th>
                {OTHERS.map((l) => (
                  <th
                    key={l}
                    className="px-1 py-1 text-start font-medium uppercase"
                    title={LOCALE_LABELS[l]}
                  >
                    {l}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {list.map((w) => (
                <tr key={w} className="border-t">
                  <td className="px-2 py-1 font-medium whitespace-nowrap" lang="fr">
                    {w}
                  </td>
                  {OTHERS.map((l) => (
                    <td key={l} className="p-1">
                      <Input
                        className="h-7 min-w-24 px-2 text-xs"
                        dir={isRtl(l) ? "rtl" : "ltr"}
                        lang={l}
                        aria-label={`${w} (${LOCALE_LABELS[l]})`}
                        disabled={disabled}
                        value={value[w]?.[l] ?? ""}
                        onChange={(e) =>
                          onChange({ ...value, [w]: { ...value[w], [l]: e.target.value } })
                        }
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
