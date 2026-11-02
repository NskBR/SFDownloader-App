import {afterEach,expect,it,vi} from "vitest";
import {invoke} from "@tauri-apps/api/core";
import {invalidateLocalThemes,resolveLocalTheme} from "./localThemes";
vi.mock("@tauri-apps/api/core",()=>({invoke:vi.fn()}));
const variant={name:"Sarah",image:"main",preview:"preview",medium:"medium",compact:"compact",preset:"botanical",appearance:{palette:{surface:"#291d30",raised:"#432c48",accent:"#efb4d5",strong:"#ffdaed"}},darkness:50,panelOpacity:86,position:"center"};
afterEach(()=>{invalidateLocalThemes();vi.resetAllMocks();document.documentElement.className="";});
it("restores the complete local visual profile and uses smaller images in auxiliary windows",async()=>{
 vi.mocked(invoke).mockResolvedValue([{id:"package",variants:[variant]}]);
 document.documentElement.className="window-type-main";
 expect(await resolveLocalTheme("package:0")).toMatchObject({imageId:"main",preset:"botanical",appearance:variant.appearance,enabled:true});
 document.documentElement.className="window-type-media";
 Object.defineProperty(window,"innerWidth",{value:440,configurable:true});
 expect((await resolveLocalTheme("package:0")).imageId).toBe("compact");
});
it("refreshes an auxiliary window's stale catalog after importing in the main window",async()=>{
 vi.mocked(invoke).mockResolvedValueOnce([]).mockResolvedValueOnce([{id:"package",variants:[variant]}]);
 expect((await resolveLocalTheme("package:0")).preset).toBe("botanical");
 expect(invoke).toHaveBeenCalledTimes(2);
});
it("rejects a missing variant rather than silently applying another wallpaper",async()=>{
 vi.mocked(invoke).mockResolvedValue([{id:"package",variants:[variant]}]);
 await expect(resolveLocalTheme("package:9")).rejects.toThrow("Local theme not found");
});
