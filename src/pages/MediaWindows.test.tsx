import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defaultSettings } from "../domain/settings";
import type { MediaDetails, MediaPreview } from "../services/mediaService";

const mocks = vi.hoisted(() => ({
  close: vi.fn(async () => {}), minimize: vi.fn(async () => {}), maximize: vi.fn(async () => {}),
  inspect: vi.fn(), start: vi.fn(), details: vi.fn(), openFile: vi.fn(), reveal: vi.fn(), pause: vi.fn(), resume: vi.fn(), cancel: vi.fn(),
}));
vi.mock("@tauri-apps/api/window", () => ({ getCurrentWindow: () => ({ close: mocks.close, minimize: mocks.minimize, toggleMaximize:mocks.maximize }) }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn(async () => "C:/Other") }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn(async () => () => {}) }));
vi.mock("../services/settingsStorage", () => ({ loadSettings: () => ({ ...defaultSettings, language: "pt-BR", rootDownloadFolder: "C:/Downloads", autoOrganizeEnabled: true }) }));
vi.mock("../services/mediaService", async importOriginal => ({
  ...await importOriginal<typeof import("../services/mediaService")>(),
  inspectMedia: mocks.inspect, startMediaDownload: mocks.start, mediaDetails: mocks.details,
}));
vi.mock("../services/downloadService", () => ({
  openFile: mocks.openFile, revealInFolder: mocks.reveal, pauseDownload: mocks.pause,
  resumeDownload: mocks.resume, cancelDownload: mocks.cancel, downloadPriorityValue: () => 0,
}));
const { MediaConfirmationWindow } = await import("./MediaConfirmationWindow");
const { MediaProgressWindow } = await import("./MediaProgressWindow");

