import {
  Archive,
  ChevronDown,
  Download,
  Eye,
  EyeOff,
  FileText,
  FolderOpen,
  Globe,
  LockKeyhole,
  Minus,
  Package,
  X,
  AlertTriangle,
  RotateCcw,
  Ban,
  Info,
  ArrowLeft,
  Wifi,
  CheckCircle2,
  Lock,
  Copy,
  CopyCheck,
  Code,
  HardDrive,
  Check,
  PlusCircle,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { emit } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Toggle } from "../components/ui/Toggle";
import { CustomSelect } from "../components/ui/CustomSelect";
import { categoryForFile, downloadCategories } from "../domain/categories";
import {
  hasCompletePreview,
  isArchivePreview,
  mergeHttpPreview,
  previewDisplayExtension,
  previewFromTorrent,
} from "../domain/confirmationPreview";
import { loadSettings } from "../services/settingsStorage";
import * as service from "../services/downloadService";
import { formatDownloadStartError } from "../domain/confirmationErrors";
import { ipcErrorMessage } from "../domain/ipcErrors";
import { useTranslation } from "../i18n";
import { ConfirmationWindowHeader } from "../components/http/ConfirmationWindowHeader";

interface Payload {
  url: string;
  destination: string;
  requestId?: string;
  preview?: service.DownloadPreview;
}

const bytes = (value: number | null) => {
  if (value === null) return "Desconhecido";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = value,
    index = 0;
  while (size >= 1024 && index < 4) {
    size /= 1024;
    index++;
  }
  return `${size.toFixed(index ? 1 : 0)} ${units[index]}`;
};

const shortHost = (value: string) => {
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return value;
  }
};

const baseName = (value: string) => value.split(/[\\/]/).pop() || value;

