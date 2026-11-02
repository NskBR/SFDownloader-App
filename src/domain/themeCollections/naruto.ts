import baryon from "../../assets/themes/naruto-baryon-preview.jpg";
import hinata from "../../assets/themes/hinata/preview.jpg";
import type {ThemeWallpaper} from "../themeWallpapers";

/** One collection, two complete visual profiles. Asset IDs stay stable for the local cache. */
export const narutoWallpapers:ThemeWallpaper[]=[
 {id:"naruto-baryon",name:"Naruto · Modo Bárion",image:baryon,
  appearance:{preset:"naruto-baryon",darkness:40,panelOpacity:80,font:'"SFRajdhani","Segoe UI",sans-serif',
   palette:{surface:"#201713",raised:"#3c281d",accent:"#ffac50",strong:"#ffd083"},
   geometry:{window:"polygon(18px 0,100% 0,100% calc(100% - 18px),calc(100% - 18px) 100%,0 100%,0 18px)",cardRadius:"5px 20px 5px 20px",navigationRadius:"4px 16px 4px 16px"}}},
 {id:"hinata",name:"Hinata Hyuga",image:hinata,
  appearance:{preset:"hinata",darkness:40,panelOpacity:80,font:'"Segoe UI",sans-serif',
   palette:{surface:"#19192c",raised:"#2e2b47",accent:"#c6b9f0",strong:"#eee8ff"},
   geometry:{window:"inset(0 round 12px 5px 12px 5px)",cardRadius:"12px 5px 12px 5px",navigationRadius:"12px 5px 12px 5px"}}},
];
