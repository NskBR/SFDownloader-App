import {beforeEach,expect,it,vi} from "vitest";
const mocks=vi.hoisted(()=>({invoke:vi.fn(),image:vi.fn()}));
vi.mock("@tauri-apps/api/core",()=>({invoke:mocks.invoke}));
vi.mock("./testThemes",()=>({loadThemeImage:mocks.image}));
beforeEach(()=>{vi.resetModules();vi.clearAllMocks();});
it("shares the startup lookup and reuses it on every later visit",async()=>{
 let resolve!:(ids:string[])=>void;mocks.invoke.mockImplementation(()=>new Promise<string[]>(done=>resolve=done));
 const catalog=await import("./themeCatalog");
 const first=catalog.loadThemeCatalog(),second=catalog.loadThemeCatalog();
 expect(first).toBe(second);expect(mocks.invoke).toHaveBeenCalledTimes(1);
 resolve(["cyberpunk"]);await first;
 expect(await catalog.loadThemeCatalog()).toEqual(["cyberpunk"]);expect(mocks.invoke).toHaveBeenCalledTimes(1);
 catalog.markThemeDownloaded("saitama",true);expect(catalog.cachedThemeCatalog()).toEqual(["cyberpunk","saitama"]);
 catalog.markThemeDownloaded("cyberpunk",false);expect(await catalog.loadThemeCatalog()).toEqual(["saitama"]);
});
it("can retry a failed cache scan instead of caching failure forever",async()=>{
 mocks.invoke.mockRejectedValueOnce(new Error("disk")).mockResolvedValueOnce([]);
 const catalog=await import("./themeCatalog");await expect(catalog.loadThemeCatalog()).rejects.toThrow("disk");
 expect(await catalog.loadThemeCatalog()).toEqual([]);expect(mocks.invoke).toHaveBeenCalledTimes(2);
});
