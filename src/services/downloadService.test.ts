import { beforeEach, describe, expect, it, vi } from "vitest";
import { defaultSettings } from "../domain/settings";

const invoke = vi.fn(() => Promise.resolve());
vi.mock("@tauri-apps/api/core", () => ({ invoke }));

const service = await import("./downloadService");

describe("download service", () => {
  beforeEach(() => invoke.mockClear());

  it("converts settings into the HTTP download IPC payload", async () => {
    const settings = {
      ...defaultSettings,
      rootDownloadFolder: "C:/Downloads",
      autoOrganizeEnabled: false,
      deleteArchiveAfterExtract: true,
      maxConnectionsPerDownload: 12,
      maxParallelDownloads: 4,
      speedLimitDownloadMbps: 1.5,
    };

    await service.startDownload(
      "https://example.test/archive.zip",
      settings,
      "D:/Archive",
      "browser-request",
      false,
      true,
      "password",
      "Archives",
      true,
    );

    expect(invoke).toHaveBeenCalledWith("start_download", {
      input: {
        url: "https://example.test/archive.zip",
        rootFolder: "D:/Archive",
        autoOrganize: false,
        deleteArchiveAfterExtract: true,
        maxConnections: 12,
        maxParallelDownloads: 4,
        speedLimitDownload: 1572864,
        speedLimitInherited: true,
        browserRequestId: "browser-request",
        resumeSupport: false,
        autoExtract: true,
        archivePassword: "password",
        selectedCategory: "Archives",
        force: true,
        priority: 2,
      },
    });
  });

  it("uses safe defaults when queueing a download", async () => {
    await service.queueDownload(
      "https://example.test/file.bin",
      defaultSettings,
    );

    expect(invoke).toHaveBeenCalledWith("queue_download", {
      input: expect.objectContaining({
        rootFolder: defaultSettings.rootDownloadFolder,
        speedLimitDownload: 0,
        speedLimitInherited: true,
        browserRequestId: null,
        resumeSupport: true,
        autoExtract: false,
        archivePassword: null,
        selectedCategory: null,
        force: false,
        priority: 2,
      }),
    });
  });

  it("uses the native commands for task control", async () => {
    await service.pauseDownload("download-1");
    await service.resumeDownload("download-1");
    await service.updateSpeedLimit("download-1", 4096);
    await service.updateDownloadPriority("download-1", 3);
    await service.moveDownloadQueueItem("download-1", "up");
    await service.prioritizeDownload("download-1");

    expect(invoke).toHaveBeenNthCalledWith(1, "pause_download", {
      id: "download-1",
    });
    expect(invoke).toHaveBeenNthCalledWith(2, "resume_download", {
      id: "download-1",
    });
    expect(invoke).toHaveBeenNthCalledWith(3, "update_speed_limit", {
      id: "download-1",
      speedLimit: 4096,
    });
    expect(invoke).toHaveBeenNthCalledWith(4, "update_download_priority", {
      id: "download-1",
      priority: 3,
    });
    expect(invoke).toHaveBeenNthCalledWith(5, "move_download_queue_item", {
      id: "download-1",
      direction: "up",
    });
    expect(invoke).toHaveBeenNthCalledWith(6, "prioritize_download", {
      id: "download-1",
    });
  });

  it("deduplicates only repeated confirmation requests inside their time window", () => {
    const url = `https://example.test/${crypto.randomUUID()}`;
    expect(service.shouldOpenConfirmation(url, 5_000)).toBe(true);
    expect(service.shouldOpenConfirmation(url, 5_000)).toBe(false);
    expect(service.shouldOpenConfirmation(`${url}/other`, 5_000)).toBe(true);
  });

  it("normalizes saved priorities from supported languages", () => {
    expect(service.downloadPriorityValue("Baixa")).toBe(0);
    expect(service.downloadPriorityValue("Normal")).toBe(1);
    expect(service.downloadPriorityValue("High")).toBe(2);
    expect(service.downloadPriorityValue("urgente")).toBe(3);
    expect(service.downloadPriorityValue("invalid")).toBe(1);
  });
  it("sends HTTP confirmation inspection and window payloads", async () => {
    await service.inspectDownload("https://example.test/file.zip", "request-1");
    await service.openDownloadConfirmation(
      "token-1",
      "https://example.test/file.zip",
    );

    expect(invoke).toHaveBeenNthCalledWith(1, "inspect_download", {
      url: "https://example.test/file.zip",
      requestId: "request-1",
    });
    expect(invoke).toHaveBeenNthCalledWith(2, "open_download_confirmation", {
      token: "token-1",
      url: "https://example.test/file.zip",
    });
  });

  it("sends torrent metadata, confirmation, cancellation and progress payloads", async () => {
    await service.parseTorrentInfo("magnet:?xt=urn:btih:abc", "token-2");
    await service.confirmTorrent({
      infoHash: "abc",
      savePath: "D:/Downloads",
      selectedFileIndexes: [0, 2],
      startImmediately: true,
    });
    await service.cancelTorrent("abc", true);
    await service.openTorrentProgressWindow("abc", "task-1");

    expect(invoke).toHaveBeenNthCalledWith(1, "parse_torrent_info", {
      token: "token-2",
      source: "magnet:?xt=urn:btih:abc",
    });
    expect(invoke).toHaveBeenNthCalledWith(2, "confirm_torrent", {
      infoHash: "abc",
      savePath: "D:/Downloads",
      selectedFileIndexes: [0, 2],
      startImmediately: true,
    });
    expect(invoke).toHaveBeenNthCalledWith(3, "cancel_torrent", {
      infoHash: "abc",
      deleteFiles: true,
    });
    expect(invoke).toHaveBeenNthCalledWith(4, "open_torrent_progress_window", {
      infoHash: "abc",
      taskId: "task-1",
    });
  });
});
