import { AlertCircle, CheckCircle2, Download, Folder, LoaderCircle, Music2, Pause, Play, X } from "lucide-react";
import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import type { DownloadProgress } from "../domain/download";
import * as media from "../services/mediaService";
import * as downloads from "../services/downloadService";
import { MediaWindowControls } from "./MediaConfirmationWindow";
import { useTranslation } from "../i18n";

const bytes = (n: number) => { const units = ["B","KB","MB","GB"]; let i=0; while(n >= 1024 && i < 3){n/=1024;i++;} return `${n.toFixed(i ? 1 : 0)} ${units[i]}`; };
export function MediaProgressWindow({ id }: { id: string }) {
  const { language } = useTranslation(); const pt = language === "pt-BR";
  const text = (br: string, en: string) => pt ? br : en;
  const [detail, setDetail] = useState<media.MediaDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  useEffect(() => {
    let disposed=false;
    const load = () => media.mediaDetails(id).then(d => { if(!disposed) setDetail(d); }).catch(e => { if(!disposed) setError(String(e)); });
    void load();
    const a = listen<DownloadProgress>("download-progress", ({payload:p}) => {
      if(p.id!==id || disposed) return;
      setDetail(d => d ? {...d, task:{...d.task,status:p.status,totalDownloaded:p.downloaded,fileSize:p.total ?? d.task.fileSize,speedCurrent:p.speed},error:p.error} : d);
      if (["completed","failed","paused","cancelled"].includes(p.status)) void load();
    });
    const b = listen<{id:string;phase:string;error:string|null}>("media-progress", ({payload:p}) => { if(p.id===id && !disposed) setDetail(d => d ? {...d,phase:p.phase,error:p.error} : d); });
    // Reload once after subscriptions are attached to cover progress during mount.
    void Promise.all([a,b]).then(() => load());
    return () => {disposed=true;void a.then(u=>u());void b.then(u=>u());};
  },[id]);
  const act = async (fn: () => Promise<unknown>) => { setBusy(true);setError(null);try{await fn();setDetail(await media.mediaDetails(id));setCancelOpen(false);}catch(e){setError(String(e));}finally{setBusy(false);} };
  const task=detail?.task;
  const done=task?.status === "completed";
  const processing=task?.status === "assembling";
  const stopped=task && ["paused","failed","cancelled"].includes(task.status);
  const percent=done ? 100 : processing ? 100 : task?.fileSize ? Math.min(99,Math.floor(task.totalDownloaded/task.fileSize*100)) : 0;
  const labels: Record<string,string> = {queued:text("Na fila","Queued"),checking:text("Consultando e verificando parciais…","Checking source and partial files…"),download:text("Baixando mídia","Downloading media"),converting:text("Convertendo áudio e adicionando capa…","Converting audio and adding cover…"),merging:text("Unindo vídeo e áudio…","Merging video and audio…"),verifying:text("Validando arquivo final…","Checking final file…"),completed:text("Download e finalização concluídos","Download and processing complete"),paused:text("Pausado","Paused"),failed:text("Falha no download","Download failed"),cancelled:text("Cancelado","Cancelled")};
  const audio = detail?.options.format === "mp3";
  const playlist = detail?.options.playlist;
  const quality = detail ? `${playlist && !audio ? text("até ", "up to ") : ""}${detail.options.quality}${audio ? " kbps" : "p"}` : "";
  const terminal = task && ["completed","failed","cancelled"].includes(task.status);
  return <main className="media-window media-progress-window">
    <header className="media-header" data-tauri-drag-region><span className="media-header-icon">{audio ? <Music2 size={20}/> : <Download size={20}/>}</span><div className="media-heading" data-tauri-drag-region><h1 title={task?.fileName}>{task?.fileName?.replace(/-sfd\.(mp3|mp4)$/i, "") ?? text("Download de mídia","Media download")}</h1><p title={playlist?.title}>{playlist ? `Playlist · ${text("faixa", "track")} ${playlist.index}/${playlist.count}` : "YouTube"} <span className="media-heading-separator">·</span> <span className="media-header-quality">{detail ? `${detail.options.format.toUpperCase()} ${quality}` : "MP4 / MP3"}</span></p></div><MediaWindowControls/></header>
    <div className="media-body">
      {cancelOpen ? <div className="media-cancel"><strong>{text("Cancelar download?","Cancel download?")}</strong><p>{text("Você pode manter os arquivos parciais para retomar depois.","You can keep partial files to resume later.")}</p><div><button className="media-button" disabled={busy} onClick={()=>setCancelOpen(false)}>{text("Voltar","Back")}</button><button className="media-button" disabled={busy} onClick={()=>void act(()=>downloads.cancelDownload(id,false))}>{text("Manter arquivos","Keep files")}</button><button className="media-button" disabled={busy} onClick={()=>void act(()=>downloads.cancelDownload(id,true))}>{text("Excluir arquivos","Delete files")}</button></div></div> : <>
        <div className={`media-progress-summary ${done ? "is-complete" : stopped ? "is-stopped" : ""}`}>{done ? <CheckCircle2 className="media-success" size={30}/> : stopped ? <AlertCircle size={30}/> : <LoaderCircle className={processing || task?.status === "checking_files" ? "media-spinner" : ""} size={30}/>}<div><div className="media-transfer-line"><strong>{task ? bytes(task.totalDownloaded) : "—"}</strong><span className={`media-percent ${done ? "is-complete" : ""}`}>{processing ? "…" : `${percent}%`}</span></div><p role="status">{labels[detail?.phase ?? "queued"] ?? detail?.phase}</p></div></div>
        <div className={`media-progress-track ${processing ? "processing" : ""}`} role="progressbar" aria-label={text("Progresso","Progress")} aria-valuemin={0} aria-valuemax={100} aria-valuenow={processing ? undefined : percent}><span style={{width: processing ? "40%" : `${percent}%`}}/></div>
        <div className={`media-stages ${done ? "is-complete" : ""}`}><span className={task?.status === "downloading" || done || processing ? "active" : ""}>{text("Download","Download")}</span><span className={processing || done ? "active" : ""}>{audio ? text("Conversão e capa","Conversion and cover") : text("Vídeo e áudio","Video and audio")}</span><span className={done ? "active" : ""}>{text("Concluído","Complete")}</span></div>
        <dl className="media-metrics"><div><dt>{terminal ? text("Velocidade média","Average speed") : text("Velocidade atual","Current speed")}</dt><dd>{task && (terminal ? task.speedAverage : task.speedCurrent) > 0 ? `${bytes(terminal ? task.speedAverage : task.speedCurrent)}/s` : "—"}</dd></div><div><dt>{audio ? text("Tags ID3 / capa","ID3 tags / cover") : text("Qualidade de saída","Output quality")}</dt><dd className={done ? "media-success" : ""}>{audio ? done ? text("Embutidas no MP3","Embedded in MP3") : terminal ? text("Não concluído","Not completed") : text("Ao finalizar","On completion") : quality || "—"}</dd></div></dl>
      </>}
      {(error || detail?.error) && <div className="media-error" role="alert"><AlertCircle size={15}/><span>{error || detail?.error}</span></div>}
    </div>
    {!cancelOpen && <footer className="media-footer">{done ? <><button className="media-button" disabled={busy} onClick={()=>void act(()=>downloads.revealInFolder(task.finalPath))}><Folder size={15}/>{text("Abrir pasta","Open folder")}</button><button className="media-button media-primary" disabled={busy} onClick={()=>void act(()=>downloads.openFile(task.finalPath))}><Play size={15}/>{text("Abrir arquivo","Open file")}</button></> : <><button className="media-button" disabled={busy || !task} onClick={()=>setCancelOpen(true)}><X size={15}/>{text("Cancelar","Cancel")}</button><button className="media-button media-primary" disabled={busy || !task || processing} onClick={()=>void act(()=>stopped ? downloads.resumeDownload(id) : downloads.pauseDownload(id))}>{busy ? <LoaderCircle className="media-spinner" size={15}/> : stopped ? <Play size={15}/> : <Pause size={15}/>} {stopped ? text("Retomar","Resume") : text("Pausar","Pause")}</button></>}</footer>}
  </main>;
}
