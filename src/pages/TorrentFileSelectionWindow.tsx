import { Check, FileText, ListFilter, LockKeyhole, Minus, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { TorrentWindowCloseButton } from "../components/torrent/TorrentWindowCloseButton";
import type { DownloadTask } from "../domain/download";
import * as service from "../services/downloadService";
import { useTranslation } from "../i18n";

const bytes = (value: number) => {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = value;
  let index = 0;
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index++;
  }
  return `${size.toFixed(index ? 1 : 0)} ${units[index]}`;
};

export function TorrentFileSelectionWindow({ taskId }: { taskId: string }) {
  const { t } = useTranslation();
  const appWindow = getCurrentWindow();
  const selectionAnchor = useRef<number | null>(null);
  const [task, setTask] = useState<DownloadTask | null>(null);
  const [selection, setSelection] = useState<service.TorrentFileSelection | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const currentTask = (await service.listDownloads()).find((item) => item.id === taskId);
      if (!currentTask?.infoHash) throw new Error("Torrent não foi encontrado na lista de downloads.");
      setTask(currentTask);
      setSelection(await service.getTorrentFileSelection(currentTask.infoHash));
    } catch (cause) {
      setError(String(cause));
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  useEffect(() => { void load(); }, [load]);

  const lockedIndexes = useMemo(
    () => new Set(selection?.lockedFileIndexes ?? []),
    [selection?.lockedFileIndexes],
  );

  const setSelectedIndexes = useCallback((next: Set<number>) => {
    setSelection((current) => {
      if (!current) return current;
      current.lockedFileIndexes.forEach((index) => next.add(index));
      return {
        ...current,
        selectedFileIndexes: current.files.map((file) => file.index).filter((index) => next.has(index)),
      };
    });
  }, []);

  const selectAll = useCallback(() => {
    if (!selection) return;
    setSelectedIndexes(new Set(selection.files.map((file) => file.index)));
  }, [selection, setSelectedIndexes]);

  const deselectAll = useCallback(() => {
    setSelectedIndexes(new Set(lockedIndexes));
    selectionAnchor.current = null;
  }, [lockedIndexes, setSelectedIndexes]);

  const toggleFile = useCallback((index: number) => {
    if (!selection || lockedIndexes.has(index)) return;
    const next = new Set(selection.selectedFileIndexes);
    if (next.has(index)) next.delete(index);
    else next.add(index);
    selectionAnchor.current = index;
    setSelectedIndexes(next);
  }, [lockedIndexes, selection, setSelectedIndexes]);

  const selectRow = useCallback((index: number, event: MouseEvent<HTMLDivElement>) => {
    if (!selection || lockedIndexes.has(index)) return;
    const next = new Set(selection.selectedFileIndexes);
    if (event.shiftKey && selectionAnchor.current !== null) {
      const anchor = selection.files.findIndex((file) => file.index === selectionAnchor.current);
      const target = selection.files.findIndex((file) => file.index === index);
      if (anchor !== -1 && target !== -1) {
        const [start, end] = anchor < target ? [anchor, target] : [target, anchor];
        selection.files.slice(start, end + 1).forEach((file) => {
          if (!lockedIndexes.has(file.index)) next.add(file.index);
        });
      }
    } else if (event.ctrlKey || event.metaKey) {
      if (next.has(index)) next.delete(index);
      else next.add(index);
      selectionAnchor.current = index;
    } else {
      next.clear();
      next.add(index);
      selectionAnchor.current = index;
    }
    setSelectedIndexes(next);
  }, [lockedIndexes, selection, setSelectedIndexes]);

  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "a") {
        event.preventDefault();
        selectAll();
      } else if (event.key === "Escape") {
        deselectAll();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [deselectAll, selectAll]);

  const save = async () => {
    if (!selection || !task?.infoHash) return;
    setSaving(true);
    setError(null);
    try {
      await service.updateTorrentFileSelection(task.infoHash, selection.selectedFileIndexes);
      await appWindow.close();
    } catch (cause) {
      setError(String(cause));
    } finally {
      setSaving(false);
    }
  };

  const onRowKeyDown = (index: number, event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      toggleFile(index);
    }
  };

  const selectedCount = selection?.selectedFileIndexes.length ?? 0;
  const fileCount = selection?.files.length ?? 0;
  const allSelected = fileCount > 0 && selectedCount === fileCount;
  const canDeselect = Boolean(selection?.selectedFileIndexes.some((index) => !lockedIndexes.has(index)));

  return (
    <main className="dw-window dw-progress torrent-file-editor-window">
      <header className="torrent-file-editor-title" data-tauri-drag-region>
        <div className="torrent-file-editor-heading" data-tauri-drag-region>
          <span className="torrent-file-editor-icon"><ListFilter size={27} /></span>
          <span>
            <strong>Editar arquivos do torrent</strong>
            <small title={task?.fileName}>{task?.fileName ?? "Carregando torrent…"}{selection ? ` · ${fileCount} arquivos` : ""}</small>
          </span>
        </div>
        <div className="dw-controls">
          <button title={t.titlebar.minimizeTooltip} aria-label={t.titlebar.minimizeTooltip} onClick={() => void appWindow.minimize()}><Minus /></button>
          <TorrentWindowCloseButton title={t.titlebar.closeTooltip} onClose={() => void appWindow.close()} />
        </div>
      </header>

      <section className="torrent-file-editor-content">
        <div className="torrent-file-editor-intro">
          <h1>Selecionar conteúdo</h1>
          <p>Remova arquivos que ainda não começaram. Arquivos em andamento ou concluídos ficam protegidos.</p>
        </div>

        {loading && <div className="torrent-file-editor-loading">Carregando arquivos…</div>}
        {error && !loading && (
          <div className="torrent-file-editor-error" role="alert">
            <span>{error}</span>
            <button type="button" className="torrent-file-editor-secondary" onClick={() => void load()}>Tentar novamente</button>
          </div>
        )}
        {selection && !loading && (
          <>
            <div className="torrent-file-editor-actions">
              <strong><b>{selectedCount}</b> de {fileCount} selecionados</strong>
              <div>
                <button className="torrent-file-editor-secondary" onClick={selectAll} disabled={allSelected}><Check size={17} /> Selecionar todos</button>
                <button className="torrent-file-editor-secondary" onClick={deselectAll} disabled={!canDeselect}><span className="torrent-file-editor-empty-mark" /> Desmarcar todos</button>
              </div>
            </div>

            <div className="torrent-file-editor-table" role="grid" aria-label="Arquivos do torrent">
              <div className="torrent-file-editor-table-head" role="row">
                <button
                  className={`torrent-file-editor-check${allSelected ? " checked" : ""}`}
                  aria-label={allSelected ? "Desmarcar arquivos disponíveis" : "Selecionar todos os arquivos"}
                  onClick={allSelected ? deselectAll : selectAll}
                >{allSelected && <Check size={17} />}</button>
                <span>Nome</span>
                <span>Tamanho</span>
              </div>
              <div className="torrent-file-editor-table-body">
                {selection.files.map((file) => {
                  const selected = selection.selectedFileIndexes.includes(file.index);
                  const locked = lockedIndexes.has(file.index);
                  return (
                    <div
                      key={file.index}
                      className={`torrent-file-editor-row${selected ? " selected" : ""}${locked ? " locked" : ""}`}
                      role="checkbox"
                      aria-checked={selected}
                      aria-disabled={locked || undefined}
                      tabIndex={locked ? -1 : 0}
                      onClick={(event) => selectRow(file.index, event)}
                      onKeyDown={(event) => onRowKeyDown(file.index, event)}
                    >
                      <button
                        className={`torrent-file-editor-check${selected ? " checked" : ""}`}
                        aria-label={locked ? "Arquivo protegido" : selected ? "Remover da seleção" : "Adicionar à seleção"}
                        disabled={locked}
                        onClick={(event) => { event.stopPropagation(); toggleFile(file.index); }}
                      >{selected && <Check size={17} />}</button>
                      <span className="torrent-file-editor-name"><FileText size={25} /> <span title={file.path}>{file.path}</span>{locked && <span title="Em andamento ou concluído"><LockKeyhole size={14} /></span>}</span>
                      <b>{bytes(file.size)}</b>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </section>

      <footer className="torrent-file-editor-footer">
        <button className="torrent-file-editor-secondary" onClick={() => void appWindow.close()}><X size={22} /> Cancelar</button>
        <button className="torrent-file-editor-primary" disabled={!selection || selectedCount === 0 || saving} onClick={() => void save()}><ListFilter size={23} /> {saving ? "Salvando…" : "Salvar seleção"}</button>
      </footer>
    </main>
  );
}
