import {beforeEach,it,expect,vi} from 'vitest';
import type {DownloadProgress} from '../domain/download';
beforeEach(()=>{localStorage.clear();vi.resetModules();});
it('averages simultaneous downloads without summing their rates or filling gaps',async()=>{
 const {averageSpeedSamples}=await import('./speedHistory');
 expect(averageSpeedSamples([{id:'a',points:[{time:2,speed:10},{time:4,speed:20}]},{id:'b',points:[{time:2,speed:30}]}])).toEqual([{time:2,speed:20},{time:4,speed:20}]);
});
it('throttles samples, rejects inactive and invalid values and clears retained data',async()=>{
 const {recordSpeed,readSpeedHistory,clearSpeedHistory}=await import('./speedHistory');
 const p={id:'a',status:'downloading',speed:100} as DownloadProgress;
 recordSpeed(p,10000);recordSpeed({...p,speed:900},10100);recordSpeed({...p,status:'paused'},12000);recordSpeed({...p,speed:NaN},12000);
 expect(readSpeedHistory()[0].points).toEqual([{time:10000,speed:100}]);await clearSpeedHistory();expect(readSpeedHistory()).toEqual([]);
});

it('keeps more than six downloads and separates samples at a month boundary',async()=>{
 const {recordSpeed,readSpeedHistory,speedMonth}=await import('./speedHistory');
 const january=new Date(2026,0,31,23,59,50).getTime(),february=new Date(2026,1,1,0,0,2).getTime();
 for(let i=0;i<40;i++)recordSpeed({id:String(i),status:'downloading',speed:100+i} as DownloadProgress,january);
 recordSpeed({id:'0',status:'downloading',speed:200} as DownloadProgress,february);
 const rows=readSpeedHistory();expect(rows).toHaveLength(41);
 expect(rows.filter(r=>r.month===speedMonth(january))).toHaveLength(40);expect(rows.filter(r=>r.month===speedMonth(february))).toHaveLength(1);
});
