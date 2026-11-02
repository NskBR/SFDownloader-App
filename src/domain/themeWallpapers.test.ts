import {expect,it} from "vitest";
import {selectedWallpaper,themeWallpapers} from "./themeWallpapers";
import {createGameTheme} from "./testThemePresets";
import manifest from "../../themes/manifest.json";
it("switches the complete Naruto appearance without creating another catalog theme",()=>{
 const baryon=createGameTheme("naruto","naruto-baryon"),hinata=createGameTheme("naruto","hinata");
 expect(baryon.preset).toBe("naruto-baryon");expect(hinata.preset).toBe("hinata");
 expect(baryon.css).not.toBe(hinata.css);expect(baryon.imageId).toBe("builtin:naruto-baryon");expect(hinata.imageId).toBe("builtin:hinata");
});

it("keeps Cyberpunk shapes and styling while switching the three wallpaper palettes",()=>{
 const variants=themeWallpapers("cyberpunk");
 expect(variants.map(item=>item.id)).toEqual(["cyberpunk","cyberpunk--v-sunset","cyberpunk--v-inferno"]);
 const profiles=variants.map(item=>createGameTheme("cyberpunk",item.id));
 expect(new Set(profiles.map(item=>item.css)).size).toBe(1);
 expect(new Set(profiles.map(item=>item.appearance?.palette?.accent)).size).toBe(3);
 for(const profile of profiles){expect(profile.preset).toBe("cyberpunk");expect(profile.appearance?.geometry).toBeUndefined();expect(profile.appearance?.font).toBeUndefined();}
 for(const variant of variants)for(const suffix of ["","-medium","-compact"]){
  expect(manifest.find(entry=>entry.id===variant.id+suffix)?.file).toMatch(/^cyberpunk\//);
 }
 expect(selectedWallpaper("cyberpunk","missing").id).toBe("cyberpunk");
});
