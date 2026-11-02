import {describe,it,expect} from "vitest";
import {gameThemeIds} from "./settings";
import manifest from "../../themes/manifest.json";
import {selectedWallpaper,themeWallpapers} from "./themeWallpapers";
import {cyberpunkTestCss,createCyberpunkTheme,createCS2Theme,createGameTheme,gameThemePresets} from "./testThemePresets";
import {compileThemeCss} from "../services/testThemes";
describe("Cyberpunk test preset",()=>{
 it("is a complete fixed theme with its packaged wallpaper",()=>{
  const theme=createCyberpunkTheme();
  expect(theme.enabled).toBe(true);expect(theme.imageId).toBe("builtin:cyberpunk");expect(theme.preset).toBe("cyberpunk");
  expect(theme.css).not.toContain("inset 3px 0 0 #f2e500");
 });
 it("uses only supported cosmetic rules and never scopes into settings",()=>{
  const css=compileThemeCss(cyberpunkTestCss,{});
  expect(css).toContain(".navigation__item");
  expect(css).toContain(".download-card");
  expect(css).not.toContain(".simple-settings");
  expect(css).not.toContain(".test-themes-card");
 });
});

it("provides a CS2 theme with the packaged upscaled wallpaper and restricted visual CSS",()=>{
 const theme=createCS2Theme();expect(theme.preset).toBe("cs2");expect(theme.imageId).toBe("builtin:cs2");
 expect(()=>compileThemeCss(theme.css,{})).not.toThrow();expect(gameThemePresets.map(t=>t.id)).toEqual(gameThemeIds);
});

it.each(gameThemeIds)("provides the complete %s theme",id=>{
 const theme=createGameTheme(id);
 expect(theme.preset).toBe(selectedWallpaper(id).appearance?.preset??id);expect(theme.imageId).toBe(`builtin:${selectedWallpaper(id).id}`);
 expect(()=>compileThemeCss(theme.css,{})).not.toThrow();
});

it.each(gameThemeIds)("pins all three wallpaper variants for %s",id=>{
 for(const wallpaper of themeWallpapers(id))for(const suffix of ["","-medium","-compact"]){
  const asset=manifest.find(a=>a.id===wallpaper.id+suffix);
  expect(asset).toBeDefined();expect(asset?.sha256).toMatch(/^[a-f0-9]{64}$/);expect(asset?.bytes).toBeGreaterThan(0);
 }
});
