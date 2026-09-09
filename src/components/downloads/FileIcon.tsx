import React from "react";
import { FileGlyph } from "./FileGlyph";

export type FileTypeInfo = {
  label: string;
  color1: string;
  color2: string;
  fold1: string;
  fold2: string;
  textColor?: string;
  isMedia?: boolean;
  isArchive?: boolean;
};

export const FILE_TYPES: Record<string, FileTypeInfo> = {
  // --- Compactados (SVG Zipper Archive com zíper e badge em tamanho idêntico aos outros ícones) ---
  zip:  { label: "ZIP",  color1: "#ffb400", color2: "#ff7a00", fold1: "#ffd76a", fold2: "#ff9a1f", textColor: "#ffffff", isArchive: true },
  rar:  { label: "RAR",  color1: "#ffb400", color2: "#ff7a00", fold1: "#ffd76a", fold2: "#ff9a1f", textColor: "#ffffff", isArchive: true },
  "7z": { label: "7Z",   color1: "#ffb400", color2: "#ff7a00", fold1: "#ffd76a", fold2: "#ff9a1f", textColor: "#ffffff", isArchive: true },
  tar:  { label: "TAR",  color1: "#ffb400", color2: "#ff7a00", fold1: "#ffd76a", fold2: "#ff9a1f", textColor: "#ffffff", isArchive: true },
  gz:   { label: "GZ",   color1: "#ffb400", color2: "#ff7a00", fold1: "#ffd76a", fold2: "#ff9a1f", textColor: "#ffffff", isArchive: true },
  tgz:  { label: "TGZ",  color1: "#ffb400", color2: "#ff7a00", fold1: "#ffd76a", fold2: "#ff9a1f", textColor: "#ffffff", isArchive: true },
  bz2:  { label: "BZ2",  color1: "#ffb400", color2: "#ff7a00", fold1: "#ffd76a", fold2: "#ff9a1f", textColor: "#ffffff", isArchive: true },
  xz:   { label: "XZ",   color1: "#ffb400", color2: "#ff7a00", fold1: "#ffd76a", fold2: "#ff9a1f", textColor: "#ffffff", isArchive: true },
  zipx: { label: "ZIPX", color1: "#ffb400", color2: "#ff7a00", fold1: "#ffd76a", fold2: "#ff9a1f", textColor: "#ffffff", isArchive: true },

  // --- Mídia (Vídeos e Áudios -> SVG Media Player) ---
  mp4:  { label: "MP4",  color1: "#ff4fa8", color2: "#ff0f8a", fold1: "#f8dced", fold2: "#e9bfd8", textColor: "#ffffff", isMedia: true },
  mkv:  { label: "MKV",  color1: "#ff4fa8", color2: "#ff0f8a", fold1: "#f8dced", fold2: "#e9bfd8", textColor: "#ffffff", isMedia: true },
  avi:  { label: "AVI",  color1: "#ff4fa8", color2: "#ff0f8a", fold1: "#f8dced", fold2: "#e9bfd8", textColor: "#ffffff", isMedia: true },
  mov:  { label: "MOV",  color1: "#ff4fa8", color2: "#ff0f8a", fold1: "#f8dced", fold2: "#e9bfd8", textColor: "#ffffff", isMedia: true },
  webm: { label: "WEBM", color1: "#ff4fa8", color2: "#ff0f8a", fold1: "#f8dced", fold2: "#e9bfd8", textColor: "#ffffff", isMedia: true },
  flv:  { label: "FLV",  color1: "#ff4fa8", color2: "#ff0f8a", fold1: "#f8dced", fold2: "#e9bfd8", textColor: "#ffffff", isMedia: true },
  wmv:  { label: "WMV",  color1: "#ff4fa8", color2: "#ff0f8a", fold1: "#f8dced", fold2: "#e9bfd8", textColor: "#ffffff", isMedia: true },
  m4v:  { label: "M4V",  color1: "#ff4fa8", color2: "#ff0f8a", fold1: "#f8dced", fold2: "#e9bfd8", textColor: "#ffffff", isMedia: true },
  "3gp":{ label: "3GP",  color1: "#ff4fa8", color2: "#ff0f8a", fold1: "#f8dced", fold2: "#e9bfd8", textColor: "#ffffff", isMedia: true },

  mp3:  { label: "MP3",  color1: "#C084FC", color2: "#7E22CE", fold1: "#F3E8FF", fold2: "#E9D5FF", textColor: "#ffffff", isMedia: true },
  wav:  { label: "WAV",  color1: "#C084FC", color2: "#7E22CE", fold1: "#F3E8FF", fold2: "#E9D5FF", textColor: "#ffffff", isMedia: true },
  flac: { label: "FLAC", color1: "#C084FC", color2: "#7E22CE", fold1: "#F3E8FF", fold2: "#E9D5FF", textColor: "#ffffff", isMedia: true },
  ogg:  { label: "OGG",  color1: "#C084FC", color2: "#7E22CE", fold1: "#F3E8FF", fold2: "#E9D5FF", textColor: "#ffffff", isMedia: true },
  aac:  { label: "AAC",  color1: "#C084FC", color2: "#7E22CE", fold1: "#F3E8FF", fold2: "#E9D5FF", textColor: "#ffffff", isMedia: true },
  m4a:  { label: "M4A",  color1: "#C084FC", color2: "#7E22CE", fold1: "#F3E8FF", fold2: "#E9D5FF", textColor: "#ffffff", isMedia: true },
  wma:  { label: "WMA",  color1: "#C084FC", color2: "#7E22CE", fold1: "#F3E8FF", fold2: "#E9D5FF", textColor: "#ffffff", isMedia: true },
  opus: { label: "OPUS", color1: "#C084FC", color2: "#7E22CE", fold1: "#F3E8FF", fold2: "#E9D5FF", textColor: "#ffffff", isMedia: true },

  // --- Documentos Genéricos & Outros (SVG Padrão Gradiente) ---
  pdf:  { label: "PDF",  color1: "#FF5252", color2: "#D32F2F", fold1: "#FFCDD2", fold2: "#EF9A9A", textColor: "#ffffff" },
  
  png:  { label: "PNG",  color1: "#34D399", color2: "#059669", fold1: "#D1FAE5", fold2: "#A7F3D0", textColor: "#1a1f2b" },
  jpg:  { label: "JPG",  color1: "#34D399", color2: "#059669", fold1: "#D1FAE5", fold2: "#A7F3D0", textColor: "#1a1f2b" },
  jpeg: { label: "JPG",  color1: "#34D399", color2: "#059669", fold1: "#D1FAE5", fold2: "#A7F3D0", textColor: "#1a1f2b" },
  gif:  { label: "GIF",  color1: "#34D399", color2: "#059669", fold1: "#D1FAE5", fold2: "#A7F3D0", textColor: "#1a1f2b" },
  webp: { label: "WEBP", color1: "#34D399", color2: "#059669", fold1: "#D1FAE5", fold2: "#A7F3D0", textColor: "#1a1f2b" },
  
  exe:  { label: "EXE",  color1: "#A3E635", color2: "#65A30D", fold1: "#ECFCCB", fold2: "#D9F99D", textColor: "#1a1f2b" },
  msi:  { label: "MSI",  color1: "#A3E635", color2: "#65A30D", fold1: "#ECFCCB", fold2: "#D9F99D", textColor: "#1a1f2b" },
  apk:  { label: "APK",  color1: "#A3E635", color2: "#65A30D", fold1: "#ECFCCB", fold2: "#D9F99D", textColor: "#1a1f2b" },
  
  txt:  { label: "TXT",  color1: "#38BDF8", color2: "#0284C7", fold1: "#E0F2FE", fold2: "#BAE6FD", textColor: "#1a1f2b" },
  doc:  { label: "DOC",  color1: "#38BDF8", color2: "#0284C7", fold1: "#E0F2FE", fold2: "#BAE6FD", textColor: "#1a1f2b" },
  docx: { label: "DOCX", color1: "#38BDF8", color2: "#0284C7", fold1: "#E0F2FE", fold2: "#BAE6FD", textColor: "#1a1f2b" },
  xls:  { label: "XLS",  color1: "#34D399", color2: "#059669", fold1: "#D1FAE5", fold2: "#A7F3D0", textColor: "#1a1f2b" },
  xlsx: { label: "XLSX", color1: "#34D399", color2: "#059669", fold1: "#D1FAE5", fold2: "#A7F3D0", textColor: "#1a1f2b" },
  
  iso:  { label: "ISO",  color1: "#94A3B8", color2: "#475569", fold1: "#F1F5F9", fold2: "#E2E8F0", textColor: "#ffffff" },
  bin:  { label: "BIN",  color1: "#94A3B8", color2: "#475569", fold1: "#F1F5F9", fold2: "#E2E8F0", textColor: "#ffffff" },
  img:  { label: "IMG",  color1: "#94A3B8", color2: "#475569", fold1: "#F1F5F9", fold2: "#E2E8F0", textColor: "#ffffff" },
  
  torrent: { label: "TORRENT", color1: "#00E6A5", color2: "#00B884", fold1: "#D1FAE5", fold2: "#A7F3D0", textColor: "#1a1f2b" },
};

