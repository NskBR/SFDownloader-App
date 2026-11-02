import {cleanup,render,screen} from "@testing-library/react";
import {afterEach,expect,it} from "vitest";
import {UpdateDownloadStats,updateTime} from "./UpdateDownloadStats";
afterEach(cleanup);
it("shows downloaded and total size, speed and calculated remaining time",()=>{
 render(<UpdateDownloadStats downloaded={50*1024**2} total={100*1024**2} speed={2*1024**2}/>);
 expect(screen.getByText("50.0 MB / 100.0 MB")).toBeTruthy();expect(screen.getByText("2.0 MB/s")).toBeTruthy();expect(screen.getByText("25s")).toBeTruthy();
});
it("does not invent a total or ETA when the server supplies no size or speed",()=>{
 const {container}=render(<UpdateDownloadStats downloaded={1024} total={null} speed={0}/>);
 expect(screen.getByText("1.0 KB / —")).toBeTruthy();expect(container.textContent).not.toMatch(/NaN|Infinity/);
});
it("clamps completed transfers to zero remaining and formats long estimates",()=>{
 render(<UpdateDownloadStats downloaded={200} total={100} speed={10}/>);expect(screen.getByText("0s")).toBeTruthy();
 expect(updateTime(61)).toBe("1min 1s");expect(updateTime(3660)).toBe("1h 1min");
});
