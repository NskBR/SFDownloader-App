import {render,screen,fireEvent,cleanup} from "@testing-library/react";
import {it,expect,vi,afterEach} from "vitest";
import {BrowserConnectionsList} from "./BrowserConnectionsList";
afterEach(cleanup);
it("offers independent and bulk connection controls",()=>{
 const toggle=vi.fn(),all=vi.fn();
 const peers=[{id:"a",browserName:"Brave",version:"0.4.1",connected:true,outdated:false,legacy:false},{id:"b",browserName:"Firefox",version:"0.4.1",connected:false,disabled:true,outdated:false,legacy:false}];
 render(<BrowserConnectionsList instances={peers} onToggle={toggle} onToggleAll={all}/>);
 fireEvent.click(screen.getByRole("button",{name:"Desativar conexão com Brave"}));expect(toggle).toHaveBeenCalledWith(peers[0]);
 fireEvent.click(screen.getByRole("button",{name:"Ativar conexão com Firefox"}));expect(toggle).toHaveBeenCalledWith(peers[1]);
 fireEvent.click(screen.getByRole("button",{name:"Desativar todas"}));expect(all).toHaveBeenCalledWith(false);
 fireEvent.click(screen.getByRole("button",{name:"Ativar todas"}));expect(all).toHaveBeenCalledWith(true);
 expect(screen.getByText(/Desativada no aplicativo/)).toBeTruthy();
});
