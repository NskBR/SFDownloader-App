import {afterEach,expect,it,vi} from "vitest";
const mocks=vi.hoisted(()=>({check:vi.fn(async()=>({available:false}))}));
vi.mock("./downloadService",()=>({checkForUpdates:mocks.check,UPDATE_CHECKED_EVENT:"test-update-checked"}));
import {watchUpdates} from "./updatePolling";
afterEach(()=>{vi.useRealTimers();vi.clearAllMocks();});
it("checks immediately and every 60 seconds, accepts manual results and cleans up",()=>{
 vi.useFakeTimers();const receive=vi.fn();const stop=watchUpdates(receive);
 expect(mocks.check).toHaveBeenCalledTimes(1);
 vi.advanceTimersByTime(59_999);expect(mocks.check).toHaveBeenCalledTimes(1);
 vi.advanceTimersByTime(1);expect(mocks.check).toHaveBeenCalledTimes(2);
 window.dispatchEvent(new CustomEvent("test-update-checked",{detail:{available:true,latest_version:"1.2.0"}}));
 expect(receive).toHaveBeenCalledWith(expect.objectContaining({latest_version:"1.2.0"}));
 stop();vi.advanceTimersByTime(60_000);expect(mocks.check).toHaveBeenCalledTimes(2);
});
