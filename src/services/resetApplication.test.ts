import {beforeEach,it,expect,vi} from 'vitest';
const mocks=vi.hoisted(()=>({invoke:vi.fn(),save:vi.fn(settings=>settings)}));
vi.mock('@tauri-apps/api/core',()=>({invoke:mocks.invoke}));
vi.mock('./settingsStorage',()=>({normalizeSettings:(settings:unknown)=>settings,saveSettings:mocks.save}));
import {resetApplication} from './resetApplication';
beforeEach(()=>{localStorage.clear();vi.clearAllMocks();mocks.invoke.mockImplementation(async(command)=>command==='is_autostart_enabled'?true:undefined);});
it('resets counters and preferences while preserving in-flight payloads',async()=>{
 localStorage.setItem('sf_sidebar_width','250');localStorage.setItem('sf-downloader.sort_preference','size');localStorage.setItem('sf-downloader.confirmation-test','payload');
 const result=await resetApplication();
 expect(mocks.invoke).toHaveBeenCalledWith('reset_application_data');expect(mocks.invoke).toHaveBeenCalledWith('set_autostart',{enabled:false});
 expect(localStorage.getItem('sf_sidebar_width')).toBeNull();expect(localStorage.getItem('sf-downloader.sort_preference')).toBeNull();expect(localStorage.getItem('sf-downloader.confirmation-test')).toBe('payload');
 expect(result.navigationPosition).toBe('left');expect(result.rgbProfiles).toEqual([]);expect(mocks.save).toHaveBeenCalledOnce();
});
it('keeps preferences and restores autostart when backend reset fails',async()=>{
 localStorage.setItem('sf_sidebar_width','250');mocks.invoke.mockImplementation(async command=>{if(command==='reset_application_data')throw new Error('Database locked');return true;});
 await expect(resetApplication()).rejects.toThrow('Database locked');expect(mocks.save).not.toHaveBeenCalled();expect(localStorage.getItem('sf_sidebar_width')).toBe('250');expect(mocks.invoke).toHaveBeenLastCalledWith('set_autostart',{enabled:true});
});
