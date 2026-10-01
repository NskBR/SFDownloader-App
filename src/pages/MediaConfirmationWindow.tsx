import { Video, Film, Music2, Minus, Square, X, Folder, Download, RotateCcw, LoaderCircle, Clock3, AlertCircle, Check, BadgeCheck, Search, Info, MonitorPlay } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { open } from "@tauri-apps/plugin-dialog";
import { loadSettings } from "../services/settingsStorage";
import { CustomSelect } from "../components/ui/CustomSelect";
import { useTranslation } from "../i18n";
import * as media from "../services/mediaService";

export function MediaWindowControls({ expandable = false }: { expandable?: boolean }) {
  const { language } = useTranslation();
  return <div className="media-controls">
    <button type="button" aria-label={language === "pt-BR" ? "Minimizar" : "Minimize"} onClick={() => void getCurrentWindow().minimize()}><Minus size={17} /></button>
    {expandable && <button type="button" aria-label={language === "pt-BR" ? "Maximizar ou restaurar" : "Maximize or restore"} onClick={() => void getCurrentWindow().toggleMaximize()}><Square size={12} /></button>}
    <button type="button" className="media-close" aria-label={language === "pt-BR" ? "Fechar" : "Close"} onClick={() => void getCurrentWindow().close()}><X size={18} /></button>
  </div>;
}

