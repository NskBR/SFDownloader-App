import {
  Download,
  Info,
  FolderOpen,
  Minus,
  Plus,
  Layers,
  FileText,
  FileVideo,
  FileAudio,
  FileArchive,
  Disc,
  File,
  Loader2,
  Clock,
  Key,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { emit, listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Toggle } from "../components/ui/Toggle";
import { TorrentWindowCloseButton } from "../components/torrent/TorrentWindowCloseButton";
import { loadSettings } from "../services/settingsStorage";
import * as service from "../services/downloadService";
import type { TorrentMetadataResponse } from "../services/downloadService";
import { useTranslation } from "../i18n";

interface Payload {
  url: string;
  destination: string;
  requestId?: string;
  preview?: service.DownloadPreview;
}

interface TorrentFileNode {
  id: number;
  torrentIndex: number;
  name: string;
  size: number;
  selected: boolean;
}

type PageStatus =
  "idle" | "fetchingMetadata" | "ready" | "failed" | "cancelled" | "duplicate";

function isDuplicateTorrent(message: string): boolean {
  return message.includes("Este torrent já está sendo preparado ou já existe na lista.");
}

const METADATA_FETCH_TIMEOUT_MS = 45_000;

export const formatFileSize = (value: number | null | undefined): string => {
  if (value === null || value === undefined || value < 0) return "Desconhecido";
  if (value === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(
    Math.floor(Math.log(value) / Math.log(1024)),
    units.length - 1,
  );
  const size = value / Math.pow(1024, index);
  return `${size.toLocaleString("pt-BR", {
    minimumFractionDigits: index >= 3 ? 2 : index ? 1 : 0,
    maximumFractionDigits: 2,
  })} ${units[index]}`;
};

function getFileItemIcon(filename: string) {
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  if (["iso", "img", "nrg", "vcd"].includes(ext)) {
    return <Disc size={16} className="tc-file-icon" />;
  }
  if (["mkv", "mp4", "avi", "mov", "wmv", "flv", "webm"].includes(ext)) {
    return <FileVideo size={16} className="tc-file-icon" />;
  }
  if (["mp3", "flac", "wav", "aac", "ogg", "m4a"].includes(ext)) {
    return <FileAudio size={16} className="tc-file-icon" />;
  }
  if (["zip", "rar", "7z", "tar", "gz", "bz2", "xz"].includes(ext)) {
    return <FileArchive size={16} className="tc-file-icon" />;
  }
  if (["txt", "nfo", "md", "doc", "docx", "pdf", "sfv", "info"].includes(ext)) {
    return <FileText size={16} className="tc-file-icon" />;
  }
  return (
    <File
      size={16}
      className="tc-file-icon"
    />
  );
}

export function TorrentConfirmationPage({ token }: { token: string }) {
  const { t } = useTranslation();
  const storageKey = `sf-downloader.confirmation-${token}`;
  const payload = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem(storageKey) || "") as Payload;
    } catch {
      return null;
    }
  }, [storageKey]);
  const appWindow = getCurrentWindow();
  const settings = useMemo(loadSettings, []);

  const savedFolder = useMemo(() => {
    try {
      return localStorage.getItem("sf-downloader.last-save-folder") || "";
    } catch {
      return "";
    }
  }, []);

  const [destination, setDestination] = useState(
    savedFolder || payload?.destination || settings.rootDownloadFolder || "",
  );
  const [torrentName, setTorrentName] = useState(
    payload?.preview?.fileName || "Torrent Download",
  );
  const [createSubfolder, setCreateSubfolder] = useState(true);
  const [autoStart, setAutoStart] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [status, setStatus] = useState<PageStatus>("idle");
  const [infoHash, setInfoHash] = useState<string>("");
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);
  const [fileList, setFileList] = useState<TorrentFileNode[]>([]);
  const [metadataAttempt, setMetadataAttempt] = useState(0);

  // Timer para tempo decorrido no fetchingMetadata
  useEffect(() => {
    if (status !== "fetchingMetadata") return;
    const interval = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [status]);

  const handleMetadataResponse = (res: TorrentMetadataResponse) => {
    if ("message" in res && res.message && isDuplicateTorrent(res.message)) {
      setInfoHash("");
      setError(null);
      setStatus("duplicate");
      return;
    }
    if (res.status === "fetchingMetadata") {
      setStatus("fetchingMetadata");
      setError(null);
      setElapsedSeconds(0);
      setInfoHash(res.infoHash || (res as any).info_hash || "");
      if (res.name) setTorrentName(res.name);
      setFileList([]);
    } else if (res.status === "ready") {
      const rawTotalSize = res.totalSize ?? (res as any).total_size ?? 0;
      const rawFiles = res.files ?? (res as any).files ?? [];

      if (
        !rawFiles ||
        rawFiles.length === 0 ||
        !rawTotalSize ||
        rawTotalSize === 0
      ) {
        setError("Não foi possível ler os metadados deste torrent.");
        setStatus("failed");
        setFileList([]);
        return;
      }

      setError(null);
      setStatus("ready");
      setTorrentName(res.name);
      setInfoHash(res.infoHash || (res as any).info_hash || "");

      const nodes: TorrentFileNode[] = rawFiles.map((f: any, idx: number) => ({
        id: idx + 1,
        torrentIndex: Number.isInteger(f.index) ? f.index : idx,
        name: f.path,
        size: f.size > 0 ? f.size : rawTotalSize,
        selected: true,
      }));
      setFileList(nodes);
    } else {
      setError(
        res.message || "Não foi possível ler os metadados deste torrent.",
      );
      setStatus("failed");
      setFileList([]);
    }
  };

  useEffect(() => {
    let active = true;
    let settled = false;
    let knownInfoHash = "";
    let timeoutId: number | undefined;

    if (!payload?.url) return;

    const receiveMetadata = (response: TorrentMetadataResponse) => {
      if (!active || settled) return;
      knownInfoHash = response.infoHash || (response as any).info_hash || knownInfoHash;
      handleMetadataResponse(response);
      if (response.status !== "fetchingMetadata") {
        settled = true;
        if (timeoutId !== undefined) window.clearTimeout(timeoutId);
      }
    };

    const failMetadata = (message: string) => {
      if (!active || settled) return;
      settled = true;
      if (isDuplicateTorrent(message)) {
        setInfoHash("");
        setError(null);
        setStatus("duplicate");
        if (timeoutId !== undefined) window.clearTimeout(timeoutId);
        return;
      }
      setError(message);
      setStatus("failed");
      setFileList([]);
      if (knownInfoHash) {
        void service.cancelTorrent(knownInfoHash, false).catch(() => {});
      }
    };

    setError(null);
    setStatus("fetchingMetadata");
    setElapsedSeconds(0);
    setFileList([]);

    // Registre o listener antes de iniciar o parse. Assim, uma resposta rápida
    // do backend não se perde entre o invoke e a inscrição no evento Tauri.
    const unlistenPromise = listen<TorrentMetadataResponse>(
      `torrent-metadata-ready-${token}`,
      (event) => receiveMetadata(event.payload),
    );

    void unlistenPromise.then((unlisten) => {
      if (!active) {
        unlisten();
        return;
      }
      void service
        .parseTorrentInfo(payload.url, token)
        .then(receiveMetadata)
        .catch((cause) =>
          failMetadata(
            String(cause) || "Não foi possível ler os metadados deste torrent.",
          ),
        );
    });

    // O backend também possui timeout, mas este limite no cliente impede que a
    // janela fique bloqueada caso um evento Tauri seja perdido ou o motor P2P
    // encerre sem conseguir notificar a interface.
    timeoutId = window.setTimeout(() => {
      failMetadata(
        "Não foi possível obter os metadados em 45 segundos. Verifique a disponibilidade de pares e trackers, ou tente novamente.",
      );
    }, METADATA_FETCH_TIMEOUT_MS);

    return () => {
      active = false;
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
      void unlistenPromise.then((unlisten) => unlisten());
    };
  }, [payload, token, metadataAttempt]);

  const close = () => {
    if (infoHash && status !== "duplicate") {
      console.log(
        "[MAGNET_CANCELLED] Cancelando busca/torrent pelo infoHash:",
        infoHash,
      );
      void service.cancelTorrent(infoHash, false).catch(() => {});
    }
    setStatus("cancelled");
    void appWindow.close();
  };

  const retryMetadata = async () => {
    const previousInfoHash = infoHash;
    setError(null);
    setStatus("fetchingMetadata");
    setElapsedSeconds(0);
    setFileList([]);
    setInfoHash("");
    if (previousInfoHash) {
      await service.cancelTorrent(previousInfoHash, false).catch(() => {});
    }
    setMetadataAttempt((attempt) => attempt + 1);
  };

  const chooseFolder = async () => {
    const path = await open({ directory: true });
    if (typeof path === "string" && path.trim()) {
      setDestination(path);
      try {
        localStorage.setItem("sf-downloader.last-save-folder", path);
      } catch {}
    }
  };

  const toggleFile = (id: number) => {
    setFileList((prev) =>
      prev.map((f) => (f.id === id ? { ...f, selected: !f.selected } : f)),
    );
  };

  const selectAll = () => {
    setFileList((prev) => prev.map((f) => ({ ...f, selected: true })));
  };

  const clearSelection = () => {
    setFileList((prev) => prev.map((f) => ({ ...f, selected: false })));
  };

  const selectedFiles = fileList.filter((f) => f.selected);
  const selectedCount = selectedFiles.length;
  const totalFilesCount = fileList.length;

  const totalSize = fileList.reduce((acc, f) => acc + f.size, 0);
  const selectedSize = selectedFiles.reduce((acc, f) => acc + f.size, 0);

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const finish = async () => {
    if (!payload?.url || status !== "ready" || !infoHash) return;
    setBusy(true);
    setError(null);
    try {
      const sanitizedName =
        torrentName.replace(/[/\\?%*:|"<>]/g, "_").trim() || "Torrent";
      const finalSavePath = createSubfolder
        ? `${destination.replace(/[/\\]+$/, "")}/${sanitizedName}`
        : destination;

      const task = await service.confirmTorrent({
        infoHash,
        savePath: finalSavePath,
        selectedFileIndexes: selectedFiles.map((f) => f.torrentIndex),
        startImmediately: autoStart,
      });
      localStorage.removeItem(storageKey);
      void emit("download-created", task).catch(() => {});
      await service.openTorrentProgressWindow(infoHash, task.id);
      void appWindow.close();
    } catch (cause) {
      console.error("[ADD_TORRENT_ALERT] Erro ao confirmar torrent:", cause);
      setError(String(cause));
    } finally {
      setBusy(false);
    }
  };

  if (status === "duplicate") {
    return (
      <div className="torrent-confirm-window">
        <header className="tc-header" data-tauri-drag-region>
          <div className="tc-header-title" data-tauri-drag-region>
            <div className="tc-header-icon-box"><Info size={20} /></div>
            <h1 data-tauri-drag-region>Torrent já adicionado</h1>
          </div>
          <TorrentWindowCloseButton title={t.common.close} className="tc-close-btn" onClose={close} size={22} />
        </header>
        <main className="tc-state-panel" role="status" style={{ flex: 1 }}>
          <Info size={36} style={{ color: "var(--ember-solid)" }} />
          <div className="tc-state-copy">
            <strong>Este torrent já está na sua lista de downloads.</strong>
            <span>Se estiver baixando, acompanhe o progresso na lista. Se estiver pausado, use Retomar para continuar de onde parou.</span>
            <span>Se ele ainda estiver sendo preparado, continue na janela de confirmação já aberta.</span>
          </div>
        </main>
        <footer className="tc-footer" style={{ justifyContent: "flex-end" }}>
          <button className="tc-btn-cyan-solid" onClick={close}>Entendi</button>
        </footer>
      </div>
    );
  }

  return (
    <div className="torrent-confirm-window">
      {/* Header com drag region */}
      <header className="tc-header" data-tauri-drag-region>
        <div className="tc-header-title" data-tauri-drag-region>
          <div className="tc-header-icon-box">
            <Download size={18} />
          </div>
          <div data-tauri-drag-region>
            <h1
              data-tauri-drag-region
              className="text-truncate"
              title={torrentName}
            >
              {torrentName}
            </h1>
            <p data-tauri-drag-region>
              Adicionar Torrent • Configure seu download antes de iniciar.
            </p>
          </div>
        </div>
        <div className="tc-window-controls">
          <button
            type="button"
            className="tc-minimize-btn"
            title={t.common.minimize}
            aria-label={t.common.minimize}
            onClick={() => void appWindow.minimize()}
          >
            <Minus size={20} />
          </button>
          <TorrentWindowCloseButton title={t.common.close} className="tc-close-btn" onClose={close} size={22} />
        </div>
      </header>

      {status === "failed" && error && (
        <div className="tc-error-banner">{error}</div>
      )}

      {/* Main 2-Column Body */}
      <main className="tc-body-grid">
        {/* Left Column: Settings */}
        <div className="tc-left-col">
          {/* 1. Nome do Torrent */}
          <div className="tc-card">
            <label className="tc-card-label"><FileText size={19} />Nome do torrent</label>
            <input
              type="text"
              className="tc-input-name"
              value={torrentName}
              onChange={(e) => setTorrentName(e.target.value)}
              title={torrentName}
            />
          </div>

          {/* 2. Pasta de destino + Alterar */}
          <div className="tc-card tc-destination-card">
            <label className="tc-card-label"><FolderOpen size={19} />Salvar em</label>
            <div className="tc-path-row">
              <div className="tc-path-box" title={destination}>
                {destination}
              </div>
              <button
                type="button"
                className="tc-btn-outline"
                onClick={chooseFolder}
              >
                Alterar
              </button>
            </div>
            {/* 3. Criar subpasta */}
            <div className="tc-toggle-inline tc-option-divider">
              <Toggle checked={createSubfolder} onChange={setCreateSubfolder} />
              <span>Criar subpasta</span>
            </div>
            <div className="tc-toggle-inline tc-option-divider">
              <Toggle checked={autoStart} onChange={setAutoStart} />
              <div className="tc-toggle-copy">
                <strong>Iniciar automaticamente</strong>
                <span>Inicia o download assim que for adicionado.</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Torrent Content */}
        <div className="tc-right-col">
          <div className="tc-card tc-content-card">
            <div className="tc-card-header">
              <FileText size={16} className="tc-icon-cyan" />
              <strong>Conteúdo do torrent</strong>
            </div>

            {status === "fetchingMetadata" && (
              <div className="tc-state-panel">
                <Loader2
                  size={36}
                  className="tc-metadata-spinner"
                  style={{ color: "var(--ember-solid)" }}
                />
                <div className="tc-state-copy">
                  <strong>Obtendo metadados do torrent…</strong>
                  <span>
                    Conectando aos pares da rede P2P BitTorrent para ler a
                    estrutura de arquivos.
                  </span>
                </div>

                <div className="tc-state-meta">
                  {infoHash && (
                    <div className="tc-stat-pair tc-state-meta-row">
                      <Key size={12} />
                      <span className="tc-stat-label">Info Hash:</span>
                      <strong
                        className="tc-stat-val text-truncate"
                        title={infoHash}
                      >
                        {infoHash}
                      </strong>
                    </div>
                  )}

                  <div className="tc-stat-pair tc-state-meta-row">
                    <Clock size={12} />
                    <span className="tc-stat-label">Tempo decorrido:</span>
                    <strong className="tc-stat-val">
                      {formatTime(elapsedSeconds)}
                    </strong>
                  </div>
                </div>
              </div>
            )}

            {status === "ready" && (
              <>
                {/* 1. Resumo Superior com Duas Colunas Responsivas */}
                <div className="tc-stats-header">
                  <div className="tc-stat-pair">
                    <div>
                      <span className="tc-stat-label">Tamanho total</span>
                      <strong
                        className="tc-stat-val"
                        title={`${totalSize.toLocaleString("pt-BR")} bytes`}
                      >
                        {formatFileSize(totalSize)}
                      </strong>
                    </div>
                    <div className="text-right">
                      <span className="tc-stat-label">Selecionados</span>
                      <strong
                        className="tc-stat-val"
                        title={`${selectedSize.toLocaleString("pt-BR")} bytes`}
                      >
                        {selectedCount} de {totalFilesCount} ·{" "}
                        {formatFileSize(selectedSize)}
                      </strong>
                    </div>
                  </div>
                </div>

                {/* Botões de Seleção */}
                <div className="tc-actions-bar">
                  <button
                    type="button"
                    className="tc-btn-outline"
                    onClick={selectAll}
                  >
                    Selecionar tudo
                  </button>
                  <button
                    type="button"
                    className="tc-btn-dark"
                    onClick={clearSelection}
                  >
                    Limpar seleção
                  </button>
                </div>

                {/* Tabela de Arquivos Reais */}
                <div className="tc-table-wrap">
                  <div className="tc-table-header-row">
                    <span className="col-name">Nome</span>
                    <span className="col-size">Tamanho</span>
                  </div>
                  <div className="tc-table-body">
                    {fileList.length === 1 ? (
                      /* Torrent de Arquivo Único: Apenas 1 linha real sem pasta fictícia */
                      <div
                        key={fileList[0].id}
                        className="tc-file-row single-file"
                      >
                        <input
                          type="checkbox"
                          checked={fileList[0].selected}
                          onChange={() => toggleFile(fileList[0].id)}
                        />
                        {getFileItemIcon(fileList[0].name)}
                        <span className="tc-file-name" title={fileList[0].name}>
                          {fileList[0].name}
                        </span>
                        <span
                          className="tc-file-size"
                          title={`${fileList[0].size.toLocaleString("pt-BR")} bytes`}
                        >
                          {formatFileSize(fileList[0].size)}
                        </span>
                      </div>
                    ) : (
                      /* Torrent Multi-arquivo: Pasta Raiz + Arquivos Filhos */
                      <>
                        <div className="tc-file-row folder-root">
                          <input
                            type="checkbox"
                            checked={selectedCount === totalFilesCount}
                            onChange={(e) =>
                              e.target.checked ? selectAll() : clearSelection()
                            }
                          />
                          <FolderOpen size={14} className="tc-folder-icon" />
                          <span className="tc-file-name" title={torrentName}>
                            {torrentName}
                          </span>
                          <span
                            className="tc-file-size"
                            title={`${totalSize.toLocaleString("pt-BR")} bytes`}
                          >
                            {formatFileSize(totalSize)}
                          </span>
                        </div>

                        {fileList.map((f) => (
                          <div key={f.id} className="tc-file-row child">
                            <input
                              type="checkbox"
                              checked={f.selected}
                              onChange={() => toggleFile(f.id)}
                            />
                            {getFileItemIcon(f.name)}
                            <span className="tc-file-name" title={f.name}>
                              {f.name}
                            </span>
                            <span
                              className="tc-file-size"
                              title={`${f.size.toLocaleString("pt-BR")} bytes`}
                            >
                              {formatFileSize(f.size)}
                            </span>
                          </div>
                        ))}
                      </>
                    )}
                  </div>
                </div>
              </>
            )}

            {status === "failed" && (
              <div className="tc-state-panel tc-failed-panel">
                <span>
                  {error || "Não foi possível ler os metadados deste torrent."}
                </span>
                <button
                  type="button"
                  className="tc-btn-outline"
                  onClick={() => void retryMetadata()}
                >
                  Tentar novamente
                </button>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Footer Simplificado */}
      <footer className="tc-footer">
        <div className="tc-footer-left">
          <div className="tc-layers-icon-box">
            <Layers size={18} />
          </div>
          <div>
            <strong>
              {status === "fetchingMetadata"
                ? "Obtendo metadados P2P..."
                : status === "ready"
                  ? `${selectedCount} arquivo${selectedCount !== 1 ? "s" : ""} selecionado${selectedCount !== 1 ? "s" : ""} · ${formatFileSize(selectedSize)}`
                  : "Erro nos metadados"}
            </strong>
          </div>
        </div>

        <div className="tc-footer-right">
          <button type="button" className="tc-btn-dark" onClick={close}>
            {t.common.cancel}
          </button>
          <button
            type="button"
            className="tc-btn-cyan-solid"
            onClick={finish}
            disabled={
              busy ||
              status !== "ready" ||
              !!error ||
              totalSize === 0 ||
              fileList.length === 0 ||
              selectedCount === 0
            }
          >
            <Plus size={16} />
            <span>{t.confirmation.startDownload}</span>
          </button>
        </div>
      </footer>
    </div>
  );
}
