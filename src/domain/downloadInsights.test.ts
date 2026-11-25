import {it,expect} from 'vitest';
import {downloadInsights} from './downloadInsights';
import type {DownloadTask} from './download';
const now=new Date(2026,10,24,12);
const task=(id:string,patch:Partial<DownloadTask>={})=>({id,fileName:'movie.mp4',extension:'mp4',status:'completed',totalDownloaded:100,completedAt:new Date(2026,10,24,10).toISOString(),originalUrl:'https://www.example.com/file',...patch} as DownloadTask);
it('uses completed dates and retained bytes without counting failed tasks as completions',()=>{
 const data=downloadInsights([task('1'),task('2',{status:'failed'}),task('3',{completedAt:new Date(2026,9,1).toISOString()})],14,now);
 expect(data.daily.reduce((n,d)=>n+d.count,0)).toBe(1);expect(data.daily[data.daily.length-1].bytes).toBe(100);expect(data.completed).toBe(2);expect(data.failed).toBe(1);expect(data.hosts).toEqual([{name:'example.com',count:2}]);
});
it('ignores invalid completion dates, groups file types and handles empty data',()=>{
 const data=downloadInsights([task('1',{completedAt:'invalid',extension:'.MP3'}),task('2',{status:'paused'}),task('3',{status:'pending'})],30,now);
 expect(data.daily.every(d=>d.count===0)).toBe(true);expect(data.types[0]).toEqual({name:'MP3',count:1});expect(data.paused).toBe(1);expect(data.queued).toBe(1);expect(downloadInsights([],14,now).daily).toHaveLength(14);
});
