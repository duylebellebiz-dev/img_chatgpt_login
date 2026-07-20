import sharp from "sharp";
import { stat, writeFile } from "node:fs/promises";

const THUMB_WIDTH = 320;
const THUMB_QUALITY = 70;
// Guard against decompression-bomb memory exhaustion (default sharp limit is 268M px).
const MAX_INPUT_PIXELS = 100_000_000; // 100MP (e.g. ~10000x10000)

export function thumbPathForImage(imagePath: string): string {
  return imagePath.replace(/\.(png|jpe?g|webp)$/i, ".thumb.jpg");
}

export function thumbUrlForImage(imageUrl: string): string {
  return imageUrl.replace(/\.(png|jpe?g|webp)$/i, ".thumb.jpg");
}

export async function generateImageThumbnail(imagePath: string): Promise<string> {
  const thumbPath = thumbPathForImage(imagePath);
  const buf = await sharp(imagePath, { limitInputPixels: MAX_INPUT_PIXELS })
    .resize({ width: THUMB_WIDTH, withoutEnlargement: true })
    .jpeg({ quality: THUMB_QUALITY })
    .toBuffer();
  await writeFile(thumbPath, buf);
  return thumbPath;
}

export async function generateImageThumbnailFromBuffer(buffer: Buffer, outputPath: string): Promise<void> {
  const thumbPath = thumbPathForImage(outputPath);
  const buf = await sharp(buffer, { limitInputPixels: MAX_INPUT_PIXELS })
    .resize({ width: THUMB_WIDTH, withoutEnlargement: true })
    .jpeg({ quality: THUMB_QUALITY })
    .toBuffer();
  await writeFile(thumbPath, buf);
}

export async function imageThumbExists(imageFullPath: string): Promise<boolean> {
  try {
    await stat(thumbPathForImage(imageFullPath));
    return true;
  } catch {
    return false;
  }
}
