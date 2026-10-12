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
import { Label } from "@/components/ui/label";
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
  disabled
}: {
  label: string;
  hint: string;
  value: string;
  onChange: (next: string) => void;
  disabled: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const { mutate: upload, isPending } = useMutation({
    mutationFn: async (file: File) => uploadSiteImage(await slim(file)),
    meta: { showToast: false },
    onSuccess: (url) => {
      if (!url) return toast.error("The picture was not stored. Try again.");
      onChange(url);
      toast.success("Picture uploaded — save to put it on the website");
    },
    onError: (e) =>
      toast.error(
        (e as AxiosError<{ message?: string }>).response?.data?.message ?? "Upload failed"
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
            The picture built into the website is in use
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
                {isPending ? "Uploading…" : value ? "Replace picture" : "Upload a picture"}
              </Button>
              {value ? (
                <Button type="button" variant="ghost" size="sm" onClick={() => onChange("")}>
                  Use the built-in picture
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
              <div className="ml-auto flex gap-0.5">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  title="Move up"
                  aria-label="Move up"
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
                  title="Move down"
                  aria-label="Move down"
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
                  title="Remove"
                  aria-label="Remove"
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
          Nothing here yet.
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
            <span className="ml-3 text-[11px] text-muted-foreground">
              {max} at most.
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

const PICTURE_HINT =
  "JPEG, PNG, WebP or AVIF. A wide landscape photo works best; a large one is made lighter automatically so the page stays quick to open.";

export default function SiteEditor<K extends SiteSection>({
  section,
  value,
  onPatch,
  shape,
  canWrite
}: {
  section: K;
  value: SiteContent[K];
  /** The fields that changed, to be laid over the section as it then stands. */
  onPatch: (part: Partial<SiteContent[K]>) => void;
  shape: Shape;
  canWrite: boolean;
}) {
  const { admin } = useCan();
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
      Office addresses, phone numbers, WhatsApp and opening hours are not typed
      here: they come from{" "}
      {canOpenSettings ? (
        <Link href="/settings" className="font-medium text-foreground underline">
          Settings → Offices
        </Link>
      ) : (
        <span className="font-medium text-foreground">Settings → Offices</span>
      )}
      , so they stay the same everywhere on the website.
    </Note>
  );

  if (section === "home") {
    const v = value as SiteContent["home"];
    return (
      <Card className="gap-4 p-5">
        <div>
          <h2 className="text-sm font-medium">Banner at the top of the home page</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            The large picture behind the search box, and the two lines of text
            written over it.
          </p>
        </div>
        <SitePicture
          label="Background picture"
          hint={PICTURE_HINT}
          value={v.heroImage}
          disabled={disabled}
          onChange={(heroImage) => patch({ heroImage })}
        />
        {text("heroTitle", "Headline")}
        {text("heroSubtitle", "Text under the headline", { multiline: true })}
      </Card>
    );
  }

  if (section === "about") {
    const v = value as SiteContent["about"];
    return (
      <div className="flex flex-col gap-5">
        <Card className="gap-4 p-5">
          <h2 className="text-sm font-medium">Top of the About page</h2>
          <SitePicture
            label="Banner picture"
            hint={PICTURE_HINT}
            value={v.image}
            disabled={disabled}
            onChange={(image) => patch({ image })}
          />
          {text("title", "Headline")}
          {text("intro", "Introduction", { multiline: true })}
        </Card>

        <Card className="gap-4 p-5">
          <div>
            <h2 className="text-sm font-medium">Blocks</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              The boxes under the banner, each with a heading and a paragraph.
            </p>
          </div>
          <Repeater
            items={v.sections}
            disabled={disabled}
            max={shape.sections?.max}
            addLabel="Add a block"
            itemLabel={(i) => `Block ${i + 1}`}
            blank={() => ({ title: {}, body: {} })}
            onChange={(sections) => patch({ sections })}
            render={(item, set) => (
              <>
                <LocalizedInput
                  label="Heading"
                  required
                  disabled={disabled}
                  maxLength={limit(shape, "sections", "title")}
                  value={item.title}
                  onChange={(title) => set({ ...item, title })}
                />
                <LocalizedInput
                  label="Text"
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
            <h2 className="text-sm font-medium">Highlighted list</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              The framed box at the bottom of the page: a heading and a list of
              short lines.
            </p>
          </div>
          {text("listTitle", "Heading")}
          <Repeater
            items={v.listItems}
            disabled={disabled}
            max={shape.listItems?.max}
            addLabel="Add a line"
            itemLabel={(i) => `Line ${i + 1}`}
            blank={() => ({})}
            onChange={(listItems) => patch({ listItems })}
            render={(item, set) => (
              <LocalizedInput
                label="Text"
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
        <h2 className="text-sm font-medium">Contact page</h2>
        {text("intro", "Introduction under the page title", { multiline: true })}
        {text("formTitle", "Heading above the message form")}
        {text("formIntro", "Text above the message form", { multiline: true, rows: 2 })}
        {offices}
      </Card>
    );
  }

  if (section === "help") {
    const v = value as SiteContent["help"];
    return (
      <div className="flex flex-col gap-5">
        <Card className="gap-4 p-5">
          <h2 className="text-sm font-medium">Help page</h2>
          {text("intro", "Introduction under the page title", { multiline: true, rows: 2 })}
        </Card>

        <Card className="gap-4 p-5">
          <div>
            <h2 className="text-sm font-medium">Questions and answers</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Shown in this order. The first one is open when the page loads.
            </p>
          </div>
          <Repeater
            items={v.faq}
            disabled={disabled}
            max={shape.faq?.max}
            addLabel="Add a question"
            itemLabel={(i) => `Question ${i + 1}`}
            blank={() => ({ question: {}, answer: {} })}
            onChange={(faq) => patch({ faq })}
            render={(item, set) => (
              <>
                <LocalizedInput
                  label="Question"
                  required
                  disabled={disabled}
                  maxLength={limit(shape, "faq", "question")}
                  value={item.question}
                  onChange={(question) => set({ ...item, question })}
                />
                <LocalizedInput
                  label="Answer"
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
            <h2 className="text-sm font-medium">Closing box</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              The dark box under the questions, above the Call and WhatsApp
              buttons.
            </p>
          </div>
          {text("contactTitle", "Heading")}
          {text("contactText", "Text", { multiline: true, rows: 2 })}
          {offices}
        </Card>
      </div>
    );
  }

  return (
    <Card className="gap-4 p-5">
      <div>
        <h2 className="text-sm font-medium">Footer</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          The dark band at the bottom of every page.
        </p>
      </div>
      {text("tagline", "Line under the logo")}
      <div>
        {text("notice", "No-refund reminder", { multiline: true })}
        <p className="mt-1.5 text-[11px] text-muted-foreground">
          One sentence for the whole website: it is printed here in the footer,
          beside the price on every offer, in the checkout summary and at the
          top of the Terms page.
        </p>
      </div>
      <div>
        {text("copyright", "Copyright line")}
        <p className="mt-1.5 text-[11px] text-muted-foreground">
          Printed after “© {new Date().getFullYear()}” — the year is added for
          you and changes by itself.
        </p>
      </div>
      {offices}
      <Note>
        The menus in the footer (services, company, legal) follow the pages of
        the website and are not edited here.
      </Note>
    </Card>
  );
}
