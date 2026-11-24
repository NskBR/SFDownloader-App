import {describe,it,expect} from 'vitest';
import {normalizeRgbConfig,normalizeRgbProfiles,defaultRgbConfig} from './rgbTheme';
import {normalizeSettings} from '../services/settingsStorage';

describe('RGB preferences',()=>{
  it('bounds imported values and rejects invalid colors',()=>{
    expect(normalizeRgbConfig({duration:-1,angle:999,colors:['red','#fff','url(x)'],reverse:'yes'})).toEqual({...defaultRgbConfig,duration:4,angle:360});
    expect(normalizeRgbConfig({duration:Infinity,colors:['#ffffff','#000000']})).toEqual({...defaultRgbConfig,colors:['#ffffff','#000000']});
  });
  it('keeps configuration and profiles when preferences are normalized',()=>{
    const config={colors:['#ff0000','#00ff00','#0000ff'],duration:12,angle:90,reverse:true};
    const settings=normalizeSettings({rgbConfig:config,rgbProfiles:[{name:'  Meu RGB  ',config}]},'pt-BR');
    expect(settings.rgbConfig).toEqual(config);
    expect(settings.rgbProfiles).toEqual([{name:'Meu RGB',config}]);
    expect(normalizeRgbProfiles(Array.from({length:20},()=>({name:'profile',config})))).toHaveLength(12);
  });
});
