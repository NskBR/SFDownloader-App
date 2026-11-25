import {Download,FolderOpen,Link2,RotateCcw,ShieldCheck,SlidersHorizontal} from "./icons";
import logo from "../assets/sf-logo.svg";
type Kind='update'|'reset'|'link'|'about';
const content={update:{label:'Uma nova versão',detail:'Seus downloads continuam.',Icon:Download,Secondary:FolderOpen},reset:{label:'Um novo começo',detail:'Seus arquivos ficam.',Icon:RotateCcw,Secondary:ShieldCheck},link:{label:'Retome de onde parou',detail:'Um novo endereço. O mesmo arquivo.',Icon:Link2,Secondary:Download},about:{label:'SFDownloader',detail:'Seus arquivos. Seu espaço.',Icon:SlidersHorizontal,Secondary:FolderOpen}};
export function DialogVisualRail({kind}:{kind:Kind}){
 const {label,detail,Icon,Secondary}=content[kind];
 return <aside className="sf-dialog-rail" aria-hidden="true"><div className="sf-dialog-rail-symbol">{kind==='about'?<img src={logo} alt=""/>:<Icon size={30}/>}</div><span className="sf-dialog-rail-connector"/><div className="sf-dialog-rail-secondary"><Secondary size={20}/></div><strong>{label}</strong><p>{detail}</p></aside>;
}
