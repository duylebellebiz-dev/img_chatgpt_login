import { execFile } from "node:child_process";
import { stat, unlink } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const FFMPEG_THUMB_TIMEOUT_MS = 15_000;

export function thumbPathForVideo(videoPath: string): string {
  return `${videoPath}.thumb.jpg`;
}

export function thumbUrlForVideo(videoUrl: string): string {
  return `${videoUrl}.thumb.jpg`;
}

export async function generateVideoThumbnail(videoPath: string): Promise<string> {
  const thumbPath = thumbPathForVideo(videoPath);
  try {
    await execFileAsync("ffmpeg", [
      "-y",
      "-i", videoPath,
      "-vframes", "1",
      "-q:v", "4",
      "-vf", "scale='min(320,iw)':-2",
      thumbPath,
    ], {
      timeout: FFMPEG_THUMB_TIMEOUT_MS,
      killSignal: process.platform === "win32" ? "SIGTERM" : "SIGKILL",
      maxBuffer: 1024 * 1024,
    });
    return thumbPath;
  } catch {
    await unlink(thumbPath).catch(() => {});
    throw new Error(`Failed to generate thumbnail for ${videoPath}`);
  }
}

export async function ensureVideoThumbnail(generatedDir: string, filename: string): Promise<boolean> {
  const videoPath = join(generatedDir, filename);
  const thumbPath = thumbPathForVideo(videoPath);
  try {
    await stat(thumbPath);
    return true;
  } catch {
    try {
      await generateVideoThumbnail(videoPath);
      return true;
    } catch {
      return false;
    }
  }
}

export async function videoThumbExists(videoFullPath: string): Promise<boolean> {
  try {
    await stat(thumbPathForVideo(videoFullPath));
    return true;
  } catch {
    return false;
  }
}
