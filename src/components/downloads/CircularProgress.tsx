interface Props {
  value: number;
  size?: number;
  stroke?: number;
  color?: string;
  trackColor?: string;
  className?: string;
}

export function CircularProgress({
  value,
  size = 62,
  stroke = 4,
  color = "var(--ember)",
  trackColor = "var(--line)",
  className,
}: Props) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, value));
  const offset = circumference - (clamped / 100) * circumference;

  const isDefaultEmber = !color || color === "var(--ember)" || color === "var(--st-downloading)";
  const strokeColor = isDefaultEmber ? "url(#circ-progress-gradient)" : color;

  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={`${Math.round(clamped)}% concluído`}
    >
      <defs>
        <linearGradient id="circ-progress-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="var(--ember-stop-1, #06b6d4)" />
          <stop offset="100%" stopColor="var(--ember-stop-2, #22d3ee)" />
        </linearGradient>
      </defs>
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={trackColor}
        strokeWidth={stroke}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={strokeColor}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{
          transition: "stroke-dashoffset 0.35s ease, stroke 0.2s ease",
        }}
        vectorEffect="non-scaling-stroke"
      />
      <text
        x="50%"
        y="50%"
        dominantBaseline="central"
        textAnchor="middle"
        fontSize={size * 0.23}
        fontWeight={700}
        fill="var(--text)"
        style={{ pointerEvents: "none" }}
      >
        {Math.round(clamped)}%
      </text>
    </svg>
  );
}
