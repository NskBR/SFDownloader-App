import { useEffect, useState } from "react";
import { FlaskConical, Upload, RotateCcw, Image as ImageIcon } from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { defaultTestTheme, type TestThemeSettings } from "../../domain/settings";
import { type ThemeImage, loadThemeImage, validateTestTheme } from "../../services/testThemes";
import { Toggle } from "../ui/Toggle";
import { CustomSelect } from "../ui/CustomSelect";
import { useTranslation } from "../../i18n";
interface Props { value: TestThemeSettings; onChange: (value: TestThemeSettings) => void }
export function TestThemesCard({value,onChange}: Props) {
  const {language}=useTranslation(); const text=(pt:string,en:string)=>language==="pt-BR"?pt:en;
  const [images,setImages]=useState<ThemeImage[]>([]);
  const [css,setCss]=useState(value.css);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const [notice,setNotice]=useState("");
  useEffect(()=>{setCss(value.css);},[value.css]);
  useEffect(()=>{void invoke<ThemeImage[]>("list_theme_images").then(setImages).catch(()=>{});},[]);
  const change=(patch:Partial<TestThemeSettings>)=>onChange({...value,...patch,preset:"custom"});
  const toggleTheme=async(enabled:boolean)=>{
    setError(null);setNotice("");
    if(!enabled){change({enabled:false});return;}
    setBusy(true);
    try {await validateTestTheme(value.css,value.imageId);change({enabled:true});}
    catch(cause){setError(String(cause));}finally{setBusy(false);}
  };
  const importImage=async()=>{
    setBusy(true);setError(null);setNotice("");
    try {
      const path=await open({multiple:false,directory:false,filters:[{name:"PNG / GIF",extensions:["png","gif"]}]});
      if(typeof path!=="string")return;
      const image=await invoke<ThemeImage>("import_theme_image",{path});
      await loadThemeImage(image.id);
      setImages(current=>[...current.filter(i=>i.id!==image.id),image]);
      change({imageId:image.id});
      setNotice(text("Imagem importada. Ative o tema para testar.","Image imported. Enable the theme to test."));
    } catch(cause){setError(String(cause));} finally{setBusy(false);}
  };
  const apply=async()=>{setBusy(true);setError(null);setNotice("");try{await validateTestTheme(css,value.imageId);change({css,enabled:true});setNotice(text("Tema aplicado.","Theme applied."));}catch(cause){setError(String(cause));}finally{setBusy(false);}};
  return <section className="cfg-card test-themes-card">
    <div className="cfg-card-header test-themes-heading"><div className="cfg-card-icon-box"><FlaskConical size={18}/></div><div><h3 className="cfg-card-title">{text("Temas test","Test themes")}</h3><p className="cfg-card-subtitle">{text("Editor CSS experimental · imagens locais e GIFs. Temas prontos ficam em Temas de jogos.","Experimental CSS editor · local images and GIFs. Ready-made themes are under Game themes.")}</p></div><Toggle checked={value.enabled} onChange={enabled=>{if(!busy)void toggleTheme(enabled);}}/></div>
    <div className="test-themes-body">
      <div className="test-themes-actions"><button type="button" className="cfg-btn-import-font" disabled={busy} onClick={()=>void importImage()}><Upload size={15}/>{text("Importar PNG ou GIF","Import PNG or GIF")}</button><button type="button" className="cfg-btn-import-font" onClick={()=>{setError(null);setNotice("");setCss("");onChange({...defaultTestTheme});}}><RotateCcw size={15}/>{text("Restaurar visual padrão","Restore default appearance")}</button></div>
      <p className="test-themes-hint">{text("Até 20 MB. A imagem é copiada para o app. Nenhum arquivo é enviado à internet.","Up to 20 MB. The app stores a copy. No files are uploaded.")}</p>
      <label className="test-themes-field"><span><ImageIcon size={14}/>{text("Imagem de fundo","Background image")}</span><CustomSelect ariaLabel={text("Imagem de fundo","Background image")} value={value.imageId??"none"} options={[{value:"none",label:text("Sem imagem","No image")},{value:"builtin:cyberpunk",label:"Cyberpunk · "+text("incluída","included")},...images.map(image=>({value:image.id,label:image.name})),...(value.imageId&&value.imageId!=="builtin:cyberpunk"&&!images.some(i=>i.id===value.imageId)?[{value:value.imageId,label:text("Imagem indisponível — importe novamente","Image unavailable — import again"),disabled:true}]:[])]} onChange={id=>change({imageId:id==="none"?null:id})}/></label>
      {value.imageId && <div className="test-themes-adjustments">
        <label>{text("Escurecimento","Darkness")} <output>{value.darkness}%</output><input aria-label={text("Escurecimento","Darkness")} type="range" min="30" max="85" value={value.darkness} onChange={e=>change({darkness:Number(e.target.value)})}/></label>
        <label>{text("Opacidade dos cartões","Card opacity")} <output>{value.panelOpacity}%</output><input aria-label={text("Opacidade dos cartões","Card opacity")} type="range" min="60" max="100" value={value.panelOpacity} onChange={e=>change({panelOpacity:Number(e.target.value)})}/></label>
        <label>{text("Posição","Position")}<CustomSelect ariaLabel={text("Posição","Position")} value={value.position} options={[{value:"left",label:text("Esquerda","Left")},{value:"center",label:text("Centro","Center")},{value:"right",label:text("Direita","Right")}]} onChange={position=>change({position:position as TestThemeSettings["position"]})}/></label>
      </div>}
      <label className="test-themes-field"><span>{text("Código CSS do tema","Theme CSS code")}</span><textarea spellCheck={false} aria-label={text("Código CSS do tema","Theme CSS code")} value={css} maxLength={20000} onChange={e=>setCss(e.target.value)} placeholder={'.sidebar { background-color: rgba(10, 12, 18, 0.8); }\n.download-card { border-color: #f5df00; border-radius: 10px; }'}/></label>
      <p className="test-themes-hint">{text("Seletores: .window-frame, .sidebar, .download-card, .titlebar, .flux-header e .flux-footer. Use cores, fundos, bordas e sombras. Regras de layout, scripts e links externos são bloqueados.","Selectors: .window-frame, .sidebar, .download-card, .titlebar, .flux-header and .flux-footer. Use colors, backgrounds, borders and shadows. Layout rules, scripts and external links are blocked.")}</p>
      {images.length>0 && <details className="test-themes-assets"><summary>{text("Imagens disponíveis no CSS","Images available in CSS")}</summary>{images.map(image=><div key={image.id}><span title={image.name}>{image.name}</span><button type="button" onClick={()=>setCss(current=>`${current}\n.window-frame { background-image: linear-gradient(rgba(0,0,0,.5), rgba(0,0,0,.5)), url("theme:${image.id}"); background-size: cover; background-position: center; }`)}>{text("Inserir fundo no CSS","Insert background in CSS")}</button></div>)}</details>}
      <div className="test-themes-actions"><button type="button" className="btn-primary" disabled={busy} onClick={()=>void apply()}>{busy?text("Verificando…","Checking…"):text("Aplicar CSS e ativar","Apply CSS and enable")}</button></div>
      {error&&<p role="alert" className="test-themes-error">{error}</p>}{notice&&<p role="status" className="test-themes-hint">{notice}</p>}
      <p className="test-themes-hint">{text("Os backups guardam o CSS e as referências; em outro computador, importe as imagens novamente. A aparência das janelas de download não muda nesta fase.","Backups store CSS and references; import images again on another computer. Download windows keep their current appearance in this phase.")}</p>
    </div>
  </section>;
}
