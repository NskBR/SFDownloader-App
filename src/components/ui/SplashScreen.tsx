import React, { useEffect } from "react";
import { useTranslation } from "../../i18n";

interface SplashScreenProps {
  text?: string;
  fade?: boolean;
  onReady?: () => void;
}

export function SplashScreen({ text, fade = false, onReady }: SplashScreenProps) {
  const { t } = useTranslation();
  const displayText = text ?? t.common.loading;

  useEffect(() => {
    if (!onReady) return;
    let secondFrame = 0;
    const firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(onReady);
    });
    return () => {
      cancelAnimationFrame(firstFrame);
      cancelAnimationFrame(secondFrame);
    };
  }, [onReady]);

  return (
    <div className={`sf-splash-screen ${fade ? "sf-splash-fade" : ""}`}>
      <div className="sf-splash-content">
        {/* Coffee Cup with Download Icon and Steam */}
        <div className="sf-splash-cup-wrap">
          <svg
            className="sf-splash-cup-svg"
            viewBox="0 0 160 140"
            width="140"
            height="122"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            {/* Base Shadow */}
            <ellipse cx="76" cy="128" rx="46" ry="7" fill="#000000" fillOpacity="0.45" />

            {/* Steam Wisps */}
            <g className="sf-splash-steam">
              <path
                className="sf-steam-1"
                d="M68 40 C64 32, 74 24, 70 14 C67 7, 72 3, 73 0"
                stroke="#94a3b8"
                strokeWidth="2.5"
                strokeLinecap="round"
                fill="none"
                opacity="0.4"
              />
              <path
                className="sf-steam-2"
                d="M84 40 C80 30, 90 22, 86 12 C83 5, 88 2, 89 0"
                stroke="#94a3b8"
                strokeWidth="2.5"
                strokeLinecap="round"
                fill="none"
                opacity="0.4"
              />
            </g>

            {/* Cup Handle */}
            <path
              d="M112 55 C132 55, 136 92, 114 97"
              stroke="#5b6b84"
              strokeWidth="7"
              strokeLinecap="round"
              fill="none"
            />
            <path
              d="M112 55 C132 55, 136 92, 114 97"
              stroke="#34435a"
              strokeWidth="4"
              strokeLinecap="round"
              fill="none"
            />

            {/* Cup Outer Body */}
            <path
              d="M34 48 C34 98, 52 120, 76 120 C100 120, 118 98, 118 48 Z"
              fill="#273449"
              stroke="#7c8ba5"
              strokeWidth="2"
            />

            {/* Cup Rim Opening */}
            <ellipse cx="76" cy="48" rx="42" ry="12" fill="#111827" stroke="#94a3b8" strokeWidth="2" />

            {/* Coffee Liquid Surface */}
            <ellipse cx="76" cy="53" rx="36" ry="9" fill="#f59e0b" />

            {/* Download Arrow Icon inside Coffee Cup */}
            <g className="sf-splash-arrow" transform="translate(76, 85)">
              {/* Arrow Stem */}
              <line x1="0" y1="-14" x2="0" y2="4" stroke="#f59e0b" strokeWidth="2.8" strokeLinecap="round" />
              {/* Arrow Head */}
              <polyline points="-6,-1 0,5 6,-1" stroke="#f59e0b" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
              {/* Tray Bottom Line */}
              <line x1="-9" y1="11" x2="9" y2="11" stroke="#f59e0b" strokeWidth="2.8" strokeLinecap="round" />
            </g>
          </svg>
        </div>

        {/* Loading Text */}
        <p className="sf-splash-text">{displayText}</p>

        {/* 3 Animated Dots */}
        <div className="sf-splash-dots">
          <span className="sf-splash-dot sf-dot-1" />
          <span className="sf-splash-dot sf-dot-2" />
          <span className="sf-splash-dot sf-dot-3" />
        </div>
      </div>
    </div>
  );
}
