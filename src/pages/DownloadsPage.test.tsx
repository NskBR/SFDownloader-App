import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DownloadTask } from "../domain/download";
import { defaultSettings } from "../domain/settings";

const useDownloads = vi.fn();
const setError = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(() => Promise.resolve(() => undefined)),
}));
vi.mock("../hooks/useDownloads", () => ({ useDownloads }));
vi.mock("../services/downloadService", () => ({
  shouldOpenConfirmation: vi.fn(() => true),
  openDownloadConfirmation: vi.fn(() => Promise.resolve()),
}));

const { DownloadsPage } = await import("./DownloadsPage");

function hookState(error: string | null, downloads: DownloadTask[] = []) {
  return {
    downloads,
    loading: false,
    error,
    setError,
    remove: vi.fn(),
    cancel: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    setSpeedLimit: vi.fn(),
    setPriority: vi.fn(),
    moveQueueItem: vi.fn(),
    prioritize: vi.fn(),
  };
}

describe("DownloadsPage empty and error states", () => {
  beforeEach(() => {
  afterEach(() => {
    cleanup();
  });

    localStorage.clear();
    setError.mockClear();
  });

  it("shows a useful empty state after loading completes", () => {
    useDownloads.mockReturnValue(hookState(null));
    render(
      <DownloadsPage
        settings={{ ...defaultSettings, rootDownloadFolder: "C:/Downloads", language: "pt-BR" }}
        onSave={vi.fn()}
        filter="downloads"
      />,
    );

    expect(screen.getByText("No downloads found")).not.toBeNull();
  });

  it("applies the completed filter before deciding the page is empty", () => {
    const activeDownload: DownloadTask = {
      id: "active-download",
      fileName: "still-downloading.zip",
      fileSize: 1024,
      originalUrl: "https://example.test/still-downloading.zip",
      currentUrl: "https://example.test/still-downloading.zip",
      savePath: "C:/Downloads",
      tempPath: "C:/Downloads/.sf-temp/still-downloading.zip.part",
      finalPath: "C:/Downloads/still-downloading.zip",
      status: "downloading",
      mimeType: "application/zip",
      extension: "zip",
      supportsRange: true,
      etag: null,
      lastModified: null,
      totalDownloaded: 10,
      speedCurrent: 1,
      speedAverage: 1,
      speedLimitDownload: 0,
      createdAt: "2026-08-28T00:00:00Z",
      updatedAt: "2026-08-28T00:00:00Z",
      completedAt: null,
      priority: 1,
      queueOrder: 0,
    };
    useDownloads.mockReturnValue(hookState(null, [activeDownload]));

    render(
      <DownloadsPage
        settings={{ ...defaultSettings, rootDownloadFolder: "C:/Downloads", language: "pt-BR" }}
        onSave={vi.fn()}
        filter="completed"
      />,
    );

    expect(screen.queryAllByText("No downloads found").length).toBeGreaterThan(0);
    expect(screen.queryByText("still-downloading.zip")).toBeNull();
  });

  it("renders and dismisses a loading error", () => {
    useDownloads.mockReturnValue(hookState("Falha de teste"));
    render(
      <DownloadsPage
        settings={{ ...defaultSettings, rootDownloadFolder: "C:/Downloads", language: "pt-BR" }}
        onSave={vi.fn()}
        filter="downloads"
      />,
    );

    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("Falha de teste");
    fireEvent.click(alert.querySelector("button")!);
    expect(setError).toHaveBeenCalledWith(null);
  });
});
