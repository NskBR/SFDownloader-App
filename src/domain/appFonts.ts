import { invoke } from "@tauri-apps/api/core";

export const appFonts = [
  { id: "default", label: "", family: "" },
  { id: "segoe", label: "Segoe UI", family: '"Segoe UI Variable Text", "Segoe UI", sans-serif' },
  { id: "arial", label: "Arial", family: 'Arial, "Segoe UI", sans-serif' },
  { id: "tahoma", label: "Tahoma", family: 'Tahoma, "Segoe UI", sans-serif' },
  { id: "verdana", label: "Verdana", family: 'Verdana, "Segoe UI", sans-serif' },
  { id: "trebuchet", label: "Trebuchet MS", family: '"Trebuchet MS", "Segoe UI", sans-serif' },
  { id: "georgia", label: "Georgia", family: 'Georgia, "Times New Roman", serif' },
] as const;

export type AppFont = typeof appFonts[number]["id"] | `custom:${string}`;
export const appFontIds = appFonts.map(font => font.id);
export interface ImportedFont { id: string; name: string }
const loaded = new Map<string, Promise<FontFace>>();
let appliedRevision = 0;

export function loadImportedFont(id: string): Promise<FontFace> {
  if (!/^[a-f0-9]{64}$/.test(id)) return Promise.reject(new Error("Fonte importada inválida."));
  const cached = loaded.get(id);
  if (cached) return cached;
  const loading = invoke<string>("read_custom_font", { id }).then(async source => {
    const face = new FontFace(`SFImported-${id}`, `url("${source}")`);
    await face.load();
    document.fonts.add(face);
    return face;
  });
  loaded.set(id, loading);
  void loading.catch(() => { loaded.delete(id); });
  return loading;
}

export function applyFontSettings(font: AppFont): void {
  const revision = ++appliedRevision;
  if (font?.startsWith("custom:")) {
    const id = font.slice(7);
    void loadImportedFont(id).then(() => {
      if (revision === appliedRevision) setFamily(`"SFImported-${id}", "Segoe UI", sans-serif`);
    }).catch(error => {
      if (revision === appliedRevision) setFamily("");
      console.warn("Não foi possível carregar a fonte importada.", error);
    });
    return;
  }
  const family = appFonts.find(option => option.id === font)?.family;
  setFamily(family);
}

function setFamily(family?: string) {
  for (const property of ["--font", "--window-font"]) {
    if (family) document.documentElement.style.setProperty(property, family);
    else document.documentElement.style.removeProperty(property);
  }
}
