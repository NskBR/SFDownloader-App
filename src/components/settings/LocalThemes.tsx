import {useEffect,useState} from "react";
import {open} from "@tauri-apps/plugin-dialog";
import {invoke} from "@tauri-apps/api/core";
import {Upload,Trash2,ChevronLeft,ChevronRight} from "../icons";
import {useTranslation} from "../../i18n";
import {localThemes,invalidateLocalThemes,type LocalTheme} from "../../services/localThemes";
import {loadThemeImage} from "../../services/testThemes";
function Thumbnail({id}:{id:string}){
 const [source,setSource]=useState<string>();
 useEffect(()=>{let live=true;void loadThemeImage(id).then(value=>{if(live)setSource(value);}).catch(()=>{});return()=>{live=false;};},[id]);
 return source?<img src={source} alt="" draggable={false} width={360} height={204}/>:null;
}
export function LocalThemes({selected,onSelect}:{selected?:string;onSelect:(id?:string)=>void}){
 const {language}=useTranslation();const text=(pt:string,en:string)=>language==="pt-BR"?pt:en;
 const [themes,setThemes]=useState<LocalTheme[]>([]),[choices,setChoices]=useState<Record<string,number>>({}),[busy,setBusy]=useState(false),[error,setError]=useState("");
 useEffect(()=>{void localThemes().then(setThemes).catch(cause=>setError(String(cause)));},[]);
 const importZip=async()=>{try{const path=await open({multiple:false,filters:[{name:"Tema ZIP",extensions:["zip"]}]});if(typeof path!=="string")return;setBusy(true);setError("");await invoke("import_local_theme",{path});invalidateLocalThemes();setThemes(await localThemes());}catch(cause){setError(String(cause));}finally{setBusy(false);}};
 const remove=async(id:string)=>{setBusy(true);try{await invoke("delete_local_theme",{id});if(selected?.startsWith(id+":"))onSelect(undefined);invalidateLocalThemes();setThemes(await localThemes());}catch(cause){setError(String(cause));}finally{setBusy(false);}};
 return <section className="cfg-card local-themes-card"><div className="cfg-card-header"><div><h3 className="cfg-card-title">{text("Temas locais","Local themes")}</h3><p className="cfg-card-subtitle">{text("Importe um ZIP com configuração e imagens. Disponível offline.","Import a ZIP with configuration and images. Available offline.")}</p></div><button type="button" className="cfg-btn-import-font" disabled={busy} onClick={()=>void importZip()}><Upload size={15}/>{busy?text("Importando…","Importing…"):text("Adicionar tema local","Add local theme")}</button></div>
 <div className="game-themes-grid">{themes.map(theme=>{const active=selected?.startsWith(theme.id+":");const index=choices[theme.id]??(active?Number(selected!.split(":")[1]):0);const variant=theme.variants[index]??theme.variants[0];return <div className="game-theme-entry" key={theme.id}><button type="button" disabled={busy} className={`game-theme-tile ${active?"is-selected":""}`} aria-pressed={active} onClick={()=>onSelect(`${theme.id}:${index}`)}><span className="game-theme-preview"><Thumbnail id={variant.preview}/></span><strong>{theme.name}</strong><span className="game-theme-state">{variant.name} · {text("Local","Local")}{active?text(" · Atual"," · Current"):""}</span></button><button type="button" disabled={busy} className="game-theme-delete" aria-label={`${text("Apagar tema","Delete theme")} ${theme.name}`} onClick={()=>void remove(theme.id)}><Trash2 size={13}/></button>{theme.variants.length>1&&<div className="theme-wallpaper-controls">{[-1,1].map(direction=><button key={direction} type="button" disabled={busy} aria-label={direction<0?text("Anterior","Previous"):text("Próximo","Next")} onClick={()=>{const next=(index+direction+theme.variants.length)%theme.variants.length;setChoices({...choices,[theme.id]:next});if(active)onSelect(`${theme.id}:${next}`);}}>{direction<0?<ChevronLeft size={15}/>:<ChevronRight size={15}/>}</button>)}</div>}</div>;})}</div>
 {selected&&<button type="button" className="cfg-btn-import-font" onClick={()=>onSelect(undefined)}>{text("Desativar tema local","Disable local theme")}</button>}{error&&<p role="alert" className="test-themes-error">{error}</p>}</section>;
}
