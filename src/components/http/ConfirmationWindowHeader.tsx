import { Download, Minus, X } from "lucide-react";
import { useTranslation } from "../../i18n";

interface ConfirmationWindowHeaderProps {
  title: string;
  onMinimize: () => void;
  onClose: () => void;
}

export function ConfirmationWindowHeader({ title, onMinimize, onClose }: ConfirmationWindowHeaderProps) {
  const { t } = useTranslation();

  return (
    <header className="confirm-header" data-tauri-drag-region>
      <div className="confirm-header-left">
        <Download className="confirm-header-icon" size={20} />
        <span className="confirm-title" title={title}>{title}</span>
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
