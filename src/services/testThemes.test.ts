import {invoke} from "@tauri-apps/api/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { compileThemeCss, themeImageIds, applyTestTheme } from "./testThemes";
import { defaultTestTheme } from "../domain/settings";
vi.mock("@tauri-apps/api/core",()=>({invoke:vi.fn()}));
const id="a".repeat(64);
const data="data:image/png;base64,aGVsbG8=";
beforeEach(()=>{document.documentElement.className="window-type-main";document.documentElement.removeAttribute("data-test-theme");document.getElementById("sf-test-theme-css")?.remove();});
describe("restricted test themes",()=>{
  it("scopes cosmetic CSS to the main window and resolves imported images",()=>{
    const compiled=compileThemeCss(`.sidebar {background-image:url("theme:${id}");background-size:cover;color:var(--text)} .download-card:hover {border-color:#ffff00}`,{[id]:data});
    expect(compiled).toContain('html.window-type-main[data-test-theme="true"] .sidebar');
    expect(compiled).toContain(data);expect(compiled).toContain("var(--text)");
    expect(document.querySelectorAll('style[media="not all"]').length).toBe(0);
    expect(themeImageIds(`url(theme:${id}) url(theme:${id})`)).toEqual([id]);
  });
  it.each([
    '@import "https://example.com/x.css";',
    '.sidebar { background:url(https://example.com/tracker.png) }',
    '.sidebar { background:url(file:///C:/secret) }',
    '.sidebar { display:none }',
    '.window-frame { position:fixed; z-index:999999 }',
    '.test-themes-card { opacity:0 }',
    '.sidebar * { pointer-events:none }',
    ':root { --bg-fill:red }',
    '.sidebar { background:var(--unknown) }',
    '.sidebar {background-image:image-set("external.png" 1x)}',
    '.sidebar {color: red} </style>',
  ])("rejects external resources and structural rules: %s",css=>{expect(()=>compileThemeCss(css,{})).toThrow();});
  it("refuses missing image references",()=>{expect(()=>compileThemeCss(`.sidebar{background:url(theme:${id})}`,{})).toThrow();});
  it("keeps the default untouched and removes all active custom rules on reset",async()=>{
    await applyTestTheme({...defaultTestTheme,enabled:true,css:'.sidebar {border-color:red}'});
    expect(document.documentElement.dataset.testTheme).toBe("true");
    expect(document.getElementById("sf-test-theme-css")).toBeTruthy();
    await applyTestTheme({...defaultTestTheme});
    expect(document.documentElement.hasAttribute("data-test-theme")).toBe(false);
    expect(document.getElementById("sf-test-theme-css")).toBeNull();
  });
  it("shares the background with download windows without applying user selectors there",async()=>{
    document.documentElement.className="window-type-media";
    await applyTestTheme({...defaultTestTheme,enabled:true,css:'.sidebar{color:red}'});
    expect(document.getElementById("sf-test-theme-css")?.textContent).toBe("");
    expect(document.documentElement.dataset.testTheme).toBe("true");
    await applyTestTheme({...defaultTestTheme});
  });
});

it("loads the cached wallpaper as a short owned URL and releases it on reset",async()=>{
 document.documentElement.className="window-type-main";
 const create=URL.createObjectURL,revoke=URL.revokeObjectURL;
 const make=vi.fn(()=>"blob:sf-builtin-wallpaper");const release=vi.fn();
 URL.createObjectURL=make;URL.revokeObjectURL=release;
 vi.mocked(invoke).mockResolvedValue(data);
 vi.stubGlobal("Image",class {naturalWidth=10;naturalHeight=10;onload:(()=>void)|null=null;set src(_value:string){queueMicrotask(()=>this.onload?.());}});
 try {
  await applyTestTheme({...defaultTestTheme,preset:"cyberpunk",enabled:true,imageId:"builtin:cyberpunk"});
  expect(document.documentElement.dataset.testPreset).toBe("cyberpunk");
  expect(document.documentElement.style.getPropertyValue("--test-theme-image")).toContain("blob:sf-builtin-wallpaper");
  expect(make).toHaveBeenCalledOnce();
  await applyTestTheme({...defaultTestTheme});
  expect(document.documentElement.hasAttribute("data-test-preset")).toBe(false);
  expect(release).toHaveBeenCalledWith("blob:sf-builtin-wallpaper");
 } finally {URL.createObjectURL=create;URL.revokeObjectURL=revoke;vi.unstubAllGlobals();}
});

it.each(["window-type-confirmation","window-type-live","window-type-media","window-type-integration","window-type-debug"])("shares game theme state with %s while keeping user CSS out",async type=>{
 document.documentElement.className=type;
 await applyTestTheme({...defaultTestTheme,preset:"cs2",enabled:true,css:".sidebar{color:red}"});
 expect(document.documentElement.dataset.testTheme).toBe("true");expect(document.documentElement.dataset.testPreset).toBe("cs2");
 expect(document.getElementById("sf-test-theme-css")?.textContent).toBe("");
 await applyTestTheme({...defaultTestTheme});
});

it("keeps the current theme visible while the next wallpaper loads",async()=>{
 await applyTestTheme({...defaultTestTheme});
 await applyTestTheme({...defaultTestTheme,enabled:true,preset:"cs2",css:".sidebar{color:red}"});
 let resolveFetch!:(value:unknown)=>void;
 vi.mocked(invoke).mockImplementation(()=>new Promise(resolve=>{resolveFetch=resolve;}));
 vi.stubGlobal("Image",class {naturalWidth=10;naturalHeight=10;onload:(()=>void)|null=null;set src(_value:string){queueMicrotask(()=>this.onload?.());}});
 const create=URL.createObjectURL,revoke=URL.revokeObjectURL;
 URL.createObjectURL=vi.fn(()=>"blob:next-theme");URL.revokeObjectURL=vi.fn();
 try {
  const pending=applyTestTheme({...defaultTestTheme,enabled:true,preset:"god-of-war-ragnarok",imageId:"builtin:god-of-war-ragnarok"});
  expect(document.documentElement.dataset.testPreset).toBe("cs2");
  expect(document.getElementById("sf-test-theme-css")?.textContent).toContain("color:red");
  resolveFetch(data);
  await pending;
  expect(document.documentElement.dataset.testPreset).toBe("god-of-war-ragnarok");
  await applyTestTheme({...defaultTestTheme});
 }finally{URL.createObjectURL=create;URL.revokeObjectURL=revoke;vi.unstubAllGlobals();}
});

it("uses the document CSP nonce for both parsing and applying theme CSS",async()=>{
 const trusted=document.createElement("style");trusted.nonce="production-test-nonce";document.head.append(trusted);
 const append=document.head.append.bind(document.head);const nonces:string[]=[];
 const spy=vi.spyOn(document.head,"append").mockImplementation((...nodes)=>{for(const node of nodes)if(node instanceof HTMLStyleElement)nonces.push(node.nonce ?? "");append(...nodes);});
 try {
  await applyTestTheme({...defaultTestTheme,enabled:true,css:".sidebar{color:#abcdef}"});
  expect(nonces.length).toBeGreaterThanOrEqual(2);
  expect(nonces.every(n=>n==="production-test-nonce")).toBe(true);
  expect((document.getElementById("sf-test-theme-css") as HTMLStyleElement).nonce).toBe("production-test-nonce");
  await applyTestTheme({...defaultTestTheme});
 }finally{spy.mockRestore();trusted.remove();}
});
