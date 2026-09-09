import { useCallback, useEffect, useState } from "react";
import { BarChart3, RotateCcw, RefreshCw, Download, Upload, AlertTriangle, X } from "lucide-react";
import { getMetrics, resetMetrics, exportMetrics, importMetrics } from "../services/downloadService";
import type { MetricsSnapshot } from "../domain/metrics";
import { useTranslation } from "../i18n";

const GB = 1024 * 1024 * 1024;

function formatBytes(value: number): string {
  if (value <= 0) return "0 GB";
  const gb = value / GB;
  if (gb >= 1) return `${gb.toFixed(gb >= 100 ? 0 : 1)} GB`;
  const mb = value / (1024 * 1024);
  return `${mb.toFixed(0)} MB`;
}

function formatSpeed(bytesPerSecond: number): string {
  if (bytesPerSecond <= 0) return "—";
  const mbps = bytesPerSecond / (1024 * 1024);
  if (mbps >= 1) return `${mbps.toFixed(mbps >= 100 ? 0 : 1)} MB/s`;
  const kbps = bytesPerSecond / 1024;
  return `${kbps.toFixed(0)} KB/s`;
}

interface Segment {
  label: string;
  value: number;
  color: string;
}

function Donut({ segments, centerLabel, centerValue }: {
  segments: Segment[];
  centerLabel: string;
  centerValue: string;
}) {
  const size = 160;
  const stroke = 18;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;

  const activeSegments = segments.filter((s) => s.value > 0);
  const total = activeSegments.reduce((sum, segment) => sum + segment.value, 0);

  const gap = activeSegments.length > 1 ? 3 : 0;
  const totalGap = gap * activeSegments.length;
  const availableCircumference = Math.max(0, circumference - totalGap);

  let accumulatedOffset = 0;

  return (
    <div className="donut-wrap">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--line-soft)"
          strokeWidth={stroke}
        />
        {total > 0 &&
          activeSegments.map((segment) => {
            const fraction = segment.value / total;
            const dash = fraction * availableCircumference;
            const currentOffset = accumulatedOffset;
            accumulatedOffset += dash + gap;

            return (
              <circle
                key={segment.label}
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke={segment.color}
                strokeWidth={stroke}
                strokeLinecap="butt"
                strokeDasharray={`${dash} ${circumference - dash}`}
                strokeDashoffset={-currentOffset}
                transform={`rotate(-90 ${size / 2} ${size / 2})`}
                style={{ transition: "stroke-dasharray 0.3s ease, stroke-dashoffset 0.3s ease" }}
              />
            );
          })}
      </svg>
      <div className="donut-center">
        <strong>{centerValue}</strong>
        <span>{centerLabel}</span>
      </div>
    </div>
  );
}

