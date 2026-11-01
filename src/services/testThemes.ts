import themeManifest from "../../themes/manifest.json";
import { invoke } from "@tauri-apps/api/core";
import type { TestThemeSettings } from "../domain/settings";
export interface ThemeImage { id: string; name: string; mime: string }
const selectors = new Set([".window-frame", ".sidebar", ".download-card", ".download-card:hover", ".download-card.selected", ".titlebar", ".flux-footer", ".flux-header", ".navigation__item", ".navigation__item--active", ".navigation__icon", ".navigation__item--active .navigation__icon", ".counter-badge"]);
const properties = new Set(["color", "background", "background-color", "background-image", "background-position", "background-position-x", "background-position-y", "background-size", "background-repeat", "background-repeat-x", "background-repeat-y", "border-color", "border-top-color", "border-right-color", "border-bottom-color", "border-left-color",
  "border-radius", "border-top-left-radius", "border-top-right-radius", "border-bottom-left-radius", "border-bottom-right-radius",
  "background-attachment", "background-origin", "background-clip", "box-shadow"]);
const scope = 'html.window-type-main[data-test-theme="true"]';
const validId = /^[a-f0-9]{64}$/;
const imageCache = new Map<string, Promise<string>>();
const ownedImageUrls = new Set<string>();
let appliedImageUrls: string[] = [];
function releaseImageUrls() {
  for (const url of appliedImageUrls) { URL.revokeObjectURL(url); ownedImageUrls.delete(url); }
  appliedImageUrls = [];
}
function renderImageUrl(source: string): string {
  const match=/^data:(image\/(?:png|gif));base64,([A-Za-z0-9+/=]+)$/.exec(source);
  if(!match) throw new Error("Imagem inválida / Invalid image");
  const bytes=Uint8Array.from(atob(match[2]),character=>character.charCodeAt(0));
  const url=URL.createObjectURL(new Blob([bytes.buffer],{type:match[1]}));
  ownedImageUrls.add(url);appliedImageUrls.push(url);return url;
}
function trustedImageSource(source: string): boolean {
  return ownedImageUrls.has(source) || /^data:image\/(png|gif);base64,[A-Za-z0-9+/=]+$/.test(source);
}
export function loadThemeImage(id: string): Promise<string> {
  if (id.startsWith("builtin:")) {
    const root=document.documentElement;
    const suffix=root.classList.contains("window-type-main") ? "" :
      root.classList.contains("window-type-confirmation") || (root.classList.contains("window-type-media") && window.innerWidth>600) ? "-medium" : "-compact";
    const entry=themeManifest.find(theme=>theme.id===id.slice(8)+suffix);
    if(!entry) return Promise.reject(new Error("Tema desconhecido / Unknown theme"));
    return loadThemeImage(entry.sha256);
  }
  if (!validId.test(id)) return Promise.reject(new Error("Identificação de imagem inválida / Invalid image ID"));
  if (!imageCache.has(id)) {
    const pending = invoke<string>("read_theme_image", {id}).then(source => new Promise<string>((resolve,reject) => {
      if (!/^data:image\/(png|gif);base64,[A-Za-z0-9+/=]+$/.test(source)) { reject(new Error("Formato de imagem inválido / Invalid image format")); return; }
      const image = new Image();
      image.onload = () => { if (!image.naturalWidth || !image.naturalHeight) reject(new Error("Imagem inválida / Invalid image")); else resolve(source); };
      image.onerror = () => reject(new Error("Imagem corrompida / Corrupt image"));
      image.src = source;
    })).catch(error => {imageCache.delete(id);throw error;});
    if (imageCache.size >= 8) imageCache.delete(imageCache.keys().next().value!);
    imageCache.set(id,pending);
  }
  return imageCache.get(id)!;
}
export function themeImageIds(css: string): string[] {
  return [...new Set([...css.matchAll(/theme:([a-f0-9]{64})/g)].map(match=>match[1]))];
}
/** In production Tauri authorizes inline styles with a per-document nonce.
 * Reuse that nonce; never weaken CSP or authorize arbitrary external CSS. */
