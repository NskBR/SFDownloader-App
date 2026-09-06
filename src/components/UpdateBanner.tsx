import React from "react";
import { Sparkles, ExternalLink, X } from "lucide-react";
import type { UpdateCheckResult } from "../services/downloadService";
import { openUrl } from "../services/downloadService";
import { useTranslation } from "../i18n";

interface UpdateBannerProps {
  update: UpdateCheckResult;
  onDismiss: () => void;
}

export const UpdateBanner: React.FC<UpdateBannerProps> = ({
  update,
  onDismiss,
}) => {
  const { t } = useTranslation();
  const handleOpenRelease = () => {
    if (update.release_url) {
      void openUrl(update.release_url);
    }
  };

  return (
    <div className="update-banner-container">
      <div className="update-banner-content">
        <span className="update-banner-badge">
          <Sparkles size={14} className="icon-pulse" />
          <span>{t.titlebar.newVersionAvailable}</span>
        </span>
        <span className="update-banner-text">
          {t.titlebar.newVersionAvailable}: <strong>v{update.latest_version}</strong>
        </span>
      </div>
      <div className="update-banner-actions">
        <button className="update-banner-btn-primary" onClick={handleOpenRelease}>
          <span>{t.titlebar.viewRelease}</span>
          <ExternalLink size={13} />
        </button>
        <button className="update-banner-btn-dismiss" title={t.common.close} aria-label={t.common.close} onClick={onDismiss}>
          <X size={15} />
        </button>
      </div>
    </div>
  );
};