export function MetricsPage() {
  const { t } = useTranslation();
  const [metrics, setMetrics] = useState<MetricsSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [resetting, setResetting] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    void getMetrics()
      .then(setMetrics)
      .catch(() => setMetrics(null));
  }, []);

  useEffect(load, [load]);

  const handleConfirmReset = async () => {
    setResetting(true);
    try {
      await resetMetrics();
      setConfirmReset(false);
      load();
    } finally {
      setResetting(false);
    }
  };

  const handleExport = async (format: "json" | "txt") => {
    try {
      await exportMetrics(format);
    } catch {
      /* diálogo cancelado pelo usuário */
    }
  };

  const handleImport = async () => {
    try {
      await importMetrics();
      load();
    } catch {
      /* diálogo cancelado ou JSON inválido */
    }
  };

  const completedBytes = metrics?.completedBytes ?? 0;
  const cancelledBytes = metrics?.cancelledBytes ?? 0;
  const failedBytes = metrics?.failedBytes ?? 0;
  const completedCount = metrics?.completedCount ?? 0;
  const totalDurationMs = metrics?.totalDurationMs ?? 0;
  const averageSpeed =
    totalDurationMs > 0 ? completedBytes / (totalDurationMs / 1000) : 0;
  const statusTotal = completedBytes + cancelledBytes + failedBytes;

  const segments: Segment[] = [
    { label: t.metrics.completed, value: completedBytes, color: "var(--accent-green)" },
    { label: t.metrics.cancelled, value: cancelledBytes, color: "var(--accent-amber)" },
    { label: t.metrics.failed, value: failedBytes, color: "var(--accent-red)" },
  ];

  const cards = [
    { label: t.metrics.completed, value: formatBytes(completedBytes), accent: "green" },
    { label: t.metrics.cancelled, value: formatBytes(cancelledBytes), accent: "amber" },
    { label: t.metrics.failed, value: formatBytes(failedBytes), accent: "red" },
    { label: t.metrics.extracted, value: formatBytes(metrics?.extractedBytes ?? 0), accent: "ember" },
    { label: t.metrics.ssdWritten, value: formatBytes(metrics?.ssdWrittenBytes ?? 0), accent: "slate" },
    { label: t.metrics.averageSpeed, value: formatSpeed(averageSpeed), accent: "ember" },
  ];

  return (
    <section className="metrics-page">
      <header className="metrics-header">
        <div>
          <h1>{t.metrics.title}</h1>
          <p>{t.metrics.subtitle}</p>
        </div>
        <div className="metrics-actions">
          <button
            className="reset-btn"
            onClick={handleImport}
            title={t.metrics.importTooltip}
            aria-label={t.metrics.import}
          >
            <Upload size={15} />
            {t.metrics.import}
          </button>
          <button
            className="reset-btn"
            onClick={() => void handleExport("txt")}
            title={t.metrics.txtTooltip}
            aria-label="Export TXT"
          >
            <Download size={15} />
            TXT
          </button>
          <button
            className="reset-btn"
            onClick={() => void handleExport("json")}
            title={t.metrics.jsonTooltip}
            aria-label="Export JSON"
          >
            <Download size={15} />
            JSON
          </button>
          <button
            className="reset-btn"
            onClick={load}
            title={t.metrics.refreshTooltip}
            aria-label={t.metrics.refresh}
          >
            <RefreshCw size={15} />
            {t.metrics.refresh}
          </button>
          <button
            className="reset-btn reset-btn--danger"
            onClick={() => setConfirmReset(true)}
            disabled={resetting}
            title={t.metrics.resetTooltip}
          >
            <RotateCcw size={15} />
            {t.metrics.reset}
          </button>
        </div>
      </header>

      <div className="metrics-body">
        <div className="metrics-chart-card">
          <h2 className="metrics-panel-title">{t.metrics.downloadStatus}</h2>
          <Donut
            segments={segments}
            centerLabel={t.metrics.downloadedCenter}
            centerValue={formatBytes(completedBytes)}
          />
          <ul className="donut-legend">
            {segments.map((segment) => {
              const pct =
                statusTotal > 0
                  ? Math.round((segment.value / statusTotal) * 100)
                  : 0;
              return (
                <li key={segment.label}>
                  <span className="legend-dot" style={{ background: segment.color }} />
                  {segment.label}
                  <b>{formatBytes(segment.value)}</b>
                  <span className="legend-pct">{pct}%</span>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="metrics-stats">
          <div className="metric-card metric-card--hero">
            <span className="metric-label">{t.metrics.totalDownloaded}</span>
            <strong className="metric-value metric-value--hero">
              {formatBytes(metrics?.totalBytes ?? 0)}
            </strong>
            <span className="metric-sub">
              {completedCount > 0
                ? `${completedCount} ${completedCount === 1 ? t.metrics.downloadCompleted : t.metrics.downloadsCompleted}`
                : t.metrics.noDownloadsYet}
            </span>
          </div>

          <div className="metrics-grid">
            {cards.map((card) => (
              <div
                className={`metric-card metric-card--${card.accent}`}
                key={card.label}
              >
                <span className="metric-label">{card.label}</span>
                <strong className="metric-value">{card.value}</strong>
              </div>
            ))}
          </div>
        </div>
      </div>

      {!metrics && (
        <p className="metrics-empty">
          <BarChart3 size={16} /> {t.metrics.empty}
        </p>
      )}

      {confirmReset && (
        <div className="cancel-overlay">
          <section className="cancel-dialog">
            <header>
              <span>{t.metrics.resetModalTitle}</span>
              <button onClick={() => setConfirmReset(false)} aria-label={t.common.close}>
                <X size={16} />
              </button>
            </header>
            <div>
              <i>
                <AlertTriangle size={16} />
              </i>
              <p>
                <strong>{t.metrics.resetModalPrompt}</strong>
                <span>{t.metrics.resetModalDesc}</span>
              </p>
            </div>
            <footer>
              <button disabled={resetting} onClick={() => setConfirmReset(false)}>
                {t.common.cancel}
              </button>
              <button
                className="delete"
                disabled={resetting}
                onClick={() => void handleConfirmReset()}
              >
                <RotateCcw size={15} />
                {t.metrics.reset}
              </button>
            </footer>
          </section>
        </div>
      )}
    </section>
  );
}
