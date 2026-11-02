import {expect,it} from "vitest";
import {appearanceCss} from "./themeAppearance";
import {createGameTheme} from "../domain/testThemePresets";
it("emits different colors and geometry for each Naruto appearance, including auxiliary window tokens",()=>{
 const baryon=appearanceCss(createGameTheme("naruto","naruto-baryon").appearance);
 const hinata=appearanceCss(createGameTheme("naruto","hinata").appearance);
 expect(baryon).toContain("#ffac50");expect(hinata).toContain("#c6b9f0");
 expect(baryon).toContain("5px 20px 5px 20px");expect(hinata).toContain("12px 5px 12px 5px");
 expect(baryon).toContain(':not([data-window-maximized="true"])');
 expect(baryon).not.toContain("--st-failed");expect(baryon).not.toContain("--st-completed");
});
it("does not interpolate external URLs or arbitrary CSS from invalid values",()=>{
 expect(appearanceCss({font:'url(https://example.com/font)',palette:{surface:'red;}',raised:'#000000',accent:'#ffffff',strong:'#ffffff'},geometry:{window:'url(evil)',cardRadius:'1px;display:none',navigationRadius:'1px;}'}})).toBe("");
});
