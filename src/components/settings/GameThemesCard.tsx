import {themeWallpapers,selectedWallpaper} from "../../domain/themeWallpapers";
import {invoke} from "@tauri-apps/api/core";
import {useState,useRef,useEffect} from "react";
import {Gamepad2,Check,RotateCcw,Trash2,ChevronDown,ChevronUp,ChevronLeft,ChevronRight} from "../icons";
import type {GameTheme} from "../../domain/settings";
import {createGameTheme,gameThemePresets} from "../../domain/testThemePresets";
import {validateTestTheme,invalidateGameThemeImages} from "../../services/testThemes";
import {useTranslation} from "../../i18n";
import {cachedThemeCatalog,loadThemeCatalog,markThemeDownloaded} from "../../services/themeCatalog";
interface Props {selected:GameTheme;wallpapers?:Record<string,string>;onSelect:(theme:GameTheme,wallpaperId?:string)=>void}
export function GameThemesCard({selected,onSelect,wallpapers={}}:Props){
 const {language}=useTranslation();const text=(pt:string,en:string)=>language==="pt-BR"?pt:en;
 const [busy,setBusy]=useState<GameTheme|null>(null);const [error,setError]=useState<string|null>(null);
 const [installed,setInstalled]=useState<string[]>(()=>cachedThemeCatalog()??[]);
 const [cacheChecked,setCacheChecked]=useState(()=>cachedThemeCatalog()!==null);
 const [expanded,setExpanded]=useState(false);
 const [visibleCount,setVisibleCount]=useState(4);
 const [choices,setChoices]=useState<Record<string,string>>({});
 const wallpaperFor=(id:Exclude<GameTheme,"none">,preview="")=>selectedWallpaper(id,choices[id]??wallpapers[id],preview);
 useEffect(()=>{
  if(!expanded){setVisibleCount(4);return;}
  // Spread first paint/texture uploads over small batches, rather than one burst.
  let count=4;let timer:number;
  const reveal=()=>{count=Math.min(gameThemePresets.length,count+2);setVisibleCount(count);if(count<gameThemePresets.length)timer=window.setTimeout(reveal,32);};
  timer=window.setTimeout(reveal,16);
  return()=>window.clearTimeout(timer);
 },[expanded]);
 const toggleCatalog=()=>setExpanded(value=>!value);
 useEffect(()=>{let disposed=false;void loadThemeCatalog().then(value=>{if(!disposed)setInstalled(value);}).catch(()=>{}).finally(()=>{if(!disposed)setCacheChecked(true);});return()=>{disposed=true;};},[]);
 const [cooldown,setCooldown]=useState(0);const locked=useRef(false);
 useEffect(()=>{if(!cooldown)return;const timer=window.setTimeout(()=>{setCooldown(value=>value-1);if(cooldown===1)locked.current=false;},1000);return()=>window.clearTimeout(timer);},[cooldown]);
 const apply=async(id:GameTheme,requestedWallpaper?:string)=>{
  if(locked.current || id==="none" && id===selected)return;
  locked.current=true;setBusy(id);setError(null);
  try{
   if(id!=="none"){
    const wallpaper=selectedWallpaper(id,requestedWallpaper??wallpaperFor(id).id);
    await invoke("download_game_theme",{id:wallpaper.id});invalidateGameThemeImages(wallpaper.id);
    const theme=createGameTheme(id,wallpaper.id);await validateTestTheme(theme.css,theme.imageId);
    markThemeDownloaded(wallpaper.id,true);setInstalled(current=>[...new Set([...current,wallpaper.id])]);
    if(themeWallpapers(id).length>1)onSelect(id,wallpaper.id);else onSelect(id);
   }else onSelect(id);
   setCooldown(1);
  }
  catch(cause){setError(String(cause));locked.current=false;}finally{setBusy(null);}
 };
 const remove=async(id:Exclude<GameTheme,"none">)=>{
  if(locked.current)return;
  locked.current=true;setBusy(id);setError(null);
  try{
   const wallpaper=wallpaperFor(id);
   await invoke("delete_game_theme",{id:wallpaper.id});invalidateGameThemeImages(wallpaper.id);
   markThemeDownloaded(wallpaper.id,false);
   setInstalled(current=>current.filter(value=>value!==wallpaper.id));
   if(selected===id)onSelect("none");
  }catch(cause){setError(String(cause));}
  finally{locked.current=false;setBusy(null);}
 };
 const cycle=(id:Exclude<GameTheme,"none">,direction:number)=>{
  if(locked.current)return;
  const variants=themeWallpapers(id);const current=variants.findIndex(item=>item.id===wallpaperFor(id).id);
  const next=variants[(current+direction+variants.length)%variants.length];
  setChoices(value=>({...value,[id]:next.id}));
  if(selected===id)void apply(id,next.id);
 };
 return <section className="cfg-card game-themes-card">
  <div className="cfg-card-header game-themes-header"><div className="cfg-card-icon-box"><Gamepad2 size={18}/></div><div><h3 className="cfg-card-title">{text("Temas personalizados","Custom themes")}</h3><p className="cfg-card-subtitle">{cooldown>0?<span role="status">{text("Aguarde 1s para trocar o tema.","Wait 1s before switching themes.")}</span>:text("Baixe uma vez e aplique. Disponível offline após baixar.","Download once and apply. Available offline after downloading.")}</p></div>{selected!=="none"&&<button type="button" className="cfg-btn-import-font" disabled={busy!==null||cooldown>0} onClick={()=>void apply("none")}><RotateCcw size={14}/>{text("Desativar tema personalizado","Disable custom theme")}</button>}</div>
  <div className="game-themes-grid" id="game-themes-list" aria-busy={expanded&&visibleCount<gameThemePresets.length}>{gameThemePresets.map((theme,index)=>{const wallpaper=wallpaperFor(theme.id,theme.image);const variants=themeWallpapers(theme.id,theme.image);return <div className="game-theme-entry" key={theme.id} hidden={index>=(expanded?visibleCount:4)}><button type="button" className={`game-theme-tile ${selected===theme.id?"is-selected":""}`}
   aria-label={`${text("Aplicar","Apply")} ${theme.id==="cs2"?"CS2":theme.name}`} aria-pressed={selected===theme.id} disabled={busy!==null||cooldown>0}
   title={language==="pt-BR"?theme.pt:theme.en} onClick={()=>void apply(theme.id)}>
   <span className="game-theme-preview"><img src={wallpaper.image} alt="" draggable={false} loading="lazy" decoding="async" width={360} height={204}/>{selected===theme.id&&<span className="game-theme-check"><Check size={13}/></span>}</span>
   <strong>{theme.name}</strong><span className="game-theme-state">{busy===theme.id?installed.includes(wallpaper.id)?text("Aplicando…","Applying…"):text("Baixando…","Downloading…"):!cacheChecked?text("Verificando…","Checking…"):installed.includes(wallpaper.id)?selected===theme.id?text("Baixado · Atual","Downloaded · Current"):text("Baixado · Aplicar","Downloaded · Apply"):text("Não baixado · Clique para baixar","Not downloaded · Click to download")}</span>
  </button>{installed.includes(wallpaper.id)&&<button type="button" className="game-theme-delete" aria-label={`${text("Apagar tema","Delete theme")} ${theme.name}`} title={text("Apagar tema baixado","Delete downloaded theme")} disabled={busy!==null||cooldown>0} onClick={()=>void remove(theme.id)}><Trash2 size={13}/></button>}{variants.length>1&&<div className="theme-wallpaper-controls"><button type="button" aria-label={`${text("Wallpaper anterior","Previous wallpaper")} ${theme.name}`} disabled={busy!==null||cooldown>0} onClick={()=>cycle(theme.id,-1)}><ChevronLeft size={15}/></button><span>{variants.findIndex(item=>item.id===wallpaper.id)+1}/{variants.length}</span><button type="button" aria-label={`${text("Próximo wallpaper","Next wallpaper")} ${theme.name}`} disabled={busy!==null||cooldown>0} onClick={()=>cycle(theme.id,1)}><ChevronRight size={15}/></button></div>}</div>})}</div>
  <button type="button" className="game-themes-expand cfg-btn-import-font" aria-expanded={expanded} aria-controls="game-themes-list" onClick={toggleCatalog}>{expanded?<ChevronUp size={14}/>:<ChevronDown size={14}/>} {expanded?text("Mostrar menos temas","Show fewer themes"):text("Mostrar todos os temas","Show all themes")}</button>
  <p className="game-themes-resource-note">{text("Temas com imagens e transparência podem aumentar o uso de memória RAM e GPU, principalmente com várias janelas abertas. Para menor consumo, use o tema padrão.","Themes with images and transparency may increase RAM and GPU memory usage, especially with multiple windows open. For lower resource usage, use the default theme.")}</p>
  <p className="game-themes-community">{text("A comunidade também pode criar wallpapers e temas.","The community can create wallpapers and themes too.")}<button type="button" onClick={()=>void invoke("open_url",{url:"https://github.com/NskBR/SFDownloader-App/blob/main/docs/custom-themes.md"}).catch(cause=>setError(String(cause)))}>{text("Como contribuir","How to contribute")}</button></p>
  {error&&<p role="alert" className="test-themes-error game-themes-error">{error}</p>}
 </section>;
}