function createThemeStyle(): HTMLStyleElement {
  const style=document.createElement("style");
  const trusted=document.querySelector<HTMLStyleElement|HTMLLinkElement>("style[nonce],link[nonce]");
  if(trusted?.nonce) style.nonce=trusted.nonce;
  return style;
}
/** Restricted visual CSS. No global selectors, structural rules, external URLs or at-rules. */
export function compileThemeCss(css: string, images: Record<string,string>): string {
  if (css.length > 20000 || /@|\\|<|>/u.test(css)) throw new Error("CSS não permitido: regras externas, escapes e @regras estão bloqueados / Unsupported CSS");
  const style = createThemeStyle();
  // An inactive stylesheet supplies the browser parser without applying user rules.
  style.media = "not all";
  style.textContent = css;
  document.head.append(style);
  let rules: CSSRule[];
  try { rules=Array.from(style.sheet?.cssRules ?? []); } finally { style.remove(); }
  if (css.trim() && !rules.length) throw new Error("CSS inválido / Invalid CSS");
  const result: string[] = [];
  for (const rule of Array.from(rules)) {
    if (!("selectorText" in rule) || !("style" in rule)) throw new Error("Use apenas regras de estilo simples / Use simple style rules only");
    const item = rule as CSSStyleRule;
    const targets = item.selectorText.split(",").map(s=>s.trim());
    if (targets.some(s=>!selectors.has(s))) throw new Error(`Seletor não permitido / Unsupported selector: ${item.selectorText}`);
    const declarations: string[] = [];
    for (let i=0;i<item.style.length;i++) {
      const property = item.style[i];
      if (!properties.has(property)) throw new Error(`Propriedade não permitida / Unsupported property: ${property}`);
      let value = item.style.getPropertyValue(property);
      if (/expression|javascript|https?:|file:|data:|asset:|image-set|cross-fade|var\(/i.test(value)) {
        // Existing app color tokens are the only allowed variables.
        value = value.replace(/var\(--(?:ember(?:-solid|-soft)?|text(?:-2)?|surface(?:-2)?|line|bg)\)/g, token => token.replace("var(","TOKEN("));
        if (/expression|javascript|https?:|file:|data:|asset:|image-set|cross-fade|var\(/i.test(value)) throw new Error("Use cores locais e imagens theme:ID / Use local colors and theme:ID images");
        value=value.replace(/TOKEN\(/g,"var(");
      }
      value = value.replace(/url\(\s*["']?theme:([a-f0-9]{64})["']?\s*\)/g, (_,id:string) => {
        const source=images[id];
        if (!source || !trustedImageSource(source)) throw new Error("Importe a imagem referenciada / Import the referenced image");
        return `LOCALIMAGE(${id})`;
      });
      if (/url\(/i.test(value)) throw new Error("Somente imagens importadas são permitidas / Only imported images are allowed");
      value = value.replace(/LOCALIMAGE\(([a-f0-9]{64})\)/g,(_,id:string)=>`url("${images[id]}")`);
      declarations.push(`${property}:${value} !important`);
    }
    result.push(`${targets.map(s=>`${scope} ${s}`).join(",")}{${declarations.join(";")}}`);
  }
  return result.join("\n");
}
let revision = 0;
let activeKey = "";
export async function applyTestTheme(settings: TestThemeSettings, animations = true): Promise<void> {
  const isMain=document.documentElement.classList.contains("window-type-main");
  if (!["window-type-main","window-type-media","window-type-confirmation","window-type-live","window-type-integration","window-type-debug"].some(type=>document.documentElement.classList.contains(type))) return;
  const animate = animations && !(typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches);
  const key = JSON.stringify([settings,animate]);
  if (key === activeKey) return;
  activeKey = key;
  const current = ++revision;
  const root = document.documentElement;
  const clearCurrentTheme = () => {
  root.removeAttribute("data-test-theme");
  root.removeAttribute("data-test-preset");
  document.getElementById("sf-test-theme-css")?.remove();
  root.style.removeProperty("--test-theme-image");
  releaseImageUrls();
  };
  if (!settings.enabled) { clearCurrentTheme(); return; }
  try {
    const ids = [...new Set([...(isMain ? themeImageIds(settings.css) : []), ...(settings.imageId ? [settings.imageId] : [])])];
    if (ids.length > 8) throw new Error("Use até 8 imagens por tema / Use up to 8 images per theme");
    const images: Record<string,string> = Object.fromEntries(await Promise.all(ids.map(async id=>{
      let source = await loadThemeImage(id);
      if (!animate && source.startsWith("data:image/gif;")) {
        source = await new Promise<string>((resolve,reject)=>{
          const image=new Image();image.onload=()=>{const canvas=document.createElement("canvas");canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;const context=canvas.getContext("2d");if(!context){reject(new Error("Não foi possível preparar a imagem estática / Could not prepare static image"));return;}context.drawImage(image,0,0);resolve(canvas.toDataURL("image/png"));};image.onerror=()=>reject(new Error("GIF inválido / Invalid GIF"));image.src=source;
        });
      }
      return [id,source] as const;
    })));
    if (Object.values(images).reduce((sum,source)=>sum+source.length,0) > 32 * 1024 * 1024) throw new Error("Imagens do tema acima do limite total / Theme images exceed the total limit");
    if (revision !== current) return;
    // Commit synchronously after loading, preserving the current theme while awaiting assets.
    clearCurrentTheme();
    // Large data URLs exceed Chromium's CSS custom-property size limit.
    // Keep rendered CSS short and revoke the owned blob URLs on reset/change.
    const renderedImages=Object.fromEntries(Object.entries(images).map(([id,source])=>[id,renderImageUrl(source)]));
    const css = isMain ? compileThemeCss(settings.css,renderedImages) : "";
    root.style.setProperty("--test-theme-image",settings.imageId ? `url("${renderedImages[settings.imageId]}")` : "none");
    root.style.setProperty("--test-theme-darkness",`${Math.min(85,Math.max(30,settings.darkness))/100}`);
    root.style.setProperty("--test-theme-panel",`${Math.min(100,Math.max(60,settings.panelOpacity))}%`);
    root.style.setProperty("--test-theme-position",["left","right"].includes(settings.position) ? settings.position : "center");
    const style=createThemeStyle();style.id="sf-test-theme-css";style.textContent=css;document.head.append(style);
    root.dataset.testTheme="true";
    if(settings.preset !== "custom") root.dataset.testPreset=settings.preset;
  } catch(error) { if(revision===current){clearCurrentTheme();activeKey="";console.error("[THEME]",error);} }
}
export async function validateTestTheme(css: string, backgroundId: string | null = null): Promise<void> {
  const ids=[...new Set([...themeImageIds(css), ...(backgroundId ? [backgroundId] : [])])];
  if(ids.length>8) throw new Error("Use até 8 imagens por tema / Use up to 8 images per theme");
  const images: Record<string,string>=Object.fromEntries(await Promise.all(ids.map(async id=>[id,await loadThemeImage(id)] as const)));
  if (Object.values(images).reduce((sum,source)=>sum+source.length,0) > 32 * 1024 * 1024) throw new Error("Imagens do tema acima do limite total / Theme images exceed the total limit");
  compileThemeCss(css,images);
}
