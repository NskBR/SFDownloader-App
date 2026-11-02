import {forwardRef,useImperativeHandle} from "react";
import {cleanup,fireEvent,render,screen} from "@testing-library/react";
import {afterEach,beforeEach,expect,it,vi} from "vitest";
import {animatedIcon} from "./animatedIcon";
const start=vi.fn(),stop=vi.fn();let reduced=false;
const Source=forwardRef<{startAnimation:()=>void;stopAnimation:()=>void},{size?:number}>(({size},ref)=>{
 useImperativeHandle(ref,()=>({startAnimation:start,stopAnimation:stop}));return <svg width={size} height={size}/>;
});
const Icon=animatedIcon(Source,"test");
beforeEach(()=>{vi.clearAllMocks();reduced=false;vi.stubGlobal("matchMedia",()=>({get matches(){return reduced;},addEventListener:vi.fn(),removeEventListener:vi.fn()}));});
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
it("animates from the whole button even when app transitions are disabled",()=>{
 render(<div className="sidebar--no-animation"><button>Download <Icon size={18}/></button></div>);
 const button=screen.getByRole("button");fireEvent.mouseEnter(button);expect(start).toHaveBeenCalledOnce();
 fireEvent.mouseLeave(button);expect(stop).toHaveBeenCalledOnce();expect(button.querySelector("svg")?.getAttribute("width")).toBe("18");
});
it("supports keyboard focus without cancelling hover until the pointer leaves",()=>{
 render(<button>Settings <Icon/></button>);const button=screen.getByRole("button");
 button.focus();expect(start).toHaveBeenCalledOnce();fireEvent.mouseEnter(button);fireEvent.focusOut(button);expect(stop).not.toHaveBeenCalled();
 fireEvent.mouseLeave(button);expect(stop).toHaveBeenCalledOnce();
});
it("keeps disabled controls and reduced-motion preferences still",()=>{
 reduced=true;const {rerender}=render(<button>Settings <Icon/></button>);fireEvent.mouseEnter(screen.getByRole("button"));expect(start).not.toHaveBeenCalled();
 reduced=false;rerender(<button disabled>Settings <Icon/></button>);fireEvent.mouseLeave(screen.getByRole("button"));fireEvent.mouseEnter(screen.getByRole("button"));expect(start).not.toHaveBeenCalled();
});
