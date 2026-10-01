/**
 * Browser-only image helpers for profile photos.
 */

export const AVATAR_SIZE = 256;
/** Reject anything bigger before even decoding it. */
export const MAX_SOURCE_BYTES = 10 * 1024 * 1024;

/** A crop rectangle in the source image's own pixels. */
export interface PixelArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Check a picked file and return an object URL for the cropper. The caller
 * revokes it with `URL.revokeObjectURL` when done.
 */
export function prepareImageFile(file: File): string {
  if (!file.type.startsWith("image/")) {
    throw new Error("Please choose an image file.");
  }
  if (file.size > MAX_SOURCE_BYTES) {
    throw new Error("Please choose an image under 10 MB.");
  }
  return URL.createObjectURL(file);
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () =>
      reject(new Error("That file could not be read as an image."));
    img.src = src;
  });
}

/**
 * Cut the chosen square out of the image and shrink it to AVATAR_SIZE,
 * returning a compact JPEG data URL (typically 15–40 KB) ready to upload.
 */
export async function cropToAvatarDataUrl(
  src: string,
  area: PixelArea
): Promise<string> {
  const img = await loadImage(src);
  const side = Math.round(Math.min(area.width, area.height));
  if (!side) throw new Error("Please select part of the image.");
  const out = Math.min(AVATAR_SIZE, side);

  const canvas = document.createElement("canvas");
  canvas.width = out;
  canvas.height = out;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Your browser could not process the image.");
  // JPEG has no transparency: put transparent PNGs (and any area zoomed out
  // past the image edge) on white, not black.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, out, out);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, area.x, area.y, side, side, 0, 0, out, out);

  return canvas.toDataURL("image/jpeg", 0.85);
}