export function MediaConfirmationWindow() {
  const { language } = useTranslation();
  const pt = language === "pt-BR";
  const text = (br: string, en: string) => pt ? br : en;
  const [settings] = useState(loadSettings);
  const [preview, setPreview] = useState<media.MediaPreview | null>(null);
  const [format, setFormat] = useState<media.MediaFormat>("mp4");
  const [videoQuality, setVideoQuality] = useState(0);
  const [audioQuality, setAudioQuality] = useState(192);
  const [destination, setDestination] = useState(settings.rootDownloadFolder);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState("");
  const selectionAnchor = useRef<number | null>(null);
  const selectionList = useRef<HTMLDivElement>(null);
  const request = useRef<{ attempt: number; promise: Promise<media.MediaPreview> }>();
  const starting = useRef(false);
  const active = useRef(false);
  const [queryWait, setQueryWait] = useState<media.MediaQueryWait | null>(null);
  const [retryDeadline, setRetryDeadline] = useState(0);
  const [retrySeconds, setRetrySeconds] = useState(0);

  useEffect(() => {
    let disposed = false;
    active.current = true;
    setLoading(true); setError(null); setQueryWait(null);
    if (!request.current || request.current.attempt !== attempt) request.current = { attempt, promise: media.inspectMedia(wait => {
      if (active.current && request.current?.attempt === attempt) setQueryWait(wait.reason === "query" ? null : wait);
    }) };
    void request.current.promise.then(p => {
      if (disposed) return;
      setPreview(p); setFormat(p.music || !p.resolutions.length ? "mp3" : "mp4"); setVideoQuality(p.playlist ? 1080 : p.resolutions[0] ?? 0);
      setSelected(new Set(p.playlist?.entries.map(entry => entry.videoId) ?? []));
      selectionAnchor.current = null;
    }).catch(e => { if (!disposed) { const failure = media.mediaQueryError(e); setError(failure.message); setRetrySeconds(failure.retryAfterSeconds); setRetryDeadline(Date.now() + failure.retryAfterSeconds * 1000); } }).finally(() => { if (!disposed) { setLoading(false); setQueryWait(null); } });
    return () => { disposed = true; active.current = false; };
  }, [attempt]);
  useEffect(() => {
    if (!retryDeadline) return;
    const timer = window.setInterval(() => {
      const remaining = Math.max(0, Math.ceil((retryDeadline-Date.now())/1000));
      setRetrySeconds(remaining);
      if (!remaining) window.clearInterval(timer);
    }, 250);
    return () => window.clearInterval(timer);
  }, [retryDeadline]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === "Escape" && !starting.current) void getCurrentWindow().close(); };
    window.addEventListener("keydown", key); return () => window.removeEventListener("keydown", key);
  }, []);

  const selectFolder = async () => {
    try { const selected = await open({ directory: true, multiple: false, defaultPath: destination || undefined }); if (typeof selected === "string") setDestination(selected); }
    catch (e) { setError(String(e)); }
  };
  const start = async () => {
    if (!preview || starting.current) return;
    starting.current = true; setBusy(true); setError(null);
    try {
      const quality = format === "mp4" ? videoQuality : audioQuality;
      if (preview.playlist) {
        await media.startMediaDownload(format, quality, destination, settings, preview.playlist.entries.filter(entry => selected.has(entry.videoId)).map(entry => entry.videoId));
      } else {
        await media.startMediaDownload(format, quality, destination, settings);
      }
      await getCurrentWindow().close();
    } catch (e) { setError(String(e)); starting.current = false; setBusy(false); }
  };

  const largest = preview?.resolutions[0] ?? 0;
  const playlist = preview?.playlist;
  const expanded = !!playlist || !!getCurrentWindow().label?.startsWith("media-confirm-playlist-");
  const mix = playlist?.mix;
  const trackCount = playlist?.entries.length ?? 0;
  const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase();
  const visibleEntries = playlist?.entries.filter(entry => normalize(entry.title).includes(normalize(filter.trim()))) ?? [];
  const selectAll = () => { if (!busy) setSelected(current => new Set([...current,...visibleEntries.map(entry => entry.videoId)])); };
  const clearSelection = () => { if (!busy) { setSelected(current => new Set([...current].filter(id => !visibleEntries.some(entry => entry.videoId === id)))); selectionAnchor.current = null; } };
  const toggleTrack = (id: string, index: number, range = false) => {
    if (busy || !playlist) return;
    setSelected(current => {
      const next = new Set(current);
      if (range && selectionAnchor.current !== null) {
        const low = Math.min(index, selectionAnchor.current), high = Math.max(index, selectionAnchor.current);
        visibleEntries.slice(low, high + 1).forEach(entry => next.add(entry.videoId));
      } else { if (next.has(id)) next.delete(id); else next.add(id); selectionAnchor.current = index; }
      return next;
    });
  };
  const selectRow = (id: string, index: number, event: React.MouseEvent) => {
    if (busy) return;
    if (event.shiftKey || event.ctrlKey || event.metaKey) toggleTrack(id, index, event.shiftKey);
    else { setSelected(new Set([id])); selectionAnchor.current = index; }
  };
  const qualityLabel = (q: number) => {
    if (format === "mp3") return `${q} kbps${q === 192 ? text(" — Recomendado", " — Recommended") : ""}`;
    if (playlist) return `${text("Até", "Up to")} ${q}p${q === 1080 ? text(" — Recomendado", " — Recommended") : ""}`;
    const names: Record<number, string> = { 4320: "8K", 2160: "4K", 1440: "Quad HD", 1080: "Full HD", 720: "HD" };
    const fps = preview?.frameRates?.[String(q)];
    return `${q}p${names[q] ? ` · ${names[q]}` : ""}${fps ? ` (${Math.round(fps)} fps)` : ""}${q === largest ? text(" — Recomendado", " — Recommended") : ""}`;
  };
  const fileName = playlist ? `${selected.size} ${text("arquivos", "files")} .${format}` : preview ? `${preview.fileStem || preview.title}-sfd.${format}` : "";
  const categoryFolder = destination && settings.autoOrganizeEnabled ? `${destination.replace(/[\\/]+$/, "")} / ${format === "mp3" ? "Músicas" : "Vídeos"}` : destination;
  const folder = playlist && categoryFolder ? `${categoryFolder.replace(/[\\/]+$/, "")} / ${preview?.fileStem || preview?.title}` : categoryFolder;

  const checkedEntries = playlist?.entries.filter(entry => selected.has(entry.videoId)) ?? [];
  const estimatedBytes = format === "mp3" && checkedEntries.length > 0 && checkedEntries.every(entry => (entry.duration ?? 0) > 0)
    ? checkedEntries.reduce((total, entry) => total + entry.duration! * audioQuality * 1000 / 8, 0) : null;
  const estimatedSize = estimatedBytes === null ? "" : ` (~${new Intl.NumberFormat(pt ? "pt-BR" : "en-US", {maximumFractionDigits:0}).format(estimatedBytes / 1024 / 1024)} MB)`;
  const failure = error && <div className="media-error" role="alert"><AlertCircle size={15} /><span>{error}</span></div>;
  const actions = <footer className="media-footer"><span className="media-filename" title={estimatedSize ? text("Tamanho aproximado do áudio; capa e metadados podem alterar o tamanho final.", "Estimated audio size; cover and metadata may change the final size.") : fileName}>{preview ? playlist ? `${fileName}${estimatedSize}` : `${text("arquivo", "file")}: ${fileName}` : "MP4 · MP3"}</span><button className="media-button media-quiet" disabled={busy} onClick={() => void getCurrentWindow().close()}>{text("Cancelar", "Cancel")}</button><button className="media-button media-primary" disabled={loading || busy || !preview || !destination || (!!playlist && selected.size === 0) || (format === "mp4" && !videoQuality)} onClick={() => void start()}>{busy ? <LoaderCircle className="media-spinner" size={16} /> : <Download size={16} />}{busy ? text("Preparando…", "Preparing…") : mix ? text("Baixar Mix", "Download Mix") : playlist ? text("Baixar playlist", "Download playlist") : format === "mp4" ? text("Baixar vídeo", "Download video") : text("Baixar áudio", "Download audio")}</button></footer>;
  const information = preview && <>
    <div className="media-preview">
      <div className="media-thumbnail">{preview.thumbnail ? <img src={preview.thumbnail} alt="" draggable={false} /> : playlist ? <MonitorPlay size={28} /> : <Film size={32} />}<span>{playlist ? `${trackCount} ${text("faixas", "tracks")}` : media.formatDuration(preview.duration)}</span></div>
      <div><h2 title={preview.title}>{preview.title}</h2><p className="media-channel"><strong>{preview.channel}</strong>{preview.channelVerified && <BadgeCheck size={13} className="media-verified" aria-label={text("Canal verificado", "Verified channel")} />}{preview.viewCount != null && <span>· {new Intl.NumberFormat(pt ? "pt-BR" : "en-US", { notation: "compact", maximumFractionDigits: 1 }).format(preview.viewCount)} {text("visualizações", "views")}</span>}</p><div className="media-preview-state"><span className="media-video-kind">{mix ? text("Mix · lista atual", "Mix · current list") : playlist ? text("Playlist · pasta própria", "Playlist · separate folder") : text("Vídeo individual", "Single video")}</span>{playlist && <span className="media-ready"><Check size={12} />{text("Pronto", "Ready")}</span>}</div></div>
    </div>
    <div className="media-output-settings">
      {playlist && <label className="media-section-label" id="media-format-label">{text("Formato do download", "Download format")}</label>}
      <div className="media-format" role="group" aria-label={text("Formato", "Format")}>
        <button disabled={busy || !preview.resolutions.length} aria-pressed={format === "mp4"} onClick={() => setFormat("mp4")}><Video size={17} /><span>{text("Vídeo", "Video")}<small>MP4</small></span></button>
        <button disabled={busy} aria-pressed={format === "mp3"} onClick={() => setFormat("mp3")}><Music2 size={17} /><span>{text("Áudio", "Audio")}<small>MP3</small></span></button>
      </div>
      <div className="media-quality"><div className="media-field-heading"><label>{text("Qualidade de saída", "Output quality")}</label><span>{format === "mp4" ? playlist ? text("Resolução nativa, sem ampliação", "Native resolution, no upscaling") : text("Resolução máxima nativa disponível", "Highest native resolution available") : text("Capa e metadados", "Cover and metadata")}</span></div><CustomSelect disabled={busy} ariaLabel={text("Qualidade de saída", "Output quality")} value={String(format === "mp4" ? videoQuality : audioQuality)} options={(format === "mp4" ? preview.resolutions : [128,192,256,320]).map(q => ({ value:String(q), label:qualityLabel(q) }))} onChange={value => { if (!busy) (format === "mp4" ? setVideoQuality : setAudioQuality)(Number(value)); }} /></div>
    </div>
    {!playlist && <p className="media-help"><Check size={13} />{format === "mp3" ? text("Áudio convertido com capa e tags ID3. A qualidade depende da fonte original.", "Converted audio with cover and ID3 tags. Quality depends on the original source.") : text("Resolução original com vídeo e áudio, sem aumento artificial de qualidade.", "Original resolution with video and audio, without artificial upscaling.")}</p>}
    <div className="media-destination-section">
      {playlist && <label className="media-section-label">{text("Destino do arquivo", "File destination")}</label>}
      <div className="media-destination"><Folder size={17} /><div><label>{text("Salvar em:", "Save to:")}</label><span className="media-path" title={folder}>{folder || text("Escolha uma pasta", "Choose a folder")}</span></div><button disabled={busy} onClick={() => void selectFolder()}>{text("Alterar", "Change")}</button></div>
    </div>
    {!!playlist?.unavailableCount && <p className="media-help media-playlist-notice" role="status"><Info size={15} />{playlist.unavailableCount} {text("faixa(s) indisponível(is) serão ignoradas. Outras falhas aparecem na fila.", "unavailable track(s) will be skipped. Other failures appear in the queue.")}</p>}
    {mix && <p className="media-help media-playlist-notice" role="status"><Info size={15} />{text(`Mix dinâmico: até ${playlist?.snapshotLimit ?? 50} faixas desta consulta. A seleção permanece fixa ao iniciar o download.`, `Dynamic Mix: up to ${playlist?.snapshotLimit ?? 50} tracks from this query. Your selection stays fixed when downloading.`)}</p>}
  </>;
  const trackList = playlist && <section className="media-playlist" aria-label={text("Selecionar músicas da playlist", "Select playlist tracks")}>
    <div className="media-playlist-toolbar"><strong>{selected.size} {text("de", "of")} {trackCount} {text("selecionadas", "selected")}</strong>{selected.size === trackCount && <span className="media-selection-state">{mix ? text("Mix completo", "Complete Mix") : text("Playlist completa", "Complete playlist")}</span>}<button className="media-button" disabled={busy || !visibleEntries.length} onClick={selectAll}>{text("Selecionar todas", "Select all")}</button><button className="media-button media-quiet" disabled={busy || !visibleEntries.length} onClick={clearSelection}>{text("Desmarcar todas", "Deselect all")}</button></div>
    <div className="media-playlist-filter"><Search size={14} /><input type="search" aria-label={text("Filtrar faixas da lista", "Filter tracks")} placeholder={text("Filtrar faixas da lista…", "Filter tracks…")} value={filter} disabled={busy} onChange={event => {setFilter(event.target.value);selectionAnchor.current=null;}} />{filter && <button aria-label={text("Limpar filtro", "Clear filter")} onClick={() => {setFilter("");selectionAnchor.current=null;}}><X size={13}/></button>}</div>
    <div className="media-playlist-list" ref={selectionList} role="group" aria-label={text("Músicas", "Tracks")}>{visibleEntries.map((entry, index) => <div className="media-playlist-row" data-selected={selected.has(entry.videoId)} key={entry.videoId} tabIndex={busy ? -1 : 0} onClick={event => selectRow(entry.videoId, index, event)} onKeyDown={event => {
      // Let the native checkbox handle Space once; row navigation remains shared.
      if (event.target instanceof HTMLInputElement && event.key === " ") return;
      if (event.key === " " || event.key === "Enter") { event.preventDefault(); toggleTrack(entry.videoId, index, event.shiftKey); }
      else if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
        event.preventDefault(); const next = event.key === "Home" ? 0 : event.key === "End" ? visibleEntries.length - 1 : Math.max(0, Math.min(visibleEntries.length - 1, index + (event.key === "ArrowDown" ? 1 : -1)));
        if (event.shiftKey) { selectionAnchor.current ??= index; toggleTrack(visibleEntries[next].videoId, next, true); }
        (selectionList.current?.children[next] as HTMLElement | undefined)?.focus();
      }
    }}><input type="checkbox" aria-label={entry.title} checked={selected.has(entry.videoId)} disabled={busy} onClick={event => {event.stopPropagation();}} onChange={event => toggleTrack(entry.videoId, index, (event.nativeEvent as MouseEvent).shiftKey)} /><Music2 size={14}/><span title={entry.title}>{entry.title}</span><time className="media-track-duration" title={entry.duration ? text("Duração", "Duration") : text("Duração não informada", "Duration not provided")}>{entry.duration ? media.formatDuration(entry.duration) : "—"}</time><small>{entry.index}</small></div>)}</div>
    {!visibleEntries.length && <div className="media-playlist-empty"><Search size={22}/><span>{text("Nenhuma faixa encontrada", "No tracks found")}</span></div>}
    <div className="media-playlist-shortcuts"><span>Ctrl+A {text("seleciona todas", "selects all")}</span><i>·</i><span>Shift+{text("clique seleciona intervalo", "click selects range")}</span><i>·</i><span>Ctrl+{text("clique alterna", "click toggles")}</span></div>
  </section>;

  return <main className={`media-window media-confirmation ${expanded ? "is-playlist" : ""}`} onKeyDown={event => {
    if (!playlist || busy || !(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "a") return;
    if (event.target instanceof HTMLElement && event.target.closest("input:not([type=checkbox]), textarea, [contenteditable=true]")) return;
    event.preventDefault(); selectAll();
  }}>
    <header className="media-header" data-tauri-drag-region>
      <span className="media-header-icon">{playlist ? <Music2 size={19} /> : <Download size={19} />}</span>
      <div className="media-heading" data-tauri-drag-region><div className="media-title-line"><h1>{mix ? text("Baixar Mix", "Download Mix") : playlist ? text("Baixar playlist", "Download playlist") : text("Baixar vídeo ou música", "Download video or music")}</h1>{preview && <span className="media-quality-badge">{mix ? `Mix · ${trackCount} ${text("faixas", "tracks")}` : playlist ? `${trackCount} ${text("faixas", "tracks")}` : largest >= 4320 ? "HD 8K" : largest >= 2160 ? "HD 4K" : largest >= 720 ? "HD" : largest > 0 ? "MP4 / MP3" : "MP3"}</span>}</div><p><span className="media-source-dot" />YouTube <span className="media-heading-separator">·</span> {text("Link detectado", "Link detected")}</p></div>
      <MediaWindowControls expandable={expanded} />
    </header>
    <div className="media-body">
      {loading ? <div className="media-placeholder" role="status">{queryWait ? <Clock3 size={26} /> : <LoaderCircle className="media-spinner" size={26} />}<strong>{queryWait ? queryWait.reason === "queue" ? text("Aguardando outra consulta…", "Waiting for another query…") : `${text("Nova consulta em", "Next query in")} ${queryWait.seconds}s` : text("Consultando o link…", "Loading link…")}</strong><span>{queryWait?.reason === "rate-limit" ? text("O YouTube limitou as consultas. Respeitando o intervalo de espera.", "YouTube limited queries. Waiting before another request.") : queryWait ? text("Intervalo entre consultas para reduzir requisições ao YouTube.", "Spacing queries to reduce requests to YouTube.") : text("Buscando informações da mídia", "Checking media information")}</span></div> : preview ? playlist ? <>
        <div className="media-playlist-options"><div className="media-playlist-settings">{information}{failure}</div>{actions}</div>
        {trackList}
      </> : <>{information}{failure}</> : <>
        <div className="media-placeholder"><AlertCircle size={28} /><strong>{text("Não foi possível consultar o link", "Could not load the link")}</strong><button className="media-button" disabled={retrySeconds > 0} onClick={() => setAttempt(a => a + 1)}><RotateCcw size={15} />{retrySeconds > 0 ? `${text("Tentar novamente em", "Retry in")} ${retrySeconds}s` : text("Tentar novamente", "Try again")}</button></div>
        {failure}
      </>}
    </div>
    {!playlist && actions}
  </main>;
}
