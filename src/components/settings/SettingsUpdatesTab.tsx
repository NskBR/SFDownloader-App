import { useEffect, useRef, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { createPortal } from "react-dom";
import { checkForUpdates } from "../../services/downloadService";
import type { Translations } from "../../i18n";
import { useTranslation } from "../../i18n";
import { ChevronRight, X } from "../icons";

const bundledNotes = import.meta.glob("../../../docs/release-notes/*.txt", {
  eager: true, query: "?raw", import: "default",
}) as Record<string, string>;
const initialNotes = Object.fromEntries(Object.entries(bundledNotes).map(([path, notes]) => [
  path.split("/").pop()!.replace(/\.txt$/, ""), notes,
]));

export function SettingsUpdatesTab({ t }: { t: Translations }) {
  const { language } = useTranslation();
  const pt = language === "pt-BR";
  const [checking, setChecking] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const [notes, setNotes] = useState(initialNotes);
  const [selected, setSelected] = useState<string | null>(null);
  const [currentVersion, setCurrentVersion] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { let active = true; void getVersion().then(version => {
    if (active) setCurrentVersion(version);
  }).catch(() => {}); return () => { active = false; }; }, []);
  useEffect(() => {
    if (!selected) return;
    const node = dialog.current;
    node?.showModal();
    return () => node?.close();
  }, [selected]);
  const check = async () => {
    if (checking) return;
    setChecking(true);
    setFailed(false);
    setMessage("");
    try {
      const result = await checkForUpdates();
      setMessage(result.available
        ? t.settings.advancedTab.updateAvailable.replace("{version}", result.latest_version)
        : t.settings.advancedTab.upToDate);
      if (result.release_notes?.trim()) {
        setNotes(previous => ({ ...previous, [result.latest_version]: result.release_notes! }));
      }
    } catch {
      setFailed(true);
      setMessage(t.settings.advancedTab.updateCheckFailed);
    } finally {
      setChecking(false);
    }
  };
  const versions = Object.keys(notes).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
  return <div className="cfg-tab-view cfg-updates-view">
    <section className="cfg-card">
      <div className="cfg-card-header"><div>
        <h3 className="cfg-card-title">{pt ? "Versão" : "Version"} {currentVersion || "…"}</h3>
        <p className="cfg-card-subtitle">{t.settings.advancedTab.updatesDescription}</p>
      </div></div>
      <div className="cfg-card-content">
        <button type="button" className="cfg-btn-alterar" disabled={checking} onClick={() => void check()}>
          {checking ? t.settings.advancedTab.checkingUpdates : t.settings.advancedTab.checkUpdates}
        </button>
        {message && <p className="cfg-update-result" role={failed ? "alert" : "status"}>{message}</p>}
      </div>
      {notes[currentVersion] && <button type="button" className="cfg-btn-alterar" onClick={() => setSelected(currentVersion)}>{pt ? "Ver notas da versão" : "View release notes"}</button>}
    </section>
    <section className="cfg-card">
      <div className="cfg-card-header"><h3 className="cfg-card-title">{pt ? "Histórico de atualizações" : "Update history"}</h3></div>
      <div className="cfg-card-content">
        <p className="cfg-card-subtitle">{pt ? "Escolha uma versão para consultar suas mudanças." : "Choose a version to view its changes."}</p>
        <div className="cfg-patch-list" role="group" aria-label={pt ? "Versões" : "Versions"}>
          {versions.map(version => <button type="button" key={version}
            onClick={() => setSelected(version)}><span>{pt ? "Versão" : "Version"} {version}</span><ChevronRight size={16}/></button>)}
        </div>
      </div>
    </section>
    {selected && createPortal(<dialog ref={dialog} className="update-notes-dialog cfg-history-dialog" aria-labelledby="cfg-history-title"
      onCancel={event => { event.preventDefault(); setSelected(null); }}>
      <header><div><h2 id="cfg-history-title">{pt ? "Notas da atualização" : "Release notes"}</h2><p>{pt ? "Versão" : "Version"} {selected}</p></div>
        <button type="button" className="cfg-history-close" aria-label={pt ? "Fechar" : "Close"} onClick={() => setSelected(null)}><X size={20}/></button></header>
      <section className="cfg-history-body">{notes[selected].split(/\n\s*\n/).map((paragraph, index) => <p className="cfg-patch-notes" key={index}>{paragraph}</p>)}</section>
      <footer><button type="button" className="cfg-btn-alterar" onClick={() => setSelected(null)}>{pt ? "Entendi" : "Got it"}</button></footer>
    </dialog>, document.body)}
  </div>;
}

