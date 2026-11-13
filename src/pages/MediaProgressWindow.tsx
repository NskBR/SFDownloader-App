import { useTaskbarProgress } from "../hooks/useTaskbarProgress";
import { AlertCircle, ArrowLeft, CheckCircle2, ChevronDown, Download, Folder, Gauge, HardDrive, LoaderCircle, Music2, Pause, Play, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import type { DownloadProgress } from "../domain/download";
import * as media from "../services/mediaService";
import * as downloads from "../services/downloadService";
import { MediaWindowControls } from "./MediaConfirmationWindow";
import { useTranslation } from "../i18n";

const bytes = (n: number) => { const units = ["B","KB","MB","GB"]; let i=0; while(n >= 1024 && i < 3){n/=1024;i++;} return `${n.toFixed(i ? 1 : 0)} ${units[i]}`; };
export function MediaProgressWindow({ id }: { id: string }) {
  useTaskbarProgress();
  const { language } = useTranslation(); const pt = language === "pt-BR";
  const text = (br: string, en: string) => pt ? br : en;
  const [detail, setDetail] = useState<media.MediaDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  useEffect(() => {
    let disposed=false;
    const load = () => media.mediaDetails(id).then(d => { if(!disposed) setDetail(d); }).catch(e => { if(!disposed) setError(String(e)); });
    void load();
    const a = listen<DownloadProgress>("download-progress", ({payload:p}) => {
      if(p.id!==id || disposed) return;
      setDetail(d => d ? {...d, task:{...d.task,status:p.status,totalDownloaded:p.downloaded,fileSize:p.total,speedCurrent:p.speed},error:p.error} : d);
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
  const percent=done || processing ? 100 : task?.fileSize ? Math.min(100,Math.floor(task.totalDownloaded/task.fileSize*100)) : undefined;
  const labels: Record<string,string> = {queued:text("Na fila","Queued"),checking:text("Consultando e verificando parciais…","Checking source and partial files…"),download:text("Baixando mídia","Downloading media"),converting:text("Convertendo áudio e adicionando capa…","Converting audio and adding cover…"),merging:text("Unindo vídeo e áudio…","Merging video and audio…"),verifying:text("Validando arquivo final…","Checking final file…"),completed:text("Concluído","Complete"),paused:text("Pausado","Paused"),failed:text("Falha no download","Download failed"),cancelled:text("Cancelado","Cancelled")};
  const audio = detail?.options.format === "mp3";
  const playlist = detail?.options.playlist;
  const quality = detail ? `${playlist && !audio ? text("até ", "up to ") : ""}${detail.options.quality}${audio ? " kbps" : "p"}` : "";
  const terminal = task && ["completed","failed","cancelled"].includes(task.status);
  const paused = task?.status === "paused";
  const failed = task?.status === "failed";
  const remaining = task?.status === "downloading" && task.fileSize && task.speedCurrent > 0
    ? Math.max(0, Math.ceil((task.fileSize - task.totalDownloaded) / task.speedCurrent)) : null;
  const statusLabel = paused ? labels.paused : failed ? labels.failed
    : done ? labels.completed : labels[detail?.phase ?? "queued"] ?? detail?.phase;
  const thumbnail = detail?.options.thumbnail;
  const statusIcon = done ? <CheckCircle2 size={13}/> : stopped ? <Pause size={13}/>
    : processing ? <LoaderCircle size={13} className="media-spinner"/> : <Download size={13}/>;

  return <main className={`media-window media-progress-window media-progress-card ${cancelOpen ? "is-cancelling" : ""} ${done ? "is-complete" : failed ? "is-failed" : ""}`}>
    <header className="media-header" data-tauri-drag-region><span className="media-header-icon">{audio ? <Music2 size={20}/> : <Download size={20}/>}</span><div className="media-heading" data-tauri-drag-region><h1 title={task?.fileName} data-tauri-drag-region>{task?.fileName?.replace(/-sfd\.(mp3|mp4)$/i, "") ?? text("Download de mídia","Media download")}</h1><p title={playlist?.title}>{playlist ? `Playlist · ${text("faixa", "track")} ${playlist.index}/${playlist.count}` : (media.mediaPlatform(task?.originalUrl ?? "") ?? text("Mídia", "Media"))} <span className="media-heading-separator">·</span> <span className="media-header-quality">{detail ? `${detail.options.format.toUpperCase()} ${quality}` : "MP4 / MP3"}</span></p></div><MediaWindowControls/></header>
    <div className="media-body"><div className="media-progress-content">
      {cancelOpen ? <div className="media-cancel media-cancel-page"><span className="media-cancel-symbol"><AlertCircle size={25}/></span><div><strong>{text("Cancelar download?","Cancel download?")}</strong><p>{text("Mantenha os arquivos parciais para retomar depois ou exclua os dados já baixados.","Keep partial files to resume later, or delete the data already downloaded.")}</p></div></div> : detailsOpen ? <section className="media-details-page"><div className="media-details-heading"><button className="media-details-toggle" onClick={()=>setDetailsOpen(false)}><ArrowLeft size={15}/>{text("Voltar","Back")}</button><h2>{text("Detalhes do download","Download details")}</h2></div><dl className="media-expanded-details"><div><dt>{text("Arquivo","File")}</dt><dd>{task?.fileName ?? "—"}</dd></div><div><dt>{text("Destino","Destination")}</dt><dd>{task?.finalPath ?? "—"}</dd></div><div><dt>{text("Origem","Source")}</dt><dd>{task?.originalUrl ?? "—"}</dd></div>{audio && <div><dt>{text("Tags ID3 / capa","ID3 tags / cover")}</dt><dd>{done ? text("Embutidas no MP3","Embedded in MP3") : text("Ao finalizar","On completion")}</dd></div>}</dl></section> : <>
        <div className="media-overview">
          <div className={`media-dial ${percent === undefined ? "is-indeterminate" : ""}`} aria-hidden="true">
            <svg viewBox="0 0 100 100"><circle className="media-dial-base" cx="50" cy="50" r="43"/><circle className="media-dial-value" cx="50" cy="50" r="43" pathLength="100" strokeDasharray="100" strokeDashoffset={100 - (percent ?? 24)}/></svg>
            <strong>{percent === undefined ? "…" : `${percent}%`}</strong>
          </div>
          <div className="media-overview-text">
            <strong className="media-size-heading">{task ? bytes(task.totalDownloaded) : "—"}{task?.fileSize && !done ? <span> / {bytes(task.fileSize)}</span> : null}</strong>
            <span className="media-status-chip" role="status">{statusIcon}{statusLabel}</span>
            <p className="media-eta">{text("Tempo restante", "Time remaining")} <b>{remaining === null ? "—" : media.formatDuration(remaining)}</b></p>
          </div>
          <div className="media-artwork">
            {thumbnail?.startsWith("data:image/") ? <img src={thumbnail} alt="" draggable={false}/> : <div className="media-artwork-fallback">{audio ? <Music2 size={38}/> : <Play size={38}/>}</div>}
            <span>{detail?.options.format.toUpperCase() ?? "MP4"}</span>
          </div>
        </div>
        <div className={`media-progress-track ${percent === undefined ? "processing" : ""}`} role="progressbar" aria-label={text("Progresso","Progress")} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}><span style={{width: percent === undefined ? "40%" : `${percent}%`}}/></div>
        <dl className="media-metrics media-metrics-strip">
          <div><Gauge size={22}/><div><dt>{terminal ? text("Velocidade média","Average speed") : text("Velocidade atual","Current speed")}</dt><dd>{task && !paused && (terminal ? task.speedAverage : task.speedCurrent) > 0 ? `${bytes(terminal ? task.speedAverage : task.speedCurrent)}/s` : "—"}</dd></div></div>
          <div><Download size={22}/><div><dt>{text("Qualidade de saída","Output quality")}</dt><dd>{quality || "—"}</dd></div></div>
          <div><HardDrive size={22}/><div><dt>{text("Tamanho total","Total size")}</dt><dd>{task?.fileSize ? bytes(task.fileSize) : "—"}</dd></div></div>
        </dl>


      </>}
      {(error || detail?.error) && <div className="media-error" role="alert"><AlertCircle size={15}/><span>{error || detail?.error}</span></div>}
    </div></div>
    {cancelOpen && <footer className="media-footer media-cancel-actions"><button className="media-button" disabled={busy} onClick={()=>setCancelOpen(false)}>{text("Voltar","Back")}</button><button className="media-button" disabled={busy} onClick={()=>void act(()=>downloads.cancelDownload(id,false))}>{text("Manter arquivos","Keep files")}</button><button className="media-button media-delete-partials" disabled={busy} onClick={()=>void act(()=>downloads.cancelDownload(id,true))}><Trash2 size={14}/>{text("Excluir arquivos","Delete files")}</button></footer>}
    {!cancelOpen && !detailsOpen && <footer className="media-footer"><button className="media-details-toggle" aria-expanded={detailsOpen} onClick={()=>setDetailsOpen(true)}><ChevronDown size={15}/>{text("Mais detalhes","More details")}</button>{done ? <><button className="media-button" disabled={busy} onClick={()=>void act(()=>downloads.revealInFolder(task.finalPath))}><Folder size={15}/>{text("Abrir pasta","Open folder")}</button><button className="media-button media-primary" disabled={busy} onClick={()=>void act(()=>downloads.openFile(task.finalPath))}><Play size={15}/>{text("Abrir arquivo","Open file")}</button></> : <><button className="media-button" disabled={busy || !task} onClick={()=>setCancelOpen(true)}><X size={15}/>{text("Cancelar","Cancel")}</button><button className="media-button media-primary" disabled={busy || !task || processing} onClick={()=>void act(()=>stopped ? downloads.resumeDownload(id) : downloads.pauseDownload(id))}>{busy ? <LoaderCircle className="media-spinner" size={15}/> : stopped ? <Play size={15}/> : <Pause size={15}/>} {stopped ? text("Retomar","Resume") : text("Pausar","Pause")}</button></>}</footer>}
  </main>;
}
