/** Shrink a photo in the browser before upload (faster on weak mobile networks). Re-encoding also drops EXIF/GPS metadata. */
export async function shrinkImage(file: File, maxEdge = 1280, quality = 0.78): Promise<File> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) throw new Error(`${file.name}: only JPEG, PNG or WebP photos are accepted`);
  const bmp = await createImageBitmap(file, { imageOrientation: "from-image" }).catch(() => null);
  if (!bmp) throw new Error(`${file.name}: could not read this image`);
  const k = Math.min(1, maxEdge / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(bmp.width * k));
  c.height = Math.max(1, Math.round(bmp.height * k));
  c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close?.();

  const webpBlob: Blob | null = await new Promise((r) => c.toBlob(r, "image/webp", quality));
  if (webpBlob && webpBlob.size > 0 && webpBlob.type === "image/webp") {
    return new File([webpBlob], file.name.replace(/\.\w+$/, "") + ".webp", { type: "image/webp" });
  }
  const jpegBlob: Blob | null = await new Promise((r) => c.toBlob(r, "image/jpeg", quality));
  if (!jpegBlob) throw new Error(`${file.name}: could not process this image`);
  return new File([jpegBlob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
}
export const blobToDataUrl = (b: Blob) =>
  new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = rej;
    r.readAsDataURL(b);
  });
