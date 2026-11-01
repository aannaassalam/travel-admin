import {
  uploadSiteImage,
  type Localized,
  type SiteContent,
  type SiteField,
  type SiteSection
} from "@/api/functions/admin.api";
import AssetImage from "@/components/Form/AssetImage";
import LocalizedInput from "@/components/Form/LocalizedInput";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useT } from "@/lib/i18n/useT";
import { canOpenRoute, useCan } from "@/lib/permissions";
import { useMutation } from "@tanstack/react-query";
import { AxiosError } from "axios";
import { ArrowDown, ArrowUp, ImagePlus, Info, Loader2, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRef } from "react";
import { toast } from "sonner";

/**
 * The forms for the five parts of the website the office edits itself.
 *
 * Every piece of text is typed once per language. French is the one that must
 * be there: it is what the site shows by default and what the other languages
 * fall back to.
 */

type Shape = Record<string, SiteField>;

/** The limit the server gave for a field, so the box stops where a save would be refused. */
const limit = (shape: Shape, key: string, part?: string) => {
  const field = shape[key];
  if (!part) return field?.max;
  return (field?.of as Record<string, SiteField> | undefined)?.[part]?.max;
};

function Note({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border bg-muted/40 px-3 py-2.5 text-xs text-muted-foreground">
      <Info className="mt-0.5 size-3.5 shrink-0" />
      <p>{children}</p>
    </div>
  );
}

/** As wide as a banner is ever drawn, with room for a sharp screen. */
const PICTURE_WIDTH = 2400;

/**
 * A photo straight off a phone is 4 to 12 MB and 4000 pixels wide. The banner
 * needs a fraction of that, the server refuses anything over 8 MB, and the
 * website's image service gives up on an original it cannot fetch quickly —
 * so a large picture is scaled down and re-saved as a JPEG before it leaves
 * the browser. Small ones go exactly as they are.
 */
async function slim(file: File): Promise<File> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const scale = Math.min(1, PICTURE_WIDTH / img.naturalWidth);
    if (scale === 1 && file.size <= 1_500_000) return file;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    // JPEG has no transparency: white is what a see-through corner becomes.
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((done) =>
      canvas.toBlob(done, "image/jpeg", 0.85)
    );
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], `${file.name.replace(/\.[^.]+$/, "")}.jpg`, {
      type: "image/jpeg"
    });
  } catch {
    // A browser that cannot read it sends the original; the server still
    // checks its type and size.
    return file;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** One picture: what is in use now, and a way to replace it or go back to the built-in one. */
function SitePicture({
  label,
  hint,
  value,
  onChange,
  disabled,
  optional
}: {
  label: string;
  hint: string;
  value: string;
  onChange: (next: string) => void;
  disabled: boolean;
  /** Nothing built in behind it: empty is no picture at all. */
  optional?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const { t } = useT();
  const { mutate: upload, isPending } = useMutation({
    mutationFn: async (file: File) => uploadSiteImage(await slim(file)),
    meta: { showToast: false },
    onSuccess: (url) => {
      if (!url) return toast.error(t("sys.site.notStored"));
      onChange(url);
      toast.success(t("sys.site.uploaded"));
    },
    onError: (e) =>
      toast.error(
        (e as AxiosError<{ message?: string }>).response?.data?.message ??
          t("sys.site.uploadFailed")
      )
  });

  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <div className="mt-1 flex flex-wrap items-center gap-4 rounded-lg border border-dashed p-3">
        {value ? (
          <AssetImage src={value} className="h-24 w-44" />
        ) : (
          <div className="flex h-24 w-44 items-center justify-center rounded border bg-muted/40 px-3 text-center text-[11px] text-muted-foreground">
            {optional ? t("sys.site.noPicture") : t("sys.site.builtInInUse")}
          </div>
        )}
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          {!disabled ? (
            <div className="flex flex-wrap gap-2">
              <input
                ref={input}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/avif"
                hidden
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  // Reset so choosing the same file again still fires.
                  e.target.value = "";
                  if (file) upload(file);
                }}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-2"
                disabled={isPending}
                onClick={() => input.current?.click()}
              >
                {isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <ImagePlus className="size-4" />
                )}
                {isPending
                  ? t("sys.site.uploading")
                  : value
                    ? t("sys.site.replacePicture")
                    : t("sys.site.uploadPicture")}
              </Button>
              {value ? (
                <Button type="button" variant="ghost" size="sm" onClick={() => onChange("")}>
                  {optional ? t("sys.site.removePicture") : t("sys.site.useBuiltInPicture")}
                </Button>
              ) : null}
            </div>
          ) : null}
          <p className="text-[11px] text-muted-foreground">{hint}</p>
        </div>
      </div>
    </div>
  );
}

