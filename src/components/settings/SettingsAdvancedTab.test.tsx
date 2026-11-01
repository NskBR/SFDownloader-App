import {cleanup,fireEvent,render,screen} from "@testing-library/react";
import {afterEach,expect,it,vi} from "vitest";
const mocks=vi.hoisted(()=>({check:vi.fn()}));
vi.mock("../../services/downloadService",()=>({checkForUpdates:mocks.check}));
import {SettingsAdvancedTab} from "./SettingsAdvancedTab";
import {ptBR} from "../../i18n/locales/pt-BR";
afterEach(cleanup);
const props={t:ptBR,cssThemesEnabled:false,onCssThemesEnabledChange:vi.fn(),launchOnStartup:false,onLaunchOnStartupChange:vi.fn(),onOpenBrowserIntegration:vi.fn(),onOpenDebugWindow:vi.fn(),onExportPreferences:vi.fn(),onImportPreferences:vi.fn(),onConfigureGlobalSchedule:vi.fn()};
it("shows the manual check result without starting an installation",async()=>{
 mocks.check.mockResolvedValue({available:true,latest_version:"1.2.0"});render(<SettingsAdvancedTab {...props}/>);
 fireEvent.click(screen.getByRole("button",{name:"Consultar atualização"}));
 expect((await screen.findByRole("status")).textContent).toContain("1.2.0");
});
it("reports a connection error instead of saying the app is up to date",async()=>{
 mocks.check.mockRejectedValue(new Error("offline"));render(<SettingsAdvancedTab {...props}/>);
 fireEvent.click(screen.getByRole("button",{name:"Consultar atualização"}));
 expect((await screen.findByRole("alert")).textContent).toContain("Não foi possível consultar");
});
