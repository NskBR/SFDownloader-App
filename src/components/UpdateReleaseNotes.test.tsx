import {cleanup,fireEvent,render,screen} from "@testing-library/react";
import {afterEach,beforeEach,expect,it,vi} from "vitest";
import {UpdateReleaseNotes} from "./UpdateReleaseNotes";
beforeEach(()=>{HTMLDialogElement.prototype.showModal=vi.fn(function(this:HTMLDialogElement){this.open=true;});HTMLDialogElement.prototype.close=vi.fn();});
afterEach(cleanup);
const update={available:true,latest_version:"1.1.0",release_notes:"## Novidades\n- Temas de jogos\n<script>unsafe()</script>"} as Parameters<typeof UpdateReleaseNotes>[0]["update"];
it("shows release notes as safe text and waits for explicit confirmation",()=>{
 const confirm=vi.fn(),cancel=vi.fn();render(<UpdateReleaseNotes update={update} onConfirm={confirm} onCancel={cancel}/>);
 expect(screen.getByRole("heading").textContent).toContain("1.1.0");
 expect(screen.getByLabelText("Notas da versão").textContent).toContain("Temas de jogos");
 expect(document.querySelector("dialog script")).toBeNull();expect(confirm).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole("button",{name:"Baixar e instalar"}));expect(confirm).toHaveBeenCalledOnce();
});
it("allows dismissal without downloading and handles missing notes",()=>{
 const confirm=vi.fn(),cancel=vi.fn();render(<UpdateReleaseNotes update={{...update,release_notes:null}} onConfirm={confirm} onCancel={cancel}/>);
 expect(screen.getByLabelText("Notas da versão").textContent).toContain("não possui notas");
 fireEvent.click(screen.getByRole("button",{name:"Agora não"}));expect(cancel).toHaveBeenCalledOnce();expect(confirm).not.toHaveBeenCalled();
});
