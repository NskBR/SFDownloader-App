import {it,expect} from 'vitest';
import {defaultSettings} from './settings';
import {resetPersonalization} from './resetPersonalization';
it('clears visual effects and restores appearance without changing download preferences or saved profiles',()=>{
 const result=resetPersonalization({...defaultSettings,rootDownloadFolder:'D:/Downloads',maxParallelDownloads:9,language:'en-US',fontFamily:'custom:test',navigationPosition:'bottom',sidebarAnimation:true,scrollInertia:true,windowBorder:{...defaultSettings.windowBorder!,enabled:true,effect:'neon'}});
 expect(result.rootDownloadFolder).toBe('D:/Downloads');expect(result.maxParallelDownloads).toBe(9);expect(result.language).toBe('en-US');
 expect(result.fontFamily).toBe(defaultSettings.fontFamily);expect(result.navigationPosition).toBe('left');expect(result.sidebarAnimation).toBe(false);expect(result.scrollInertia).toBe(false);expect(result.windowBorder?.enabled).toBe(false);
});
