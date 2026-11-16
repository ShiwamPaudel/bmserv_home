// Photos are made smaller in the browser before upload: a phone photo of several MB becomes a
// sharp JPEG of a few hundred KB, so thumbnails load fast on hospital Wi-Fi and mobile data.

const MAX_SIDE = 1280;

/** `keepTransparency`: logos stay PNG with a clear background instead of a white JPEG. */
export async function shrinkImage(file: File, maxSide = MAX_SIDE, keepTransparency = false): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    return file; // the browser cannot read it: let the server's type and size checks decide
  }
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  if (scale === 1 && file.size < 400 * 1024) {
    bitmap.close();
    return file;
  }
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    return file;
  }
  if (!keepTransparency) {
    ctx.fillStyle = "#ffffff"; // transparent PNGs get a white background, not black
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const type = keepTransparency ? "image/png" : "image/jpeg";
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.85));
  if (!blob || blob.size >= file.size) return file;
  const name = file.name.replace(/\.[^.]+$/, "") + (keepTransparency ? ".png" : ".jpg");
  return new File([blob], name, { type });
}
