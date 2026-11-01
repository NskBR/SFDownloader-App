import {expect,it,vi} from "vitest";
const mocks=vi.hoisted(()=>({invoke:vi.fn()}));
vi.mock("@tauri-apps/api/core",()=>({invoke:mocks.invoke}));
import {checkForUpdates,UPDATE_CHECKED_EVENT} from "./downloadService";
it("deduplicates simultaneous manual and automatic requests and broadcasts success",async()=>{
 let resolve!:(value:unknown)=>void;mocks.invoke.mockReturnValue(new Promise(done=>{resolve=done;}));
 const listener=vi.fn();window.addEventListener(UPDATE_CHECKED_EVENT,listener);
 const first=checkForUpdates(),second=checkForUpdates();expect(first).toBe(second);
 resolve({available:true,check_succeeded:true,latest_version:"2.0.0"});await first;
 expect(mocks.invoke).toHaveBeenCalledOnce();expect(listener).toHaveBeenCalledOnce();window.removeEventListener(UPDATE_CHECKED_EVENT,listener);
});
it("does not report up-to-date when the backend could not contact GitHub",async()=>{
 mocks.invoke.mockResolvedValue({available:false,check_succeeded:false});
 await expect(checkForUpdates()).rejects.toThrow("unavailable");
});
