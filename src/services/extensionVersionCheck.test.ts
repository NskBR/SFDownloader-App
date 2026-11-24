import {beforeEach,it,expect,vi} from "vitest";
import {invoke} from "@tauri-apps/api/core";
import {version as appVersion} from "../../package.json";
vi.mock("@tauri-apps/api/core",()=>({invoke:vi.fn()}));
const key="sf-downloader.extension-version-check.v1";
const current={connected:true,installedVersion:"0.4.0",availableVersion:"0.4.0",outdated:false};
beforeEach(()=>{localStorage.clear();vi.resetModules();vi.mocked(invoke).mockReset();vi.mocked(invoke).mockResolvedValue(current);});
it("checks once, shares the result and preserves it after restarting the frontend",async()=>{
 const {checkExtensionVersion}=await import("./extensionVersionCheck");
 for(let n=0;n<5;n++)expect((await checkExtensionVersion())?.outdated).toBe(false);
 expect(invoke).toHaveBeenCalledTimes(1);
 vi.resetModules();vi.mocked(invoke).mockClear();
 const reopened=await import("./extensionVersionCheck");
 expect((await reopened.checkExtensionVersion())?.installedVersion).toBe("0.4.0");expect(invoke).not.toHaveBeenCalled();
});
it("checks again when the saved result belongs to an earlier app update",async()=>{
 localStorage.setItem(key,JSON.stringify({...current,appVersion:"0.0.1"}));
 const {checkExtensionVersion}=await import("./extensionVersionCheck");
 await checkExtensionVersion();expect(invoke).toHaveBeenCalledTimes(1);expect(JSON.parse(localStorage.getItem(key)!).appVersion).toBe(appVersion);
});
it("waits for a verified version instead of recording missing reports as errors",async()=>{
 vi.mocked(invoke).mockResolvedValueOnce({...current,installedVersion:null});
 const {checkExtensionVersion}=await import("./extensionVersionCheck");
 expect(await checkExtensionVersion()).toBeNull();expect(localStorage.getItem(key)).toBeNull();
 expect((await checkExtensionVersion())?.installedVersion).toBe("0.4.0");expect(invoke).toHaveBeenCalledTimes(2);
});
it("allows an explicit manual recheck to clear an old warning",async()=>{
 vi.mocked(invoke).mockResolvedValueOnce({...current,installedVersion:"0.3.9",outdated:true});
 const {checkExtensionVersion}=await import("./extensionVersionCheck");
 expect((await checkExtensionVersion())?.outdated).toBe(true);
 expect((await checkExtensionVersion())?.outdated).toBe(true);expect(invoke).toHaveBeenCalledTimes(1);
 expect((await checkExtensionVersion(true))?.outdated).toBe(false);
 await checkExtensionVersion();expect(invoke).toHaveBeenCalledTimes(2);
});
it("shares one pending request between the titlebar and integration assistant",async()=>{
 let resolve!:(value:unknown)=>void;vi.mocked(invoke).mockImplementation(()=>new Promise(r=>{resolve=r;}));
 const {checkExtensionVersion}=await import("./extensionVersionCheck");
 const first=checkExtensionVersion(),second=checkExtensionVersion();expect(first).toBe(second);
 resolve(current);await first;expect(invoke).toHaveBeenCalledTimes(1);
});
