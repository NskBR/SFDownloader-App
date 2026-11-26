import {render,screen,waitFor,cleanup} from "@testing-library/react";
import {afterEach,it,expect,vi} from "vitest";
vi.mock('../services/speedHistory',async importOriginal=>({...await importOriginal<typeof import('../services/speedHistory')>(),readSpeedMonth:vi.fn(async()=>[{id:'one',points:[{time:0,speed:100,progress:0},{time:2000,speed:200,progress:50},{time:4000,speed:150,progress:100}]}]),listSpeedMonths:vi.fn(async()=>[])}));
import {DownloadSpeedChart} from './DownloadSpeedChart';
afterEach(cleanup);
it('compares by actual percentage instead of stretching wall clock timestamps',async()=>{
 const {container}=render(<DownloadSpeedChart tasks={[]}/>);
 await waitFor(()=>expect(screen.getByRole('img')).toBeTruthy());
 expect(screen.getByText('0%')).toBeTruthy();expect(screen.getByText('100%')).toBeTruthy();expect(container.querySelector('svg[role=img] path')?.getAttribute('d')).toContain('780,');
 expect(screen.getByText(/peso igual por download/)).toBeTruthy();
});