export const DEFAULT_FILE_TYPE: FileTypeInfo = {
  label: "FILE",
  color1: "#A1A1AA",
  color2: "#52525B",
  fold1: "#F4F4F5",
  fold2: "#E4E4E7",
  textColor: "#ffffff",
  isMedia: false,
  isArchive: false,
};

export function getFileTypeInfo(filenameOrExt: string | null | undefined): FileTypeInfo {
  if (!filenameOrExt) {
    return DEFAULT_FILE_TYPE;
  }

  let ext = String(filenameOrExt).trim().toLowerCase();
  if (ext.includes(".")) {
    const parts = ext.split(".");
    ext = parts.pop() || "";
  }

  if (ext && FILE_TYPES[ext]) {
    return FILE_TYPES[ext];
  }

  if (ext && ext.length <= 6 && /^[a-z0-9]+$/i.test(ext)) {
    return {
      label: ext.toUpperCase(),
      color1: "#A1A1AA",
      color2: "#52525B",
      fold1: "#F4F4F5",
      fold2: "#E4E4E7",
      textColor: "#ffffff",
      isMedia: false,
      isArchive: false,
    };
  }

  return DEFAULT_FILE_TYPE;
}

export function getLabelFontSize(label: string | null | undefined, mode: "archive" | "media" | "document" = "document"): number {
  const textStr = label ? String(label) : "FILE";
  const len = textStr.length;
  if (mode === "archive" || mode === "media") {
    if (len <= 4) return 215; // Mesmo tamanho visual dos outros ícones!
    if (len === 5) return 175;
    return 140;
  }
  if (len <= 4) return 235;
  if (len === 5) return 180;
  return 145;
}

export interface FileIconProps {
  label?: string;
  color1?: string;
  color2?: string;
  fold1?: string;
  fold2?: string;
  textColor?: string;
  isMedia?: boolean;
  isArchive?: boolean;
  extension?: string | null;
  width?: number | string;
  height?: number | string;
  className?: string;
  style?: React.CSSProperties;
}

export function FileIcon(props: FileIconProps) {
  const info = getFileTypeInfo(props.extension || props.label);
  return <FileGlyph {...info} {...props} label={props.label || info.label} />;
}

export interface FileIconFromNameProps {
  filename: string;
  width?: number | string;
  height?: number | string;
  className?: string;
  style?: React.CSSProperties;
}

export function FileIconFromName({
  filename,
  width,
  height,
  className,
  style,
}: FileIconFromNameProps) {
  const info = getFileTypeInfo(filename);
  return (
    <FileIcon
      label={info.label}
      color1={info.color1}
      color2={info.color2}
      fold1={info.fold1}
      fold2={info.fold2}
      textColor={info.textColor}
      isMedia={info.isMedia}
      isArchive={info.isArchive}
      width={width}
      height={height}
      className={className}
      style={style}
    />
  );
}
