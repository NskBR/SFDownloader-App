import {invoke} from "@tauri-apps/api/core";
import {useState,useRef,useEffect} from "react";
import {Gamepad2,Check,RotateCcw} from "lucide-react";
import type {GameTheme} from "../../domain/settings";
import {createGameTheme,gameThemePresets} from "../../domain/testThemePresets";
import {validateTestTheme} from "../../services/testThemes";
import {useTranslation} from "../../i18n";
interface Props {selected:GameTheme;onSelect:(theme:GameTheme)=>void}
export function GameThemesCard({selected,onSelect}:Props){
 const {language}=useTranslation();const text=(pt:string,en:string)=>language==="pt-BR"?pt:en;
 const [busy,setBusy]=useState<GameTheme|null>(null);const [error,setError]=useState<string|null>(null);
 const [installed,setInstalled]=useState<string[]>([]);
 useEffect(()=>{void invoke<string[]>("installed_game_themes").then(setInstalled).catch(()=>{});},[]);
 const [cooldown,setCooldown]=useState(0);const locked=useRef(false);
 useEffect(()=>{if(!cooldown)return;const timer=window.setTimeout(()=>{setCooldown(value=>value-1);if(cooldown===1)locked.current=false;},1000);return()=>window.clearTimeout(timer);},[cooldown]);
 const apply=async(id:GameTheme)=>{
  if(locked.current || (id===selected && (id==="none" || installed.includes(id))))return;
  locked.current=true;setBusy(id);setError(null);
  try{if(id!=="none"){await invoke("download_game_theme",{id});setInstalled(current=>[...new Set([...current,id])]);const theme=createGameTheme(id);await validateTestTheme(theme.css,theme.imageId);}onSelect(id);setCooldown(1);}
  catch(cause){setError(String(cause));locked.current=false;}finally{setBusy(null);}
 };
 return <section className="cfg-card game-themes-card">
  <div className="cfg-card-header game-themes-header"><div className="cfg-card-icon-box"><Gamepad2 size={18}/></div><div><h3 className="cfg-card-title">{text("Temas de jogos","Game themes")}</h3><p className="cfg-card-subtitle">{cooldown>0?<span role="status">{text("Aguarde 1s para trocar o tema.","Wait 1s before switching themes.")}</span>:text("Baixe uma vez e aplique. Disponível offline após baixar.","Download once and apply. Available offline after downloading.")}</p></div>{selected!=="none"&&<button type="button" className="cfg-btn-import-font" disabled={busy!==null||cooldown>0} onClick={()=>void apply("none")}><RotateCcw size={14}/>{text("Desativar tema de jogo","Disable game theme")}</button>}</div>
  <div className="game-themes-grid">{gameThemePresets.map(theme=><button type="button" className={`game-theme-tile ${selected===theme.id?"is-selected":""}`} key={theme.id}
   aria-label={`${text("Aplicar","Apply")} ${theme.id==="cs2"?"CS2":theme.name}`} aria-pressed={selected===theme.id} disabled={busy!==null||cooldown>0}
   title={language==="pt-BR"?theme.pt:theme.en} onClick={()=>void apply(theme.id)}>
   <span className="game-theme-preview"><img src={theme.image} alt="" draggable={false}/>{selected===theme.id&&<span className="game-theme-check"><Check size={13}/></span>}</span>
   <strong>{theme.name}</strong><span className="game-theme-state">{busy===theme.id?text("Preparando…","Preparing…"):selected===theme.id?text("Atual","Current"):installed.includes(theme.id)?text("Aplicar","Apply"):text("Baixar tema","Download theme")}</span>
  </button>)}</div>
  {error&&<p role="alert" className="test-themes-error game-themes-error">{error}</p>}
 </section>;
}
