import songbird from "../../assets/themes/cyberpunk-preview.jpg";
import sunset from "../../assets/themes/cyberpunk/v-sunset-preview.jpg";
import inferno from "../../assets/themes/cyberpunk/v-inferno-preview.jpg";
import type {ThemeWallpaper} from "../themeWallpapers";

/** All backgrounds share Cyberpunk geometry and typography; only their palette changes. */
export const cyberpunkWallpapers:ThemeWallpaper[]=[
 {id:"cyberpunk",name:"Songbird · Phantom Liberty",image:songbird,
  appearance:{preset:"cyberpunk",palette:{surface:"#281b2b",raised:"#402338",accent:"#ff416b",strong:"#ff7191"}}},
 {id:"cyberpunk--v-sunset",name:"V · Night City Sunset",image:sunset,
  appearance:{preset:"cyberpunk",palette:{surface:"#2c1c1d",raised:"#472b2b",accent:"#f58b73",strong:"#ffd0b5"}}},
 {id:"cyberpunk--v-inferno",name:"V · Inferno",image:inferno,
  appearance:{preset:"cyberpunk",palette:{surface:"#241c18",raised:"#3c2a20",accent:"#ff943d",strong:"#ffd080"}}},
];
