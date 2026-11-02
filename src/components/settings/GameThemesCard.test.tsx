import {act,cleanup,fireEvent,render,screen,waitFor} from "@testing-library/react";
import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
vi.mock("@tauri-apps/api/core",()=>({invoke:vi.fn(async(command:string)=>command==="installed_game_themes"?[]:undefined)}));
const mocks=vi.hoisted(()=>({validate:vi.fn()}));
vi.mock("../../services/testThemes",()=>({validateTestTheme:mocks.validate,invalidateGameThemeImages:vi.fn()}));
import {invoke} from "@tauri-apps/api/core";
vi.mock("../../services/themeCatalog",()=>({cachedThemeCatalog:()=>null,loadThemeCatalog:()=>invoke("installed_game_themes"),markThemeDownloaded:vi.fn()}));
import {GameThemesCard} from "./GameThemesCard";
beforeEach(()=>{vi.clearAllMocks();vi.mocked(invoke).mockImplementation(async(command:string)=>command==="installed_game_themes"?[]:undefined as any);mocks.validate.mockResolvedValue(undefined);});afterEach(cleanup);

it("shows only four themes until expanded, and can collapse again",async()=>{
 render(<GameThemesCard selected="none" onSelect={vi.fn()}/>);
 expect(screen.queryByRole("button",{name:/Apply Minecraft|Aplicar Minecraft/})).toBeNull();
 fireEvent.click(screen.getByRole("button",{name:/Mostrar todos|Show all/}));
 expect(await screen.findByRole("button",{name:/Apply Minecraft|Aplicar Minecraft/})).toBeTruthy();
 fireEvent.click(screen.getByRole("button",{name:/Mostrar menos|Show fewer/}));
 expect(screen.queryByRole("button",{name:/Apply Minecraft|Aplicar Minecraft/})).toBeNull();
});

it("deletes a downloaded active theme and returns to normal appearance",async()=>{
 vi.mocked(invoke).mockImplementation(async(command:string)=>command==="installed_game_themes"?["cs2"]:undefined as any);
 const select=vi.fn();render(<GameThemesCard selected="cs2" onSelect={select}/>);
 fireEvent.click(await screen.findByRole("button",{name:/Apagar tema Counter|Delete theme Counter/}));
 await waitFor(()=>expect(invoke).toHaveBeenCalledWith("delete_game_theme",{id:"cs2"}));
 await waitFor(()=>expect(select).toHaveBeenCalledWith("none"));
 expect(screen.queryByRole("button",{name:/Apagar tema Counter|Delete theme Counter/})).toBeNull();
});

it("does not offer Sarah House in the official catalog",()=>{
 render(<GameThemesCard selected="none" onSelect={vi.fn()}/>);
 expect(screen.queryByText("Sarah's House")).toBeNull();
});

it("changes from Baryon to Hinata inside the single Naruto card",async()=>{
 const select=vi.fn();render(<GameThemesCard selected="naruto" wallpapers={{naruto:"naruto-baryon"}} onSelect={select}/>);
 fireEvent.click(screen.getByRole("button",{name:/Mostrar todos|Show all/}));
 fireEvent.click(await screen.findByRole("button",{name:/Próximo wallpaper Naruto|Next wallpaper Naruto/}));
 await waitFor(()=>expect(select).toHaveBeenCalledWith("naruto","hinata"));
 expect(invoke).toHaveBeenCalledWith("download_game_theme",{id:"hinata"});
 expect(mocks.validate).toHaveBeenCalledWith(expect.stringContaining("#c6b9f0"),"builtin:hinata");
 expect(screen.queryByRole("button",{name:/^Aplicar Hinata|^Apply Hinata/})).toBeNull();
});
describe("Custom themes",()=>{
 it("applies CS2 by click without exposing a CSS editor",async()=>{
  const select=vi.fn();render(<GameThemesCard selected="none" onSelect={select}/>);
  expect(screen.getByRole("heading",{name:/Temas personalizados|Custom themes/})).toBeTruthy();expect(screen.queryByRole("textbox")).toBeNull();
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
  fireEvent.click(screen.getByRole("button",{name:/Desativar tema|Disable custom/}));expect(select).toHaveBeenCalledWith("none");
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
