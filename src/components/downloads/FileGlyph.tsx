import { useId } from "react";
import type { FileIconProps } from "./FileIcon";

/** Shared vector silhouette; color and symbol identify the file family. */
export function FileGlyph(props: FileIconProps) {
  const id = useId().replace(/:/g, "");
  const label = (props.label || "FILE").toUpperCase();
  const torrent = label === "TORRENT";
  const audio = /^(MP3|WAV|FLAC|OGG|AAC|M4A|WMA|OPUS)$/.test(label);
  const video = props.isMedia && !audio;
  const app = /^(EXE|MSI|APK)$/.test(label);
  const top = torrent ? "#20e4b0" : video ? "#62a6ff" : props.color1 || "#a0aec0";
  const bottom = torrent ? "#008565" : video ? "#244bc3" : props.color2 || "#475569";
  const shape = "M20 4H91L124 37V133Q124 148 109 148H20Q5 148 5 133V19Q5 4 20 4Z";
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={props.width ?? 48} height={props.height ?? 56}
      viewBox="0 0 130 152" className={props.className} style={props.style} role="img" aria-label={`Arquivo ${label}`}>
      <defs>
        <linearGradient id={`${id}body`} x2=".8" y2="1">
          <stop stopColor={top}/><stop offset="1" stopColor={bottom}/>
        </linearGradient>
        <linearGradient id={`${id}fold`} x2="1" y2="1">
          <stop stopColor="#fff" stopOpacity=".94"/><stop offset="1" stopColor={top}/>
        </linearGradient>
        <linearGradient id={`${id}edge`} x2=".7" y2="1">
          <stop stopColor="#fff" stopOpacity=".65"/><stop offset=".5" stopColor="#fff" stopOpacity=".08"/><stop offset="1" stopColor={top} stopOpacity=".65"/>
        </linearGradient>
        <clipPath id={`${id}clip`}><path d={shape}/></clipPath>
      </defs>
      <path d={shape} fill={`url(#${id}body)`}/>
      <g clipPath={`url(#${id}clip)`}>
        <path d="M4 108H126V151H4Z" fill="#071b2a" opacity=".48"/>
        <path d="M7 108H123" stroke="#fff" strokeOpacity=".16"/>
        <path d="M91 5V29Q91 42 104 42H126" fill="none" stroke="#071b2a" strokeWidth="4" opacity=".14"/>
      </g>
      <path d="M91 4V26Q91 37 103 37H124Z" fill={`url(#${id}fold)`}/>
      <path d={shape} fill="none" stroke={`url(#${id}edge)`} strokeWidth="2"/>
      {torrent ? <g>
        <circle cx="64" cy="72" r="29" fill="#003d33" opacity=".86"/>
        <g fill="none" stroke={top} strokeWidth="5">
          <path d="M64 49a23 23 0 0 0 0 46"/><path d="M72 57a17 17 0 1 0 0 32"/><path d="M78 66a11 11 0 1 0 0 17"/>
        </g>
      </g> : props.isArchive ? <g>
        <path d="M55 5H70V75H55Z" fill="#403019" opacity=".8"/>
        {Array.from({length: 9}, (_, i) => <path key={i} d={`M${i % 2 ? 62 : 56} ${10 + i * 6}h7v3h-7Z`} fill="#fff2ba"/>)}
        <rect x="56" y="63" width="14" height="28" rx="6" fill="#f8e9b1" stroke="#514628" strokeWidth="2"/>
        <rect x="60" y="76" width="6" height="10" rx="3" fill="#514628"/>
      </g> : video ? <path d="M49 51Q46 49 46 54V89Q46 94 50 91L81 74Q85 72 81 70Z" fill={`url(#${id}fold)`} stroke="#fff" strokeOpacity=".65"/>
      : audio ? <g fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="round"><path d="M70 51V83M70 51l17 5"/><ellipse cx="60" cy="85" rx="10" ry="7"/></g>
      : app ? <g fill="#fff" opacity=".9">{[0,1,2,3].map(i => <rect key={i} x={43 + i % 2 * 23} y={52 + Math.floor(i / 2) * 23} width="18" height="18" rx="3"/>)}</g>
      : <g fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" opacity=".88"><path d="M44 57H80M44 70H80M44 83H68"/></g>}
      <text x="64.5" y="135" textAnchor="middle" fill="#fff" fontFamily="Segoe UI, Arial, sans-serif"
        fontWeight="700" fontSize={label.length > 6 ? 17 : label.length > 4 ? 20 : 25}
        textLength={label.length > 7 ? 102 : undefined} lengthAdjust="spacingAndGlyphs">{label}</text>
    </svg>
  );
}