const preview: MediaPreview = {
  url: "https://www.youtube.com/watch?v=NgA_JGCbEWE", videoId: "NgA_JGCbEWE", title: "Título: teste?", channel: "Canal",
  duration: 188, thumbnail: null, resolutions: [2160,1080,720], frameRates: { 1080: 60 }, viewCount: 4800000,
  channelVerified: true, fileStem: "Título_ teste_", music: false,
};
function detail(status: MediaDetails["task"]["status"] = "completed", format: MediaDetails["options"]["format"] = "mp3"): MediaDetails {
  return { task: { id: "test", fileName: `Título-sfd.${format}`, finalPath: `C:/Downloads/Título-sfd.${format}`,
    totalDownloaded: 7549747, fileSize: 7549747, speedCurrent: 1048576, speedAverage: 2097152, status,
  } as MediaDetails["task"], options: { format, quality: format === "mp3" ? 320 : 1080, videoId: "NgA_JGCbEWE" },
    phase: status === "assembling" ? "converting" : status === "downloading" ? "download" : status, error: null };
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.inspect.mockResolvedValue(preview);
  mocks.start.mockResolvedValue({});
  mocks.details.mockResolvedValue(detail());
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("media confirmation", () => {
  it("filters without losing hidden selections, shows durations and sends the full checked set", async () => {
    mocks.inspect.mockResolvedValue({...preview,music:true,playlist:{mix:true,snapshotLimit:50,unavailableCount:0,entries:[
      {videoId:preview.videoId,title:"Música primeira",index:1,duration:295},
      {videoId:"abcdefghijk",title:"Segunda",index:2,duration:210},
      {videoId:"01234567890",title:"Música terceira",index:3,duration:null}
    ]}});
    render(<MediaConfirmationWindow />);
    await screen.findByText("4:55");
    expect(screen.getByText("3:30")).toBeTruthy();
    const filter = screen.getByRole("searchbox",{name:"Filtrar faixas da lista"});
    fireEvent.change(filter,{target:{value:"musica"}});
    expect(screen.getAllByRole("checkbox")).toHaveLength(2);
    fireEvent.click(screen.getByRole("button",{name:"Desmarcar todas"}));
    expect(screen.getByText("1 de 3 selecionadas")).toBeTruthy();
    fireEvent.keyDown(filter,{key:"a",ctrlKey:true});
    expect(screen.getAllByRole("checkbox").every(c => !(c as HTMLInputElement).checked)).toBe(true);
    fireEvent.keyDown(screen.getByText("Música primeira"),{key:"a",ctrlKey:true});
    expect(screen.getByText("3 de 3 selecionadas")).toBeTruthy();
    fireEvent.click(screen.getByRole("checkbox",{name:"Música terceira"}));
    fireEvent.click(screen.getByRole("button",{name:"Baixar Mix"}));
    await waitFor(() => expect(mocks.start).toHaveBeenCalledWith("mp3",192,"C:/Downloads",expect.anything(),[preview.videoId,"abcdefghijk"]));
  });
  it("uses visible tracks for range selection and recovers from an empty filter", async () => {
    mocks.inspect.mockResolvedValue({...preview,music:true,playlist:{entries:[
      {videoId:preview.videoId,title:"Rock primeiro",index:1},
      {videoId:"abcdefghijk",title:"Jazz",index:2},
      {videoId:"01234567890",title:"Rock último",index:3}
    ],unavailableCount:0}});
    render(<MediaConfirmationWindow />);
    await screen.findByText("Rock primeiro");
    fireEvent.click(screen.getByRole("button",{name:"Desmarcar todas"}));
    const filter = screen.getByRole("searchbox");
    fireEvent.change(filter,{target:{value:"rock"}});
    fireEvent.click(screen.getByRole("checkbox",{name:"Rock primeiro"}));
    fireEvent.click(screen.getByRole("checkbox",{name:"Rock último"}),{shiftKey:true});
    expect(screen.getByText("2 de 3 selecionadas")).toBeTruthy();
    fireEvent.change(filter,{target:{value:"zzz"}});
    expect(screen.getByText("Nenhuma faixa encontrada")).toBeTruthy();
    fireEvent.click(screen.getByRole("button",{name:"Limpar filtro"}));
    expect((screen.getByRole("checkbox",{name:"Jazz"}) as HTMLInputElement).checked).toBe(false);
    fireEvent.click(screen.getByRole("button",{name:"Maximizar ou restaurar"}));
    expect(mocks.maximize).toHaveBeenCalledOnce();
  });
  it("identifies a bounded Mix and downloads only the checked snapshot tracks", async () => {
    mocks.inspect.mockResolvedValue({...preview,music:true,playlist:{mix:true,snapshotLimit:50,unavailableCount:0,entries:[
      {videoId:preview.videoId,title:"Primeira",index:1},{videoId:"abcdefghijk",title:"Segunda",index:2}
    ]}});
    render(<MediaConfirmationWindow />);
    await screen.findByRole("heading",{name:"Baixar Mix"});
    expect(screen.getByText("Mix · lista atual")).toBeTruthy();
    expect(screen.getByText(/Mix dinâmico: até 50 faixas/)).toBeTruthy();
    fireEvent.click(screen.getByRole("checkbox",{name:"Segunda"}));
    fireEvent.click(screen.getByRole("button",{name:"Baixar Mix"}));
    await waitFor(() => expect(mocks.start).toHaveBeenCalledWith("mp3",192,"C:/Downloads",expect.anything(),[preview.videoId]));
  });
  it("shows the shared countdown while waiting to query, then loads the preview", async () => {
    let notify!: (wait: {seconds:number;reason:string}) => void;
    let resolve!: (value:MediaPreview) => void;
    mocks.inspect.mockImplementationOnce(callback => {notify=callback;return new Promise<MediaPreview>(done => {resolve=done;});});
    render(<MediaConfirmationWindow />);
    act(() => notify({seconds:5,reason:"cooldown"}));
    expect(screen.getByText("Nova consulta em 5s")).toBeTruthy();
    act(() => notify({seconds:0,reason:"queue"}));
    expect(screen.getByText("Aguardando outra consulta…")).toBeTruthy();
    act(() => notify({seconds:60,reason:"rate-limit"}));
    expect(screen.getByText("Nova consulta em 60s")).toBeTruthy();
    await act(async () => { resolve(preview); });
    expect(screen.getByText(preview.title)).toBeTruthy();
    expect(screen.queryByText(/Nova consulta em/)).toBeNull();
  });
  it("blocks retries until the rate-limit countdown finishes", async () => {
    vi.useFakeTimers();
    mocks.inspect.mockRejectedValueOnce({message:"YouTube limitou as consultas.",retryAfterSeconds:3});
    await act(async () => {render(<MediaConfirmationWindow />);});
    expect((screen.getByRole("button",{name:"Tentar novamente em 3s"}) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button",{name:"Tentar novamente em 3s"}));
    expect(mocks.inspect).toHaveBeenCalledOnce();
    await act(async () => {vi.advanceTimersByTime(2000);});
    expect((screen.getByRole("button",{name:"Tentar novamente em 1s"}) as HTMLButtonElement).disabled).toBe(true);
    await act(async () => {vi.advanceTimersByTime(1000);});
    const retry = screen.getByRole("button",{name:"Tentar novamente"}) as HTMLButtonElement;
    expect(retry.disabled).toBe(false);
    mocks.inspect.mockResolvedValueOnce(preview);
    await act(async () => {fireEvent.click(retry);});
    expect(screen.getByText(preview.title)).toBeTruthy();
  });
  it("downloads only checked playlist tracks and supports bulk and range selection", async () => {
    mocks.inspect.mockResolvedValue({ ...preview, music:true, playlist:{entries:[
      {videoId:"NgA_JGCbEWE",title:"Primeira",index:1}, {videoId:"abcdefghijk",title:"Segunda",index:2},
      {videoId:"01234567890",title:"Terceira",index:3}
    ],unavailableCount:0} });
    render(<MediaConfirmationWindow />);
    await screen.findByRole("checkbox",{name:"Primeira"});
    fireEvent.click(screen.getByRole("button",{name:"Desmarcar todas"}));
    expect((screen.getByRole("button",{name:"Baixar playlist"}) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("checkbox",{name:"Primeira"}));
    fireEvent.click(screen.getByText("Terceira"), {shiftKey:true});
    expect(screen.getAllByRole("checkbox").every(c => (c as HTMLInputElement).checked)).toBe(true);
    fireEvent.click(screen.getByText("Segunda"),{ctrlKey:true});
    expect((screen.getByRole("checkbox",{name:"Segunda"}) as HTMLInputElement).checked).toBe(false);
    fireEvent.keyDown(screen.getByRole("checkbox",{name:"Primeira"}),{key:"a",ctrlKey:true});
    expect(screen.getAllByRole("checkbox").every(c => (c as HTMLInputElement).checked)).toBe(true);
    fireEvent.click(screen.getByRole("button",{name:"Desmarcar todas"}));
    fireEvent.click(screen.getByRole("checkbox",{name:"Segunda"}));
    fireEvent.click(screen.getByRole("button",{name:"Baixar playlist"}));
    await waitFor(() => expect(mocks.start).toHaveBeenCalledWith("mp3",192,"C:/Downloads",expect.anything(),["abcdefghijk"]));
  });
  it("identifies a playlist, defaults to MP3 and previews the named folder and unavailable tracks", async () => {
    mocks.inspect.mockResolvedValue({ ...preview, title: "Minha playlist", fileStem: "Minha playlist", music:true,
      playlist: { entries:[{videoId:"NgA_JGCbEWE", title:"Música um", index:1}, {videoId:"abcdefghijk",title:"Música dois",index:3}], unavailableCount:1 } });
    render(<MediaConfirmationWindow />);
    await screen.findByRole("heading", { name:"Baixar playlist" });
    expect(screen.getByText("Playlist · pasta própria")).toBeTruthy();
    expect(screen.getByTitle("C:/Downloads / Músicas / Minha playlist")).toBeTruthy();
    expect(screen.getByRole("button", {name:"Áudio MP3"}).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText(/faixa\(s\) indisponível/)).toBeTruthy();
    expect(screen.getByText("Música dois")).toBeTruthy();
    fireEvent.click(screen.getByRole("button",{name:"Baixar playlist"}));
    await waitFor(() => expect(mocks.start).toHaveBeenCalledWith("mp3",192,"C:/Downloads",expect.anything(),["NgA_JGCbEWE","abcdefghijk"]));
  });
  it("makes playlist video resolution a ceiling and updates the destination category", async () => {
    mocks.inspect.mockResolvedValue({ ...preview, title:"Playlist", fileStem:"Playlist", music:true,
      playlist:{entries:[{videoId:preview.videoId,title:preview.title,index:1}],unavailableCount:0} });
    render(<MediaConfirmationWindow />);
    await screen.findByText("Playlist · pasta própria");
    fireEvent.click(screen.getByRole("button",{name:"Vídeo MP4"}));
    expect(screen.getByRole("button",{name:"Qualidade de saída"}).textContent).toContain("Até 1080p");
    expect(screen.getByTitle("C:/Downloads / Vídeos / Playlist")).toBeTruthy();
    fireEvent.click(screen.getByRole("button",{name:"Baixar playlist"}));
    await waitFor(() => expect(mocks.start).toHaveBeenCalledWith("mp4",1080,"C:/Downloads",expect.anything(),[preview.videoId]));
  });
  it("uses native available quality and sanitized suffix while allowing MP3 selection", async () => {
    render(<MediaConfirmationWindow />);
    await screen.findByText(preview.title);
    expect(screen.getByText("arquivo: Título_ teste_-sfd.mp4")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Qualidade de saída" }).textContent).toContain("2160p · 4K — Recomendado");
    fireEvent.click(screen.getByRole("button", { name: "Áudio MP3" }));
    expect(screen.getByRole("button", { name: "Qualidade de saída" }).textContent).toContain("192 kbps");
    expect(screen.getByTitle("C:/Downloads / Músicas")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Qualidade de saída" }));
    expect(screen.getAllByRole("option")).toHaveLength(4);
    fireEvent.click(screen.getByRole("option", { name: "320 kbps" }));
    fireEvent.click(screen.getByRole("button", { name: "Baixar áudio" }));
    await waitFor(() => expect(mocks.start).toHaveBeenCalledWith("mp3", 320, "C:/Downloads", expect.anything()));
    expect(mocks.close).toHaveBeenCalledOnce();
  });
  it("starts Music links in audio and can retry metadata lookup", async () => {
    mocks.inspect.mockRejectedValueOnce("Origem indisponível").mockResolvedValueOnce({ ...preview, music: true });
    render(<MediaConfirmationWindow />);
    await screen.findByRole("alert");
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    await screen.findByText(preview.title);
    expect(screen.getByRole("button", { name: "Áudio MP3" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "Baixar áudio" })).toBeTruthy();
  });
  it("keeps native minimize and close controls functional", async () => {
    render(<MediaConfirmationWindow />);
    fireEvent.click(screen.getByRole("button", { name: "Minimizar" }));
    fireEvent.click(screen.getByRole("button", { name: "Fechar" }));
    expect(mocks.minimize).toHaveBeenCalledOnce();
    expect(mocks.close).toHaveBeenCalledOnce();
  });
});

describe("media progress", () => {
  it("labels playlist progress as the current track rather than the entire playlist", async () => {
    const current = detail("downloading");
    current.options.playlist = {id:"PL0123456789",title:"Minha playlist",index:2,count:8};
    mocks.details.mockResolvedValue(current);
    render(<MediaProgressWindow id="test" />);
    await screen.findByText("Playlist · faixa 2/8", {exact:false});
    expect(screen.getByTitle("Minha playlist")).toBeTruthy();
    expect(screen.queryByText("100%")).toBeNull();
  });
  it("shows verified completion and opens the final file and folder", async () => {
    render(<MediaProgressWindow id="test" />);
    await screen.findByText("Embutidas no MP3");
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("100");
    expect(screen.getByText("2.0 MB/s")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Abrir arquivo" }));
    await waitFor(() => expect(mocks.openFile).toHaveBeenCalledWith("C:/Downloads/Título-sfd.mp3"));
    await waitFor(() => expect((screen.getByRole("button", { name: "Abrir pasta" }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole("button", { name: "Abrir pasta" }));
    await waitFor(() => expect(mocks.reveal).toHaveBeenCalledWith("C:/Downloads/Título-sfd.mp3"));
  });
  it("does not announce completion during conversion and permits cancelling", async () => {
    mocks.details.mockResolvedValue(detail("assembling"));
    render(<MediaProgressWindow id="test" />);
    await screen.findByText("Convertendo áudio e adicionando capa…");
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBeNull();
    expect(screen.queryByText("100%")).toBeNull();
    expect((screen.getByRole("button", { name: "Pausar" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    fireEvent.click(screen.getByRole("button", { name: "Manter arquivos" }));
    await waitFor(() => expect(mocks.cancel).toHaveBeenCalledWith("test", false));
  });
  it("allows pause and resume without treating transfer completion as final completion", async () => {
    mocks.details.mockResolvedValue(detail("downloading", "mp4"));
    render(<MediaProgressWindow id="test" />);
    await screen.findByText("Baixando mídia");
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("99");
    mocks.details.mockResolvedValue(detail("paused", "mp4"));
    fireEvent.click(screen.getByRole("button", { name: "Pausar" }));
    await screen.findByRole("button", { name: "Retomar" });
    expect(mocks.pause).toHaveBeenCalledWith("test");
    fireEvent.click(screen.getByRole("button", { name: "Retomar" }));
    await waitFor(() => expect(mocks.resume).toHaveBeenCalledWith("test"));
  });
});
