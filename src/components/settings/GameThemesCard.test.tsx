import {act,cleanup,fireEvent,render,screen,waitFor} from "@testing-library/react";
import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
vi.mock("@tauri-apps/api/core",()=>({invoke:vi.fn(async(command:string)=>command==="installed_game_themes"?[]:undefined)}));
const mocks=vi.hoisted(()=>({validate:vi.fn()}));
vi.mock("../../services/testThemes",()=>({validateTestTheme:mocks.validate}));
import {GameThemesCard} from "./GameThemesCard";
beforeEach(()=>{vi.clearAllMocks();mocks.validate.mockResolvedValue(undefined);});afterEach(cleanup);
describe("Game themes",()=>{
 it("applies CS2 by click without exposing a CSS editor",async()=>{
  const select=vi.fn();render(<GameThemesCard selected="none" onSelect={select}/>);
  expect(screen.getByRole("heading",{name:/Temas de jogos|Game themes/})).toBeTruthy();expect(screen.queryByRole("textbox")).toBeNull();
  fireEvent.click(screen.getByRole("button",{name:/Aplicar CS2|Apply CS2/}));
  await waitFor(()=>expect(select).toHaveBeenCalledWith("cs2"));
  expect(mocks.validate).toHaveBeenCalledWith(expect.any(String),"builtin:cs2");
 });
 it("preserves the current selection when a theme cannot be loaded",async()=>{
  const select=vi.fn();mocks.validate.mockRejectedValue(new Error("Wallpaper unavailable"));
  render(<GameThemesCard selected="cyberpunk" onSelect={select}/>);
  fireEvent.click(screen.getByRole("button",{name:/Aplicar CS2|Apply CS2/}));
  await screen.findByRole("alert");expect(select).not.toHaveBeenCalled();
 });
 it("disables the game theme without erasing the CSS editor settings",()=>{
  const select=vi.fn();render(<GameThemesCard selected="cs2" onSelect={select}/>);
  fireEvent.click(screen.getByRole("button",{name:/Desativar tema|Disable game/}));expect(select).toHaveBeenCalledWith("none");
 });
});

it.each([["Star Citizen","star-citizen"],["God of War Ragnar\u00f6k","god-of-war-ragnarok"]])("applies %s directly from its compact card",async(name,id)=>{
 const select=vi.fn();render(<GameThemesCard selected="none" onSelect={select}/>);
 const card=screen.getByRole("button",{name:new RegExp(`Apply ${name}|Aplicar ${name}`)});
 expect(card.querySelector("img")).toBeTruthy();fireEvent.click(card);
 await waitFor(()=>expect(select).toHaveBeenCalledWith(id));
 expect(mocks.validate).toHaveBeenCalledWith(expect.any(String),`builtin:${id}`);
});

it("blocks rapid switches for one second without adding a layout row",async()=>{
 vi.useFakeTimers();
 try {
  const select=vi.fn();render(<GameThemesCard selected="none" onSelect={select}/>);
  const cs2=screen.getByRole("button",{name:/Aplicar CS2|Apply CS2/});
  const star=screen.getByRole("button",{name:/Aplicar Star Citizen|Apply Star Citizen/});
  await act(async()=>{fireEvent.click(cs2);});
  expect(select).toHaveBeenCalledTimes(1);expect(star.hasAttribute("disabled")).toBe(true);
  fireEvent.click(star);expect(select).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("status").textContent).toContain("1s");
  expect(screen.getByRole("status").closest(".cfg-card-subtitle")).not.toBeNull();
  act(()=>vi.advanceTimersByTime(1000));expect(star.hasAttribute("disabled")).toBe(false);
  await act(async()=>{fireEvent.click(star);});expect(select).toHaveBeenLastCalledWith("star-citizen");
 }finally{cleanup();vi.useRealTimers();}
});
