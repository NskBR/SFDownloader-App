import {defaultSettings,type AppSettings} from "./settings";
export function resetPersonalization(settings:AppSettings):AppSettings {
 const defaults=JSON.parse(JSON.stringify(defaultSettings)) as AppSettings;
 return {...settings,theme:defaults.theme,fontFamily:defaults.fontFamily,testTheme:defaults.testTheme,gameTheme:'none',localThemeId:undefined,themeWallpapers:{},cssThemesEnabled:false,defaultThemeInitialized:true,uiScale:defaults.uiScale,accentColor:defaults.accentColor,appColor:defaults.appColor,interfaceGradient:defaults.interfaceGradient,rgbConfig:defaults.rgbConfig,accentRgbConfig:defaults.accentRgbConfig,sidebarAnimation:false,scrollInertia:false,scrollInertiaStrength:'soft',scrollbarStyle:'default',windowControlsStyle:'default',navigationPosition:'left',navigationLabels:true,iconStyle:defaults.iconStyle,windowBorder:defaults.windowBorder};
}
