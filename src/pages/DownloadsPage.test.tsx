import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
const { invoke } = await import("@tauri-apps/api/core");
const { openDownloadConfirmation } = await import("../services/downloadService");

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
  it.each(["cyberpunk", "cs2", "custom"] as const)("keeps Ctrl/Shift clicks and Ctrl+A working with the %s theme", (theme) => {
    const downloads = ["one", "two", "three"].map((id) => ({
      id, fileName: `${id}.zip`, fileSize: 1024, totalDownloaded: 1024,
      status: "completed", originalUrl: "https://example.test/file.zip",
      currentUrl: "https://example.test/file.zip", extension: "zip",
      createdAt: "2026-08-28T00:00:00Z", completedAt: "2026-08-28T00:00:01Z",
      speedCurrent: 0, speedAverage: 1024, priority: 1, queueOrder: 0,
    }) as DownloadTask);
    useDownloads.mockReturnValue(hookState(null, downloads));
    const { container } = render(<DownloadsPage settings={{ ...defaultSettings,
      rootDownloadFolder: "C:/Downloads", gameTheme: theme === "custom" ? "none" : theme,
      testTheme: { ...defaultSettings.testTheme, enabled: theme === "custom" },
    }} onSave={vi.fn()} filter="downloads" />);
    const cards = Array.from(container.querySelectorAll(".download-card"));
    const count = () => container.querySelectorAll(".download-card.selected").length;
    expect(cards).toHaveLength(3);
    fireEvent.click(cards[0]);
    fireEvent.click(cards[1], { ctrlKey: true });
    expect(count()).toBe(2);
    expect(cards[0].classList.contains("selected-multi")).toBe(true);
    fireEvent.keyDown(window, { key: "Escape" });
    fireEvent.click(cards[0]);
    fireEvent.click(cards[2], { shiftKey: true });
    expect(count()).toBe(3);
    fireEvent.keyDown(window, { key: "Escape" });
    fireEvent.keyDown(window, { key: "a", ctrlKey: true });
    expect(count()).toBe(3);
    fireEvent.keyDown(window, { key: "Escape" });
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "a", ctrlKey: true });
    expect(count()).toBe(0);
  });
  it("opens a dedicated media confirmation while preserving HTTP and torrent routing", async () => {
    useDownloads.mockReturnValue(hookState(null));
    vi.mocked(invoke).mockResolvedValue(undefined);
    vi.mocked(invoke).mockClear();
    vi.mocked(openDownloadConfirmation).mockClear();
    render(<DownloadsPage settings={{...defaultSettings,rootDownloadFolder:"C:/Downloads"}} onSave={vi.fn()} filter="downloads" />);
    const input = screen.getByRole("textbox");
    fireEvent.paste(input, { clipboardData: { getData: () => "https://www.youtube.com/watch?v=NgA_JGCbEWE" } });
    await waitFor(() => expect(invoke).toHaveBeenCalledWith("open_media_confirmation", { url: "https://www.youtube.com/watch?v=NgA_JGCbEWE" }));
    expect(openDownloadConfirmation).not.toHaveBeenCalled();
    fireEvent.paste(input, { clipboardData: { getData: () => "https://example.com/file.mp4" } });
    await waitFor(() => expect(openDownloadConfirmation).toHaveBeenCalledWith(expect.any(String), "https://example.com/file.mp4"));
    fireEvent.paste(input, { clipboardData: { getData: () => "magnet:?xt=urn:btih:123" } });
    await waitFor(() => expect(openDownloadConfirmation).toHaveBeenCalledWith(expect.any(String), "magnet:?xt=urn:btih:123"));
  });
  afterEach(() => {
    cleanup();
  });
  beforeEach(() => {
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
