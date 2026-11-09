/**
 * A photo straight from a phone or camera is often 3–8 MB and 4000 px wide;
 * the website now shows stored images as they are (no paid resizing service),
 * so they are made web-sized here, before they leave the office's browser:
 * at most 1920 px on the long side, JPEG at 82 % (a PNG stays a PNG, for
 * logos with transparency). Small files, SVGs and GIFs are sent untouched, and
 * any failure sends the original — a big photo beats a lost upload.
 */
const MAX_SIDE = 1920;
const SMALL_ENOUGH = 400 * 1024;

export async function shrinkImage(file: File): Promise<File> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size <= SMALL_ENOUGH) return file;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const type = file.type === "image/png" ? "image/png" : "image/jpeg";
    const blob = await new Promise<Blob | null>((done) => canvas.toBlob(done, type, 0.82));
    if (!blob || blob.size >= file.size) return file;
    const name = type === "image/jpeg" ? file.name.replace(/\.(png|webp|jpe?g)$/i, "") + ".jpg" : file.name;
    return new File([blob], name, { type, lastModified: file.lastModified });
  } catch {
    return file;
  }
}
