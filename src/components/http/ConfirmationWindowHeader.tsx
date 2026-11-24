import { Download, Minus, X, LockKeyhole } from "lucide-react";
import { useTranslation } from "../../i18n";

interface ConfirmationWindowHeaderProps {
  title: string;
  archiveProtected?: boolean;
  onMinimize: () => void;
  onClose: () => void;
}

export function ConfirmationWindowHeader({ title, onMinimize, onClose, archiveProtected }: ConfirmationWindowHeaderProps) {
  const { t } = useTranslation();

  return (
    <header className="confirm-header" data-tauri-drag-region>
      <div className="confirm-header-left">
        <Download className="confirm-header-icon" size={20} />
        <span className="confirm-title" title={title}>{title}</span>
        {archiveProtected && <span className="archive-password-indicator nodrag" tabIndex={0} title="Esse arquivo é protegido por senha" aria-label="Esse arquivo é protegido por senha"><LockKeyhole size={16}/></span>}
      </div>
      <div className="confirm-window-controls nodrag">
        <button type="button" onClick={onMinimize} title={t.common.minimize} aria-label={t.common.minimize}>
          <Minus size={16} />
        </button>
        <button type="button" onClick={onClose} title={t.common.close} aria-label={t.common.close}>
          <X size={16} />
        </button>
      </div>
    </header>
  );
}