/** A list that can grow, shrink and be put in order: questions, blocks, lines. */
function Repeater<T>({
  items,
  onChange,
  render,
  blank,
  max,
  addLabel,
  itemLabel,
  disabled
}: {
  items: T[];
  onChange: (next: T[]) => void;
  render: (item: T, set: (next: T) => void) => React.ReactNode;
  blank: () => T;
  max?: number;
  addLabel: string;
  itemLabel: (index: number) => string;
  disabled: boolean;
}) {
  const { t } = useT();
  const move = (from: number, to: number) => {
    const next = [...items];
    next.splice(to, 0, next.splice(from, 1)[0]);
    onChange(next);
  };

  return (
    <div className="flex flex-col gap-3">
      {items.map((item, i) => (
        // Position is the identity here: these have no id of their own, and a
        // key that follows the text would remount the box on every keystroke.
        <div key={i} className="rounded-lg border p-3">
          <div className="mb-2 flex items-center gap-1">
            <p className="text-xs font-medium text-muted-foreground">{itemLabel(i)}</p>
            {!disabled ? (
              <div className="ms-auto flex gap-0.5">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  title={t("sys.site.moveUp")}
                  aria-label={t("sys.site.moveUp")}
                  disabled={i === 0}
                  onClick={() => move(i, i - 1)}
                >
                  <ArrowUp className="size-3.5" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  title={t("sys.site.moveDown")}
                  aria-label={t("sys.site.moveDown")}
                  disabled={i === items.length - 1}
                  onClick={() => move(i, i + 1)}
                >
                  <ArrowDown className="size-3.5" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-7 text-red-600 hover:text-red-700"
                  title={t("sys.site.remove")}
                  aria-label={t("sys.site.remove")}
                  onClick={() => onChange(items.filter((_, n) => n !== i))}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            ) : null}
          </div>
          <div className="flex flex-col gap-3">
            {render(item, (next) => onChange(items.map((x, n) => (n === i ? next : x))))}
          </div>
        </div>
      ))}
      {!items.length ? (
        <p className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
          {t("sys.site.empty")}
        </p>
      ) : null}
      {!disabled ? (
        <div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-2"
            disabled={max !== undefined && items.length >= max}
            onClick={() => onChange([...items, blank()])}
          >
            <Plus className="size-4" />
            {addLabel}
          </Button>
          {max !== undefined && items.length >= max ? (
            <span className="ms-3 text-[11px] text-muted-foreground">
              {t("sys.site.atMost", { max })}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export default function SiteEditor<K extends SiteSection>({
  section,
  value,
  onPatch,
  shape,
  builtIn,
  canWrite
}: {
  section: K;
  value: SiteContent[K];
  /** The fields that changed, to be laid over the section as it then stands. */
  onPatch: (part: Partial<SiteContent[K]>) => void;
  shape: Shape;
  /** The section as the website shipped it. */
  builtIn?: SiteContent[K];
  canWrite: boolean;
}) {
  const { admin } = useCan();
  const { t } = useT();
  const pictureHint = t("sys.site.pictureHint");
  const ideaPictureHint = t("sys.site.ideaPictureHint");
  const canOpenSettings = canOpenRoute(admin?.permissions, "/settings");
  const disabled = !canWrite;
  const patch = (part: Record<string, unknown>) => onPatch(part as Partial<SiteContent[K]>);

  // One text field of this section, in every language.
  const text = (
    key: string,
    label: string,
    opts: { multiline?: boolean; rows?: number } = {}
  ) => (
    <LocalizedInput
      key={key}
      label={label}
      required
      disabled={disabled}
      multiline={opts.multiline}
      rows={opts.rows}
      maxLength={limit(shape, key)}
      value={(value as unknown as Record<string, Localized>)[key] ?? {}}
      onChange={(next) => patch({ [key]: next })}
    />
  );

  const offices = (
    <Note>
      {t("sys.site.officesBefore")}{" "}
      {canOpenSettings ? (
        <Link href="/settings" className="font-medium text-foreground underline">
          {t("sys.site.officesLink")}
        </Link>
      ) : (
        <span className="font-medium text-foreground">{t("sys.site.officesLink")}</span>
      )}
      {t("sys.site.officesAfter")}
    </Note>
  );

  if (section === "home") {
    const v = value as SiteContent["home"];
    // The six cards the website came with: one click puts them back in the
    // form (a picture once replaced cannot be picked again otherwise).
    const built = builtIn as SiteContent["home"] | undefined;
    const shipped = built && {
      ideasTitle: built.ideasTitle,
      ideasSubtitle: built.ideasSubtitle,
      ideas: built.ideas
    };
    const asShipped =
      !shipped ||
      JSON.stringify(shipped) ===
        JSON.stringify({ ideasTitle: v.ideasTitle, ideasSubtitle: v.ideasSubtitle, ideas: v.ideas });
    return (
      <div className="flex flex-col gap-5">
        <Card className="gap-4 p-5">
          <div>
            <h2 className="text-sm font-medium">{t("sys.site.heroTitle")}</h2>
            <p className="mt-1 text-xs text-muted-foreground">{t("sys.site.heroIntro")}</p>
          </div>
          <SitePicture
            label={t("sys.site.backgroundPicture")}
            hint={pictureHint}
            value={v.heroImage}
            disabled={disabled}
            onChange={(heroImage) => patch({ heroImage })}
          />
          {text("heroTitle", t("sys.site.headline"))}
          {text("heroSubtitle", t("sys.site.underHeadline"), { multiline: true })}
        </Card>

        {/* §15: "Ideas worth travelling for", once fixed in the website's code. */}
        <Card className="gap-4 p-5">
          <div>
            <h2 className="text-sm font-medium">{t("sys.site.ideas")}</h2>
            <p className="mt-1 text-xs text-muted-foreground">{t("sys.site.ideasIntro")}</p>
            {!disabled && shipped && !asShipped ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="mt-3"
                onClick={() => patch(shipped)}
              >
                {t("sys.site.useBuiltInIdeas")}
              </Button>
            ) : null}
          </div>
          {text("ideasTitle", t("sys.site.heading"))}
          {text("ideasSubtitle", t("sys.site.underHeading"), { multiline: true, rows: 2 })}
          <Repeater
            items={v.ideas ?? []}
            disabled={disabled}
            max={shape.ideas?.max}
            addLabel={t("sys.site.addIdea")}
            itemLabel={(i) => t("sys.site.idea", { n: i + 1 })}
            blank={() => ({ title: {}, kicker: {}, body: {}, image: "", href: "" })}
            onChange={(ideas) => patch({ ideas })}
            render={(item, set) => (
              <>
                <SitePicture
                  label={t("sys.site.picture")}
                  hint={ideaPictureHint}
                  optional
                  value={item.image}
                  disabled={disabled}
                  onChange={(image) => set({ ...item, image })}
                />
                <LocalizedInput
                  label={t("sys.site.kicker")}
                  required
                  disabled={disabled}
                  maxLength={limit(shape, "ideas", "kicker")}
                  placeholder={t("sys.site.kickerPlaceholder")}
                  value={item.kicker}
                  onChange={(kicker) => set({ ...item, kicker })}
                />
                <LocalizedInput
                  label={t("sys.site.title")}
                  required
                  disabled={disabled}
                  maxLength={limit(shape, "ideas", "title")}
                  value={item.title}
                  onChange={(title) => set({ ...item, title })}
                />
                <LocalizedInput
                  label={t("sys.site.text")}
                  required
                  multiline
                  rows={2}
                  disabled={disabled}
                  maxLength={limit(shape, "ideas", "body")}
                  value={item.body}
                  onChange={(body) => set({ ...item, body })}
                />
                <div>
                  <Label className="text-xs">{t("sys.site.link")}</Label>
                  <Input
                    disabled={disabled}
                    maxLength={limit(shape, "ideas", "href")}
                    placeholder="/activities?destination=Goma"
                    value={item.href}
                    onChange={(e) => set({ ...item, href: e.target.value })}
                  />
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {t("sys.site.linkHint")}
                  </p>
                </div>
              </>
            )}
          />
        </Card>
      </div>
    );
  }

  if (section === "about") {
    const v = value as SiteContent["about"];
    return (
      <div className="flex flex-col gap-5">
        <Card className="gap-4 p-5">
          <h2 className="text-sm font-medium">{t("sys.site.aboutTop")}</h2>
          <SitePicture
            label={t("sys.site.bannerPicture")}
            hint={pictureHint}
            value={v.image}
            disabled={disabled}
            onChange={(image) => patch({ image })}
          />
          {text("title", t("sys.site.headline"))}
          {text("intro", t("sys.site.introduction"), { multiline: true })}
        </Card>

        <Card className="gap-4 p-5">
          <div>
            <h2 className="text-sm font-medium">{t("sys.site.blocks")}</h2>
            <p className="mt-1 text-xs text-muted-foreground">{t("sys.site.blocksIntro")}</p>
          </div>
          <Repeater
            items={v.sections}
            disabled={disabled}
            max={shape.sections?.max}
            addLabel={t("sys.site.addBlock")}
            itemLabel={(i) => t("sys.site.block", { n: i + 1 })}
            blank={() => ({ title: {}, body: {} })}
            onChange={(sections) => patch({ sections })}
            render={(item, set) => (
              <>
                <LocalizedInput
                  label={t("sys.site.heading")}
                  required
                  disabled={disabled}
                  maxLength={limit(shape, "sections", "title")}
                  value={item.title}
                  onChange={(title) => set({ ...item, title })}
                />
                <LocalizedInput
                  label={t("sys.site.text")}
                  required
                  multiline
                  rows={4}
                  disabled={disabled}
                  maxLength={limit(shape, "sections", "body")}
                  value={item.body}
                  onChange={(body) => set({ ...item, body })}
                />
              </>
            )}
          />
        </Card>

        <Card className="gap-4 p-5">
          <div>
            <h2 className="text-sm font-medium">{t("sys.site.highlighted")}</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {t("sys.site.highlightedIntro")}
            </p>
          </div>
          {text("listTitle", t("sys.site.heading"))}
          <Repeater
            items={v.listItems}
            disabled={disabled}
            max={shape.listItems?.max}
            addLabel={t("sys.site.addLine")}
            itemLabel={(i) => t("sys.site.line", { n: i + 1 })}
            blank={() => ({})}
            onChange={(listItems) => patch({ listItems })}
            render={(item, set) => (
              <LocalizedInput
                label={t("sys.site.text")}
                required
                multiline
                rows={2}
                disabled={disabled}
                maxLength={(shape.listItems?.of as SiteField | undefined)?.max}
                value={item}
                onChange={set}
              />
            )}
          />
        </Card>
      </div>
    );
  }

  if (section === "contact") {
    return (
      <Card className="gap-4 p-5">
        <h2 className="text-sm font-medium">{t("sys.site.contactPage")}</h2>
        {text("intro", t("sys.site.introUnderTitle"), { multiline: true })}
        {text("formTitle", t("sys.site.formHeading"))}
        {text("formIntro", t("sys.site.formText"), { multiline: true, rows: 2 })}
        {offices}
      </Card>
    );
  }

  if (section === "help") {
    const v = value as SiteContent["help"];
    return (
      <div className="flex flex-col gap-5">
        <Card className="gap-4 p-5">
          <h2 className="text-sm font-medium">{t("sys.site.helpPage")}</h2>
          {text("intro", t("sys.site.introUnderTitle"), { multiline: true, rows: 2 })}
        </Card>

        <Card className="gap-4 p-5">
          <div>
            <h2 className="text-sm font-medium">{t("sys.site.faq")}</h2>
            <p className="mt-1 text-xs text-muted-foreground">{t("sys.site.faqIntro")}</p>
          </div>
          <Repeater
            items={v.faq}
            disabled={disabled}
            max={shape.faq?.max}
            addLabel={t("sys.site.addQuestion")}
            itemLabel={(i) => t("sys.site.questionN", { n: i + 1 })}
            blank={() => ({ question: {}, answer: {} })}
            onChange={(faq) => patch({ faq })}
            render={(item, set) => (
              <>
                <LocalizedInput
                  label={t("sys.site.question")}
                  required
                  disabled={disabled}
                  maxLength={limit(shape, "faq", "question")}
                  value={item.question}
                  onChange={(question) => set({ ...item, question })}
                />
                <LocalizedInput
                  label={t("sys.site.answer")}
                  required
                  multiline
                  rows={4}
                  disabled={disabled}
                  maxLength={limit(shape, "faq", "answer")}
                  value={item.answer}
                  onChange={(answer) => set({ ...item, answer })}
                />
              </>
            )}
          />
        </Card>

        <Card className="gap-4 p-5">
          <div>
            <h2 className="text-sm font-medium">{t("sys.site.closingBox")}</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {t("sys.site.closingBoxIntro")}
            </p>
          </div>
          {text("contactTitle", t("sys.site.heading"))}
          {text("contactText", t("sys.site.text"), { multiline: true, rows: 2 })}
          {offices}
        </Card>
      </div>
    );
  }

  return (
    <Card className="gap-4 p-5">
      <div>
        <h2 className="text-sm font-medium">{t("sys.site.footer")}</h2>
        <p className="mt-1 text-xs text-muted-foreground">{t("sys.site.footerIntro")}</p>
      </div>
      {text("tagline", t("sys.site.tagline"))}
      <div>
        {text("notice", t("sys.site.notice"), { multiline: true })}
        <p className="mt-1.5 text-[11px] text-muted-foreground">{t("sys.site.noticeHint")}</p>
      </div>
      <div>
        {text("noticeTitle", t("sys.site.noticeTitle"))}
        <p className="mt-1.5 text-[11px] text-muted-foreground">
          {t("sys.site.noticeTitleHint")}
        </p>
      </div>
      <div>
        {text("noticeShort", t("sys.site.noticeShort"))}
        <p className="mt-1.5 text-[11px] text-muted-foreground">
          {t("sys.site.noticeShortHint")}
        </p>
      </div>
      <div>
        {text("copyright", t("sys.site.copyright"))}
        <p className="mt-1.5 text-[11px] text-muted-foreground">
          {t("sys.site.copyrightHint", { year: new Date().getFullYear() })}
        </p>
      </div>
      {offices}
      <Note>{t("sys.site.menusNote")}</Note>
    </Card>
  );
}
