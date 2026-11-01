import {describe,it,expect} from "vitest";
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
 expect(()=>compileThemeCss(theme.css,{})).not.toThrow();expect(gameThemePresets.map(t=>t.id)).toEqual(["cyberpunk","cs2","star-citizen","god-of-war-ragnarok"]);
});

it.each(["star-citizen","god-of-war-ragnarok"] as const)("provides the complete %s theme",id=>{
 const theme=createGameTheme(id);
 expect(theme.preset).toBe(id);expect(theme.imageId).toBe(`builtin:${id}`);
 expect(()=>compileThemeCss(theme.css,{})).not.toThrow();
});
