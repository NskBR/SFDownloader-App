import {beforeEach,it,expect,vi} from "vitest";
import {invoke} from "@tauri-apps/api/core";
import {version as appVersion} from "../../package.json";
vi.mock("@tauri-apps/api/core",()=>({invoke:vi.fn()}));
const key="sf-downloader.extension-instances.v1";
const brave={id:"brave-profile",browserName:"Brave",version:"0.4.1",connected:true,legacy:false,outdated:false};
const firefox={id:"firefox-profile",browserName:"Firefox",version:null,connected:true,legacy:true,outdated:false};
const status={connected:true,availableVersion:"0.4.1",instances:[brave,firefox]};
beforeEach(()=>{localStorage.clear();vi.resetModules();vi.mocked(invoke).mockReset();vi.mocked(invoke).mockResolvedValue(status);});
it("never marks a legacy Firefox as updated because Brave is current",async()=>{
 const {readBrowserConnections,browserConnectionWarning}=await import("./extensionVersionCheck");
 const result=await readBrowserConnections();
 expect(result.instances?.[0].version).toBe("0.4.1");expect(result.instances?.[1].version).toBeNull();
 expect(browserConnectionWarning(result.instances)).toContain("não verificada");
 expect(JSON.parse(localStorage.getItem(key)!).checks[firefox.id]).toBeUndefined();
});
it("retains separate checks across frontend restarts and refreshes live connection state",async()=>{
 const {readBrowserConnections}=await import("./extensionVersionCheck");
 await readBrowserConnections();const saved=JSON.parse(localStorage.getItem(key)!);expect(saved.appVersion).toBe(appVersion);expect(saved.checks[brave.id].outdated).toBe(false);
 vi.resetModules();vi.mocked(invoke).mockResolvedValue({...status,instances:[{...brave,connected:false},firefox]});
 const reopened=await import("./extensionVersionCheck");expect((await reopened.readBrowserConnections()).instances?.[0].connected).toBe(false);
});
it("a new extension version changes only its own instance result",async()=>{
 const {readBrowserConnections}=await import("./extensionVersionCheck");
 vi.mocked(invoke).mockResolvedValueOnce({...status,instances:[brave,{...firefox,version:'0.4.0'}]});
 expect((await readBrowserConnections()).instances?.[1].outdated).toBe(true);
 vi.mocked(invoke).mockResolvedValueOnce({...status,instances:[brave,{...firefox,version:'0.4.1',legacy:false}]});
 const result=await readBrowserConnections();expect(result.instances?.[1].outdated).toBe(false);expect(result.instances?.[0].outdated).toBe(false);
});
it("ignores stale app-version cache and permits a manual recheck",async()=>{
 localStorage.setItem(key,JSON.stringify({appVersion:'0.0.1',checks:{[brave.id]:{installedVersion:'0.4.1',availableVersion:'0.4.1',outdated:true}}}));
 const {readBrowserConnections}=await import("./extensionVersionCheck");
 expect((await readBrowserConnections(true)).instances?.[0].outdated).toBe(false);
});
it("shares pending diagnostics between the titlebar and assistant",async()=>{
 let resolve!:(value:unknown)=>void;vi.mocked(invoke).mockImplementation(()=>new Promise(r=>{resolve=r;}));
 const {readBrowserConnections}=await import("./extensionVersionCheck");
 const a=readBrowserConnections(),b=readBrowserConnections();expect(a).toBe(b);resolve(status);await a;expect(invoke).toHaveBeenCalledTimes(1);
});
