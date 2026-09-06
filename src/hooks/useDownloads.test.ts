import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { defaultSettings } from "../domain/settings";
import type { DownloadTask } from "../domain/download";

const listeners = new Map<string, (event: { payload: unknown }) => void>();
const listDownloads = vi.fn();
const pauseDownload = vi.fn();
const resumeDownload = vi.fn();

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn((eventName: string, handler: (event: { payload: unknown }) => void) => {
    listeners.set(eventName, handler);
    return Promise.resolve(() => undefined);
  }),
}));

vi.mock("../services/downloadService", () => ({
  listDownloads,
  pauseDownload,
  resumeDownload,
}));

const { useDownloads } = await import("./useDownloads");

function task(overrides: Partial<DownloadTask> = {}): DownloadTask {
  return {
    id: "download-1",
    fileName: "archive.zip",
    fileSize: 100,
    originalUrl: "https://example.test/archive.zip",
    currentUrl: "https://example.test/archive.zip",
    savePath: "C:/Downloads",
    tempPath: "C:/Downloads/archive.zip.part",
    finalPath: "C:/Downloads/archive.zip",
    status: "downloading",
    totalDownloaded: 20,
    speedCurrent: 5,
    speedAverage: 5,
    createdAt: "2026-08-28T00:00:00Z",
    updatedAt: "2026-08-28T00:00:00Z",
    supportsRange: true,
    speedLimitDownload: 0,
    etag: null,
    lastModified: null,
    mimeType: null,
    extension: "zip",
    completedAt: null,
    downloadType: "http",
    infoHash: null,
    seeds: 0,
    peers: 0,
    uploadSpeed: 0,
    totalUploaded: 0,
    priority: 1,
    queueOrder: 0,
    ...overrides,
  };
}

describe("useDownloads", () => {
  beforeEach(() => {
    listeners.clear();
    listDownloads.mockReset();
    pauseDownload.mockReset();
    resumeDownload.mockReset();
  });

  it("preserves newer progress when a stale refresh arrives", async () => {
    listDownloads.mockResolvedValue([task({ totalDownloaded: 20 })]);
    const { result } = renderHook(() => useDownloads(defaultSettings));

    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      listeners.get("download-progress")?.({
        payload: {
          id: "download-1",
          downloaded: 80,
          total: 100,
          speed: 10,
          status: "downloading",
          error: null,
        },
      });
    });

    expect(result.current.downloads[0]).toMatchObject({ totalDownloaded: 80, speedCurrent: 10 });
  });

  it("surfaces loading errors instead of rendering a silent empty list", async () => {
    listDownloads.mockRejectedValue(new Error("offline"));
    const { result } = renderHook(() => useDownloads(defaultSettings));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.downloads).toEqual([]);
    expect(result.current.error).toBe("Não foi possível carregar os downloads persistidos.");
  });

  it("updates local state after pause and resume controls", async () => {
    listDownloads.mockResolvedValue([task()]);
    pauseDownload.mockResolvedValue(true);
    resumeDownload.mockResolvedValue(undefined);
    const { result } = renderHook(() => useDownloads(defaultSettings));

    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => result.current.pause("download-1"));
    expect(result.current.downloads[0].status).toBe("paused");
    await act(async () => result.current.resume("download-1"));
    expect(result.current.downloads[0].status).toBe("downloading");
  });
});
