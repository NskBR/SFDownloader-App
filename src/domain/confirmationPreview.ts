import type {
  DownloadPreview,
  TorrentMetadataResponse,
} from "../services/downloadService";
import { cleanExtension } from "./categories";

const usableExtension = (value: string | null | undefined): string | null => {
  if (!value || value.trim().toLowerCase() === "bin") return null;
  return value;
};

const extensionFromFileName = (
  fileName: string | null | undefined,
): string | null => usableExtension(fileName ? cleanExtension(fileName) : null);

export function hasCompletePreview(preview: DownloadPreview | null): boolean {
  return Boolean(
    preview &&
    preview.fileSize &&
    preview.fileSize > 0 &&
    preview.extension &&
    preview.extension !== "N/A" &&
    preview.fileName &&
    preview.fileName !== "download.bin",
  );
}

export function previewFromTorrent(
  url: string,
  metadata: TorrentMetadataResponse,
): DownloadPreview {
  const fileName =
    metadata.status === "failed"
      ? "Torrent Download"
      : metadata.name || "Torrent Download";
  const extension = fileName.includes(".")
    ? fileName.split(".").pop()?.toLowerCase() || null
    : null;
  return {
    url,
    fileName,
    fileSize: metadata.status === "ready" ? metadata.totalSize : null,
    mimeType: "application/x-bittorrent",
    extension: extension || "torrent",
  };
}

export function mergeHttpPreview(
  result: DownloadPreview,
  previous: DownloadPreview | null,
  fallbackUrl: string,
): DownloadPreview {
  return {
    url: result.url || fallbackUrl,
    fileName:
      result.fileName && result.fileName !== "download.bin"
        ? result.fileName
        : previous?.fileName && previous.fileName !== "download.bin"
          ? previous.fileName
          : result.fileName,
    fileSize: result.fileSize || previous?.fileSize || null,
    mimeType: result.mimeType || previous?.mimeType || null,
    extension:
      usableExtension(result.extension) ||
      extensionFromFileName(result.fileName) ||
      usableExtension(previous?.extension) ||
      extensionFromFileName(previous?.fileName) ||
      null,
  };
}

export function previewDisplayExtension(
  preview: DownloadPreview | null,
): string {
  if (
    preview?.extension &&
    preview.extension.trim() &&
    preview.extension.toLowerCase() !== "bin"
  )
    return preview.extension.toUpperCase();
  if (preview?.fileName) {
    const extension = cleanExtension(preview.fileName);
    if (extension) return extension.toUpperCase();
  }
  if (preview?.url) {
    const extension = cleanExtension(preview.url);
    if (extension) return extension.toUpperCase();
  }
  return "ARQUIVO";
}

export function isArchivePreview(preview: DownloadPreview | null): boolean {
  const extension = preview?.extension?.toLowerCase() ?? "";
  return ["zip", "7z", "rar", "tar", "gz", "tgz"].includes(extension);
}
