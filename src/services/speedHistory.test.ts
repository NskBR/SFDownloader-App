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

it('records actual progress and never invents percentages for old or unknown-size samples',async()=>{
 const {recordSpeed,readSpeedHistory,comparisonSpeedSamples}=await import('./speedHistory');
 recordSpeed({id:'a',status:'downloading',speed:100,downloaded:25,total:100} as DownloadProgress,10000);
 expect(readSpeedHistory()[0].points[0].progress).toBe(25);
 expect(comparisonSpeedSamples([{time:1,speed:10}])).toEqual([]);
});
it('averages measured percentage buckets with equal weight per download and preserves pauses',async()=>{
 const {comparisonSpeedSamples,averageProgressSpeeds}=await import('./speedHistory');
 const a=comparisonSpeedSamples([{time:0,speed:10,progress:0},{time:2000,speed:30,progress:0.1},{time:10000,speed:60,progress:50}]);
 expect(a).toEqual([{progress:0,speed:20,segment:0},{progress:50,speed:60,segment:1}]);
 const b=comparisonSpeedSamples([{time:900000,speed:40,progress:0},{time:902000,speed:100,progress:50}]);
 expect(averageProgressSpeeds([a,b])).toEqual([{progress:0,speed:30,segment:0},{progress:50,speed:80,segment:0}]);
});
