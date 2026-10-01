import { beforeEach, describe, expect, it, vi } from "vitest";
const events = vi.hoisted(() => ({ listen: vi.fn(), unlisten: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({ listen: events.listen }));
import { invoke } from "@tauri-apps/api/core";
import { defaultSettings } from "../domain/settings";
import { isYouTubeUrl, formatDuration, startMediaDownload, inspectMedia, mediaQueryError } from "./mediaService";

beforeEach(() => { vi.clearAllMocks(); events.listen.mockResolvedValue(events.unlisten); });

describe("media query notifications", () => {
  it("subscribes before querying, forwards the countdown and releases the listener on failure", async () => {
    const failure = {message:"YouTube limitou as consultas.",retryAfterSeconds:60};
    const wait = vi.fn();
    events.listen.mockImplementationOnce(async (_name, callback) => {
      callback({payload:{seconds:5,reason:"cooldown"}});
      expect(invoke).not.toHaveBeenCalled();
      return events.unlisten;
    });
    vi.mocked(invoke).mockRejectedValueOnce(failure);
    await expect(inspectMedia(wait)).rejects.toEqual(failure);
    expect(wait).toHaveBeenCalledWith({seconds:5,reason:"cooldown"});
    expect(events.unlisten).toHaveBeenCalledOnce();
    expect(mediaQueryError(failure)).toEqual(failure);
  });
  it("releases the listener on success and keeps legacy error messages readable", async () => {
    vi.mocked(invoke).mockResolvedValueOnce({title:"Mix"});
    await expect(inspectMedia(vi.fn())).resolves.toEqual({title:"Mix"});
    expect(events.unlisten).toHaveBeenCalledOnce();
    expect(mediaQueryError("Origem indisponível")).toEqual({message:"Origem indisponível",retryAfterSeconds:0});
    expect(mediaQueryError({message:"Wait",retryAfterSeconds:NaN}).retryAfterSeconds).toBe(0);
  });
});

describe("media link routing", () => {
  it("recognizes video, Shorts, music and playlist pages for the isolated flow", () => {
    for (const link of ["https://youtu.be/jNQXAC9IVRw?t=3", "https://youtube.com/watch?v=jNQXAC9IVRw&list=123", "https://music.youtube.com/watch?v=jNQXAC9IVRw", "https://www.youtube.com/shorts/jNQXAC9IVRw", "https://youtube.com/playlist?list=123"]) expect(isYouTubeUrl(link)).toBe(true);
  });
  it("leaves HTTP files, torrents and spoofed domains in their existing flow", () => {
    for (const link of ["https://example.com/video.mp4", "magnet:?xt=urn:btih:123", "C:/Downloads/movie.torrent", "https://youtube.com.evil.test/watch?v=jNQXAC9IVRw", "https://youtube.com@evil.test/watch?v=jNQXAC9IVRw", "javascript:alert(1)"]) expect(isYouTubeUrl(link)).toBe(false);
  });
  it("formats durations without overflowing long videos", () => {
    expect(formatDuration(65)).toBe("1:05");
    expect(formatDuration(3605)).toBe("1:00:05");
  });
  it("sends the exact playlist selection, including an empty selection for backend validation", async () => {
    await startMediaDownload("mp3",192,"C:/Downloads",defaultSettings,["9Vt4XguN2-A"]);
    expect(invoke).toHaveBeenLastCalledWith("start_media_download", {input:expect.objectContaining({format:"mp3",quality:192,selectedVideoIds:["9Vt4XguN2-A"]})});
    await startMediaDownload("mp3",192,"C:/Downloads",defaultSettings,[]);
    expect(invoke).toHaveBeenLastCalledWith("start_media_download", {input:expect.objectContaining({selectedVideoIds:[]})});
  });
});
