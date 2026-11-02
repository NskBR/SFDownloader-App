import principal from "../../assets/themes/gta-san-andreas-preview.jpg";
import variation0 from "../../assets/themes/gta-san-andreas/big-smoke-preview.jpg";
import variation1 from "../../assets/themes/gta-san-andreas/street-girl-preview.jpg";
import variation2 from "../../assets/themes/gta-san-andreas/grove-soldier-preview.jpg";
import variation3 from "../../assets/themes/gta-san-andreas/lowrider-preview.jpg";
import variation4 from "../../assets/themes/gta-san-andreas/the-truth-preview.jpg";
import variation5 from "../../assets/themes/gta-san-andreas/bmx-preview.jpg";
import variation6 from "../../assets/themes/gta-san-andreas/orange-street-preview.jpg";
import variation7 from "../../assets/themes/gta-san-andreas/grove-family-preview.jpg";
import variation8 from "../../assets/themes/gta-san-andreas/the-boss-preview.jpg";
import type {ThemeWallpaper} from "../themeWallpapers";

/** Principal stays first; variations share the San Andreas shapes and typography. */
export const sanAndreasWallpapers:ThemeWallpaper[]=[
 {id:"gta-san-andreas",name:"Vinewood · Principal",image:principal},
 {id:"gta-san-andreas--big-smoke",name:"Big Smoke",image:variation0,appearance:{preset:"gta-san-andreas",palette:{surface:"#26291c",raised:"#3c4229",accent:"#b8c885",strong:"#e5e9bb"}}},
 {id:"gta-san-andreas--street-girl",name:"Los Santos",image:variation1,appearance:{preset:"gta-san-andreas",palette:{surface:"#202b25",raised:"#35443a",accent:"#b5d3a1",strong:"#e0efce"}}},
 {id:"gta-san-andreas--grove-soldier",name:"Grove Street",image:variation2,appearance:{preset:"gta-san-andreas",palette:{surface:"#28291f",raised:"#414234",accent:"#c5c19d",strong:"#eee7cc"}}},
 {id:"gta-san-andreas--lowrider",name:"Lowrider",image:variation3,appearance:{preset:"gta-san-andreas",palette:{surface:"#222c23",raised:"#364535",accent:"#afd18d",strong:"#dcebb8"}}},
 {id:"gta-san-andreas--the-truth",name:"The Truth",image:variation4,appearance:{preset:"gta-san-andreas",palette:{surface:"#30241e",raised:"#49352c",accent:"#e5bb79",strong:"#ffdfa1"}}},
 {id:"gta-san-andreas--bmx",name:"BMX",image:variation5,appearance:{preset:"gta-san-andreas",palette:{surface:"#1d2b2e",raised:"#304449",accent:"#a6d5d6",strong:"#daeeee"}}},
 {id:"gta-san-andreas--orange-street",name:"Orange Street",image:variation6,appearance:{preset:"gta-san-andreas",palette:{surface:"#30231b",raised:"#4a3425",accent:"#e9ad69",strong:"#ffe0af"}}},
 {id:"gta-san-andreas--grove-family",name:"Grove Family",image:variation7,appearance:{preset:"gta-san-andreas",palette:{surface:"#282d1e",raised:"#3e472d",accent:"#b6cc83",strong:"#e5edbd"}}},
 {id:"gta-san-andreas--the-boss",name:"The Boss",image:variation8,appearance:{preset:"gta-san-andreas",palette:{surface:"#30221f",raised:"#49302d",accent:"#d5a078",strong:"#f4cfab"}}},
];
