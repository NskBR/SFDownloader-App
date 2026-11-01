import {cleanup,render,screen,waitFor} from "@testing-library/react";
import {afterEach,beforeEach,expect,it,vi} from "vitest";
const mocks=vi.hoisted(()=>({getDownload:vi.fn(),extractionStatus:vi.fn()}));
vi.mock("../services/downloadService",()=>mocks);
vi.mock("@tauri-apps/api/event",()=>({listen:vi.fn(async()=>()=>{})}));
vi.mock("@tauri-apps/api/window",()=>({getCurrentWindow:()=>({show:async()=>{},setFocus:async()=>{},innerSize:async()=>({width:440,height:220}),scaleFactor:async()=>1,setSize:async()=>{},close:async()=>{},minimize:async()=>{}})}));
import {DownloadWindow} from "./DownloadWindow";
beforeEach(()=>vi.clearAllMocks());afterEach(cleanup);
it("shows details without waiting for extraction status",async()=>{
 mocks.extractionStatus.mockReturnValue(new Promise(()=>{}));
 mocks.getDownload.mockResolvedValue({id:"one",fileName:"example.zip",fileSize:1024,totalDownloaded:1024,speedCurrent:0,speedAverage:100,status:"completed",originalUrl:"https://example.com/file.zip",finalPath:"C:/Downloads/example.zip",extension:"zip",createdAt:"2026-11-01T00:00:00Z",completedAt:"2026-11-01T00:00:01Z"});
 render(<DownloadWindow downloadId="one"/>);
 await waitFor(()=>expect(screen.getByText("example.zip")).toBeTruthy());
 expect(mocks.getDownload).toHaveBeenCalledWith("one");
});
it("shows a structured loading state and reports lookup failures",async()=>{
 let reject!:(cause:Error)=>void;
 mocks.extractionStatus.mockResolvedValue(null);
 mocks.getDownload.mockReturnValue(new Promise((_,fail)=>{reject=fail;}));
 const {container}=render(<DownloadWindow downloadId="one"/>);
 expect(container.querySelector(".dw-loading-preview")).toBeTruthy();
 reject(new Error("Database unavailable"));
 expect((await screen.findByRole("alert")).textContent).toContain("Database unavailable");
});
