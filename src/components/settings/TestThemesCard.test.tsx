import {cleanup,fireEvent,render,screen,waitFor} from "@testing-library/react";
import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {defaultTestTheme} from "../../domain/settings";
const mocks=vi.hoisted(()=>({invoke:vi.fn(),open:vi.fn(),validate:vi.fn(),load:vi.fn()}));
vi.mock("@tauri-apps/api/core",()=>({invoke:mocks.invoke}));
vi.mock("@tauri-apps/plugin-dialog",()=>({open:mocks.open}));
vi.mock("../../services/testThemes",()=>({loadThemeImage:mocks.load,validateTestTheme:mocks.validate}));
import {TestThemesCard} from "./TestThemesCard";
beforeEach(()=>{vi.clearAllMocks();mocks.invoke.mockResolvedValue([]);mocks.validate.mockResolvedValue(undefined);mocks.load.mockResolvedValue("data:image/png;base64,dGVzdA==");});
afterEach(cleanup);
describe("test themes settings",()=>{
 it("keeps typed CSS unapplied until the user applies it",async()=>{
  const change=vi.fn();render(<TestThemesCard value={{...defaultTestTheme}} onChange={change}/>);
  fireEvent.change(screen.getByRole("textbox"),{target:{value:".sidebar {color:red}"}});
  expect(change).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button",{name:/Aplicar CSS|Apply CSS/}));
  await waitFor(()=>expect(change).toHaveBeenCalledWith(expect.objectContaining({enabled:true,css:".sidebar {color:red}"})));
 });
 it("does not save rejected CSS and keeps the recovery button usable",async()=>{
  const change=vi.fn();mocks.validate.mockRejectedValue(new Error("Blocked layout rule"));
  render(<TestThemesCard value={{...defaultTestTheme,enabled:true}} onChange={change}/>);
  fireEvent.change(screen.getByRole("textbox"),{target:{value:".sidebar {display:none}"}});
  fireEvent.click(screen.getByRole("button",{name:/Aplicar CSS|Apply CSS/}));
  await screen.findByRole("alert");expect(change).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button",{name:/Restaurar visual|Restore default/}));
  expect(change).toHaveBeenCalledWith(defaultTestTheme);
 });
 it("imports a local GIF without automatically enabling the experimental theme",async()=>{
  const image={id:"b".repeat(64),name:"background.gif",mime:"image/gif"};const change=vi.fn();
  mocks.open.mockResolvedValue("C:/Images/background.gif");mocks.invoke.mockImplementation((command:string)=>Promise.resolve(command==="list_theme_images"?[]:image));
  render(<TestThemesCard value={{...defaultTestTheme}} onChange={change}/>);
  fireEvent.click(screen.getByRole("button",{name:/Importar PNG|Import PNG/}));
  await waitFor(()=>expect(change).toHaveBeenCalledWith(expect.objectContaining({enabled:false,imageId:image.id})));
  expect(mocks.load).toHaveBeenCalledWith(image.id);
 });
});
