import { describe, expect, it } from "vitest";
import {
  hasCompletePreview,
  isArchivePreview,
  mergeHttpPreview,
  previewDisplayExtension,
  previewFromTorrent,
} from "./confirmationPreview";
import type { DownloadPreview } from "../services/downloadService";

const base: DownloadPreview = {
  url: "https://example.test/file.zip",
  fileName: "file.zip",
  fileSize: 128,
  mimeType: "application/zip",
  extension: "zip",
};

describe("confirmation preview", () => {
  it("recognizes a complete preview and rejects placeholder data", () => {
    expect(hasCompletePreview(base)).toBe(true);
    expect(hasCompletePreview({ ...base, fileName: "download.bin" })).toBe(
      false,
    );
  });

  it("normalizes ready and pending torrent metadata", () => {
    const ready = previewFromTorrent("magnet:?xt=urn:btih:test", {
      status: "ready",
      infoHash: "test",
      name: "release.7z",
      totalSize: 42,
      files: [],
    });
    expect(ready).toMatchObject({
      fileName: "release.7z",
      fileSize: 42,
      extension: "7z",
    });
    expect(
      previewFromTorrent("magnet:?xt=urn:btih:test", {
        status: "fetchingMetadata",
        infoHash: "test",
      }),
    ).toMatchObject({
      fileName: "Torrent Download",
      fileSize: null,
      extension: "torrent",
    });
  });

  it("keeps useful previous metadata when HTTP inspection returns placeholders", () => {
    const merged = mergeHttpPreview(
      {
        ...base,
        url: "",
        fileName: "download.bin",
        fileSize: null,
        mimeType: null,
        extension: null,
      },
      base,
      "https://fallback.test/file.zip",
    );
    expect(merged).toMatchObject({
      url: "https://fallback.test/file.zip",
      fileName: "file.zip",
      extension: "zip",
      fileSize: 128,
      mimeType: "application/zip",
    });
  });

  it("derives a visible extension when the backend omits it", () => {
    expect(previewDisplayExtension({ ...base, extension: null })).toBe("ZIP");
    expect(previewDisplayExtension(null)).toBe("ARQUIVO");
  });

  it("identifies supported archives", () => {
    expect(isArchivePreview(base)).toBe(true);
    expect(isArchivePreview({ ...base, extension: "mp4" })).toBe(false);
  });
});
