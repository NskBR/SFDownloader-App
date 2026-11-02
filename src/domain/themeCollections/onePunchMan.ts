import fubuki from "../../assets/themes/one-punch-man/fubuki-preview.jpg";
import tatsumaki from "../../assets/themes/one-punch-man/tatsumaki-preview.jpg";
import genos from "../../assets/themes/one-punch-man/genos-preview.jpg";
import saitama from "../../assets/themes/saitama-preview.jpg";
import type {ThemeWallpaper} from "../themeWallpapers";

/** Stable collection ID preserves existing Saitama settings and downloads. */
export const onePunchManWallpapers:ThemeWallpaper[]=[
 {id:"saitama",name:"Saitama",image:saitama},
 {id:"saitama--genos",name:"Genos",image:genos,appearance:{preset:"saitama",palette:{surface:"#28201c",raised:"#413027",accent:"#ffb34f",strong:"#ffe0a0"}}},
 {id:"saitama--tatsumaki",name:"Tatsumaki",image:tatsumaki,appearance:{preset:"saitama",palette:{surface:"#152a25",raised:"#224438",accent:"#63e9b1",strong:"#c4ffe5"}}},
 {id:"saitama--fubuki",name:"Fubuki",image:fubuki,appearance:{preset:"saitama",palette:{surface:"#16282a",raised:"#253c40",accent:"#75d9d0",strong:"#d5f7ef"}}},
];