export function ConfirmationPage({ token }: { token: string }) {
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
  const [preview, setPreview] = useState<service.DownloadPreview | null>(
    payload?.preview || null,
  );
  const [loading, setLoading] = useState(Boolean(payload && !payload.preview));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [duplicateOpen, setDuplicateOpen] = useState(false);
  const [autoExtract, setAutoExtract] = useState(false);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState("Outros");
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [locationPickerOpen, setLocationPickerOpen] = useState(false);
  const locationPickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!locationPickerOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (
        locationPickerRef.current &&
        !locationPickerRef.current.contains(e.target as Node)
      ) {
        setLocationPickerOpen(false);
      }
    };
    window.addEventListener("mousedown", handleClickOutside);
    return () => window.removeEventListener("mousedown", handleClickOutside);
  }, [locationPickerOpen]);

  const chooseFolder = async () => {
    try {
      const path = await open({ directory: true });
      if (typeof path === "string" && path.trim()) {
        setDestination(path.trim());
        setLocationPickerOpen(false);
        try {
          localStorage.setItem("sf-downloader.last-save-folder", path.trim());
        } catch {}
      }
    } catch {}
  };

  const selectPrimaryLocation = () => {
    const primary = settings.rootDownloadFolder || destination;
    setDestination(primary);
    setLocationPickerOpen(false);
    try {
      localStorage.setItem("sf-downloader.last-save-folder", primary);
    } catch {}
  };

  const selectSecondaryLocation = async () => {
    if (!settings.secondaryDownloadFolder) {
      await chooseFolder();
    } else {
      setDestination(settings.secondaryDownloadFolder);
      setLocationPickerOpen(false);
      try {
        localStorage.setItem(
          "sf-downloader.last-save-folder",
          settings.secondaryDownloadFolder,
        );
      } catch {}
    }
  };

  useEffect(() => {
    if (!payload) return;
    // If preview already has a valid fileSize (> 0) and valid extension, skip re-inspection
    if (hasCompletePreview(preview)) {
      setLoading(false);
      return;
    }

    setLoading(true);
    let active = true;
    if (
      payload.url.startsWith("magnet:") ||
      payload.url.toLowerCase().endsWith(".torrent")
    ) {
      void service
        .parseTorrentInfo(payload.url)
        .then((meta) => {
          if (!active) return;
          setPreview(previewFromTorrent(payload.url, meta));
        })
        .catch((cause) => active && setError(String(cause)))
        .finally(() => active && setLoading(false));
    } else {
      void service
        .inspectDownload(payload.url, payload.requestId)
        .then((result) => {
          if (!active) return;
          setPreview((previous) =>
            mergeHttpPreview(result, previous, payload.url),
          );
        })
        .catch((cause) => active && setError(String(cause)))
        .finally(() => active && setLoading(false));
    }
    return () => {
      active = false;
    };
  }, [payload]);

  useEffect(() => {
    if (preview) {
      setSelectedCategory(
        categoryForFile(
          preview.fileName,
          settings.customCategories,
          undefined,
          preview.url,
        ),
      );
    }
  }, [preview, settings.customCategories]);

  const displayExtension = useMemo(
    () => previewDisplayExtension(preview),
    [preview],
  );

  const close = () => void appWindow.close();
  const isArchive = isArchivePreview(preview);
  const categories = [
    ...downloadCategories.map((item) => item.name),
    ...settings.customCategories.map((item) => item.name),
  ];
  const isPreconfiguredFolder =
    destination.trim() !== "" &&
    (destination === settings.rootDownloadFolder ||
      (Boolean(settings.secondaryDownloadFolder) &&
        destination === settings.secondaryDownloadFolder));

  const isCustomFolder = destination.trim() !== "" && !isPreconfiguredFolder;

  const restoreDefaultFolder = () => {
    setDestination(settings.rootDownloadFolder);
    try {
      localStorage.removeItem("sf-downloader.last-save-folder");
    } catch {}
  };

  const finish = async (force = false) => {
    if (!preview) return;
    setBusy(true);
    setError(null);
    try {
      const task = await service.startDownload(
        preview.url,
        isCustomFolder ? { ...settings, autoOrganizeEnabled: false } : settings,
        destination,
        payload?.requestId,
        true,
        autoExtract,
        isArchive && password.trim() ? password : undefined,
        !isCustomFolder && settings.autoOrganizeEnabled
          ? selectedCategory
          : undefined,
        force,
      );
      localStorage.removeItem(storageKey);
      setDuplicateOpen(false);
      close();
      void emit("download-created", task).catch(() => {});
    } catch (cause) {
      const message = ipcErrorMessage(cause, "Não foi possível iniciar o download.");
      if (/já foi baixado/i.test(message)) {
        setDuplicateOpen(true);
      } else {
        setError(message);
      }
    } finally {
      setBusy(false);
    }
  };

  const fileNameText = preview?.fileName
    ? baseName(preview.fileName)
    : loading
      ? "Consultando arquivo..."
      : "Confirmar download";

  const hostName = payload?.url ? shortHost(payload.url) : "";

  if (!payload)
    return (
      <main className="download-window confirm-v2 http-confirm-window">
        <ConfirmationWindowHeader
          title="Confirmar download"
          onMinimize={() => void appWindow.minimize()}
          onClose={close}
        />
        <p className="window-error confirm-empty">
          Solicitação não encontrada.
        </p>
      </main>
    );

  return (
    <main className="download-window confirm-v2 http-confirm-window">
      {/* 1. Header (Barra de título com nome do arquivo) */}
      <ConfirmationWindowHeader
        title={fileNameText}
        onMinimize={() => void appWindow.minimize()}
        onClose={close}
      />

      {/* 2. Conteúdo Central (Apenas se não houver erro) */}
      {!error && (
        <>
          <div className="confirm-body">
            {/* Linha 1: Local e Categoria em 2 Colunas */}
            <div className="confirm-grid-row">
              <div
                className="confirm-field-col"
                ref={locationPickerRef}
                style={{ position: "relative" }}
              >
                <div className="confirm-label-row">
                  <span className="confirm-label">
                    {t.confirmation.location}
                  </span>
                  {isCustomFolder && (
                    <button
                      type="button"
                      className="confirm-btn-reset-default"
                      onClick={restoreDefaultFolder}
                      title={t.confirmation.restoreDefaultTooltip}
                    >
                      <RotateCcw size={12} />
                      <span>{t.confirmation.restoreDefault}</span>
                    </button>
                  )}
                </div>
                <div
                  className="confirm-control-box"
                  onClick={() => setLocationPickerOpen((v) => !v)}
                  style={{ cursor: "pointer" }}
                >
                  <FolderOpen className="field-icon" size={16} />
                  <input
                    className="confirm-input-text"
                    value={destination || ""}
                    placeholder="Selecione uma pasta"
                    readOnly
                    style={{ cursor: "pointer" }}
                  />
                  <button
                    type="button"
                    className="confirm-btn-alterar"
                    onClick={(e) => {
                      e.stopPropagation();
                      setLocationPickerOpen((v) => !v);
                    }}
                  >
                    {t.confirmation.change}
                  </button>
                </div>

                {/* Dropdown Popover de Locais de Download (Ultra-Compacto em Linha Única) */}
                {locationPickerOpen && (
                  <div className="location-picker-dropdown">
                    {/* Opção 1: Pasta download padrão */}
                    <button
                      type="button"
                      className={`location-dropdown-opt ${destination === settings.rootDownloadFolder ? "selected" : ""}`}
                      onClick={selectPrimaryLocation}
                      title={settings.rootDownloadFolder || "Pasta Padrão"}
                    >
                      <FolderOpen size={15} className="loc-opt-icon" />
                      <span className="loc-opt-title">Pasta padrão</span>
                      <span className="loc-opt-path">
                        {settings.rootDownloadFolder
                          ? `(${settings.rootDownloadFolder})`
                          : ""}
                      </span>
                      {destination === settings.rootDownloadFolder && (
                        <Check size={14} className="loc-opt-check" />
                      )}
                    </button>

                    {/* Opção 2: Segunda pasta em outro disco */}
                    <button
                      type="button"
                      className={`location-dropdown-opt ${destination === settings.secondaryDownloadFolder && settings.secondaryDownloadFolder ? "selected" : ""}`}
                      onClick={() => void selectSecondaryLocation()}
                      title={
                        settings.secondaryDownloadFolder ||
                        "Segunda Pasta (Outro disco)"
                      }
                    >
                      <HardDrive size={15} className="loc-opt-icon" />
                      <span className="loc-opt-title">Segunda pasta</span>
                      <span className="loc-opt-path">
                        {settings.secondaryDownloadFolder
                          ? `(${settings.secondaryDownloadFolder})`
                          : "(Não configurada)"}
                      </span>
                      {destination === settings.secondaryDownloadFolder &&
                      settings.secondaryDownloadFolder ? (
                        <Check size={14} className="loc-opt-check" />
                      ) : !settings.secondaryDownloadFolder ? (
                        <span className="loc-opt-tag">Configurar</span>
                      ) : null}
                    </button>

                    {/* Opção 3: Escolher outro local */}
                    <button
                      type="button"
                      className="location-dropdown-opt"
                      onClick={() => void chooseFolder()}
                    >
                      <PlusCircle size={15} className="loc-opt-icon" />
                      <span className="loc-opt-title">
                        Escolher outro local...
                      </span>
                    </button>
                  </div>
                )}
              </div>

              <div
                className={`confirm-field-col${isCustomFolder ? " confirm-field-disabled" : ""}`}
              >
                <span className="confirm-label">{t.confirmation.category}</span>
                <div className="confirm-control-box box-custom-select">
                  <CustomSelect
                    value={isCustomFolder ? "" : selectedCategory}
                    options={
                      isCustomFolder
                        ? [{ value: "", label: t.confirmation.customFolder }]
                        : categories.map((cat) => ({ value: cat, label: cat }))
                    }
                    onChange={(val) => setSelectedCategory(val)}
                    disabled={isCustomFolder}
                    icon={<Archive size={16} />}
                    direction="down"
                  />
                </div>
              </div>
            </div>

            {/* Linha 2: Pílula Integrada de Metadados */}
            <div className="confirm-meta-row">
              <div
                className="confirm-meta-item item-origin"
                title={hostName || "Provedor desconhecido"}
              >
                <Globe size={16} />
                <span>{hostName || "origem desconhecida"}</span>
              </div>
              <div className="confirm-meta-item item-size">
                <Package size={16} />
                <span>
                  {loading ? "Calculando..." : bytes(preview?.fileSize ?? null)}
                </span>
              </div>
              <div className="confirm-meta-item item-type">
                <FileText size={16} />
                <span>{displayExtension}</span>
              </div>
            </div>

            {/* Linha 3: Extrair e Senha em 2 Colunas */}
            <div className="confirm-grid-row">
              <div
                className="confirm-control-box box-toggle"
                title={t.confirmation.autoExtract}
              >
                <Toggle
                  label={t.confirmation.autoExtract}
                  checked={isArchive && autoExtract}
                  onChange={setAutoExtract}
                  disabled={!isArchive}
                />
                <span className="toggle-label">
                  {t.confirmation.autoExtract}
                </span>
              </div>

              <div
                className={`confirm-control-box box-password ${autoExtract ? "" : "is-disabled"}`}
              >
                <LockKeyhole className="field-icon" size={16} />
                <input
                  className="confirm-input-text"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  disabled={!autoExtract}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder={t.confirmation.passwordPlaceholder}
                />
                <button
                  type="button"
                  className="confirm-btn-eye"
                  onClick={() => setShowPassword((value) => !value)}
                  disabled={!autoExtract}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
          </div>

          {/* 3. Rodapé Fixo */}
          <footer className="confirm-footer">
            <button
              className="confirm-details-toggle"
              onClick={() => setDetailsOpen((v) => !v)}
            >
              <ChevronDown className={detailsOpen ? "is-open" : ""} size={16} />
              <span>{t.downloadWindow.moreDetails}</span>
            </button>

            <div className="confirm-footer-actions">
              <button className="confirm-btn-cancel" onClick={close}>
                {t.common.cancel}
              </button>
              <button
                className="confirm-btn-start"
                disabled={busy || loading || !preview}
                onClick={() => void finish()}
              >
                <Download size={18} />
                <span>
                  {busy
                    ? `${t.confirmation.startDownload}...`
                    : t.confirmation.startDownload}
                </span>
              </button>
            </div>
          </footer>
        </>
      )}

      {/* Painel de Mais Detalhes (Compacto, sem scroll, 3 ações) */}
      {detailsOpen && (
        <div className="dw-details dw-details-full">
          <div className="dw-details-header" data-tauri-drag-region>
            <button
              type="button"
              className="dw-details-back nodrag"
              onClick={() => setDetailsOpen(false)}
            >
              <ArrowLeft size={14} />
              <span>{t.common.back}</span>
            </button>
            <span className="dw-details-header-title">
              {t.downloadWindow.detailsTitle}
            </span>
          </div>

          <div className="dw-details-compact-body">
            {/* Tabela de Metadados Técnicos */}
            <div className="dw-details-card">
              <div className="dw-detail-row">
                <span className="dw-detail-label">
                  {t.downloadWindow.originalUrl}
                </span>
                <b className="dw-detail-val dw-detail-path" title={payload.url}>
                  {payload.url}
                </b>
              </div>
              <div className="dw-detail-row">
                <span className="dw-detail-label">Host</span>
                <b className="dw-detail-val">{hostName || "—"}</b>
              </div>
              <div className="dw-detail-row">
                <span className="dw-detail-label">MIME</span>
                <b className="dw-detail-val">
                  {preview?.mimeType || "application/octet-stream"}
                </b>
              </div>
              <div className="dw-detail-row">
                <span className="dw-detail-label">{t.common.size}</span>
                <b className="dw-detail-val">
                  {preview?.fileSize
                    ? `${preview.fileSize.toLocaleString()} bytes`
                    : "—"}
                </b>
              </div>
              <div className="dw-detail-row">
                <span className="dw-detail-label">Ext</span>
                <b className="dw-detail-val">
                  {preview?.extension?.toUpperCase() || "N/A"}
                </b>
              </div>
              <div className="dw-detail-row">
                <span className="dw-detail-label">
                  {t.downloadWindow.destinationFolder}
                </span>
                <b className="dw-detail-val dw-detail-path" title={destination}>
                  {destination || "—"}
                </b>
              </div>
            </div>

            {/* Apenas os 3 Botões Pequenos Diretos no Rodapé */}
            <div className="dw-mini-actions-row">
              <button
                type="button"
                className="dw-mini-action-btn"
                onClick={() => void navigator.clipboard.writeText(payload.url)}
              >
                <Copy size={13} className="icon-green" />
                <span>{t.downloads.copyUrl}</span>
              </button>
              <button
                type="button"
                className="dw-mini-action-btn"
                onClick={() => {
                  const info = `URL: ${payload.url}\nHost: ${hostName}\nMIME: ${preview?.mimeType}\nSize: ${preview?.fileSize} bytes\nDest: ${destination}`;
                  void navigator.clipboard.writeText(info);
                }}
              >
                <CopyCheck size={13} className="icon-green" />
                <span>{t.common.copy}</span>
              </button>
              <button
                type="button"
                className="dw-mini-action-btn"
                onClick={chooseFolder}
              >
                <FolderOpen size={13} className="icon-amber" />
                <span>{t.common.openFolder}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="confirm-error-sheet">
          <div className="confirm-error-body">
            <div className="confirm-error-left">
              <div className="confirm-error-glow-icon">
                <AlertTriangle size={68} strokeWidth={1.8} />
              </div>
            </div>

            <div className="confirm-error-right">
              <h2 className="confirm-error-title">Erro ao iniciar download</h2>

              <div className="confirm-error-info-card">
                <div className="confirm-error-info-icon">
                  <Info size={22} />
                </div>
                <div className="confirm-error-info-content">
                  <p className="confirm-error-info-primary">
                    {formatDownloadStartError(error)}
                  </p>
                  <p className="confirm-error-info-secondary">
                    Siga as sugestões abaixo para resolver o problema e tentar
                    novamente.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="confirm-error-sep" />

          <div className="confirm-error-footer-row">
            <div className="confirm-error-suggestions">
              <div className="confirm-suggestion-item">
                <div className="confirm-suggestion-badge badge-green">
                  <Globe size={18} />
                </div>
                <span>
                  Verifique se a fonte de download ainda está disponível
                </span>
              </div>

              <div className="confirm-suggestion-divider" />

              <div className="confirm-suggestion-item">
                <div className="confirm-suggestion-badge badge-blue">
                  <Ban size={18} />
                </div>
                <span>Cancele outra instância do arquivo em download</span>
              </div>

              <div className="confirm-suggestion-divider" />

              <div className="confirm-suggestion-item">
                <div className="confirm-suggestion-badge badge-purple">
                  <FolderOpen size={18} />
                </div>
                <span>Troque a pasta de download do arquivo</span>
              </div>
            </div>

            <button
              className="confirm-error-btn-primary"
              onClick={() => setError(null)}
            >
              Voltar
            </button>
          </div>
        </div>
      )}

      {duplicateOpen && (
        <div className="confirm-duplicate-overlay">
          <section className="confirm-duplicate-dialog">
            <header>
              <AlertTriangle />
              <span>Download já realizado</span>
            </header>
            <p>Este arquivo já foi baixado uma vez.</p>
            <footer>
              <button disabled={busy} onClick={() => void finish(true)}>
                Baixar novamente
              </button>
              <button
                className="confirm-duplicate-cancel"
                onClick={() => setDuplicateOpen(false)}
              >
                Cancelar
              </button>
            </footer>
          </section>
        </div>
      )}
    </main>
  );
}
