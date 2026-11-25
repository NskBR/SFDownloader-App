import {render,screen,fireEvent,cleanup} from '@testing-library/react';
import {it,expect,vi,afterEach} from 'vitest';
import {VirtualDownloadList} from './VirtualDownloadList';
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
it('mounts a bounded viewport from hundreds of downloads and reaches the final item',()=>{
 vi.stubGlobal('ResizeObserver',class {observe(){}disconnect(){}});
 const items=Array.from({length:439},(_,i)=>({id:String(i)}));
 const {container}=render(<VirtualDownloadList items={items} view="list" renderItem={item=><article key={item.id}>Download {item.id}</article>}/>);
 expect(container.querySelectorAll('article').length).toBeLessThan(20);expect(screen.getByText('Download 0')).toBeTruthy();expect(screen.queryByText('Download 438')).toBeNull();
 const viewport=container.firstElementChild as HTMLElement;viewport.scrollTop=438*112;fireEvent.scroll(viewport);
 expect(screen.getByText('Download 438')).toBeTruthy();expect(container.querySelectorAll('article').length).toBeLessThan(20);
});
it('resets the viewport after filtering so filtered results remain visible',()=>{
 vi.stubGlobal('ResizeObserver',class {observe(){}disconnect(){}});
 const items=Array.from({length:100},(_,i)=>({id:String(i)}));
 const renderItem=(item:{id:string})=><article key={item.id}>{item.id}</article>;
 const view=render(<VirtualDownloadList items={items} view="list" renderItem={renderItem}/>);
 const viewport=view.container.firstElementChild as HTMLElement;viewport.scrollTop=5000;fireEvent.scroll(viewport);
 view.rerender(<VirtualDownloadList items={[{id:'filtered'}]} view="list" renderItem={renderItem}/>);
 expect(viewport.scrollTop).toBe(0);expect(screen.getByText('filtered')).toBeTruthy();
});

it('keeps grid overscan to one row and does not rerender for movement inside the same range',()=>{
 vi.stubGlobal('ResizeObserver',class {observe(){}disconnect(){}});
 const items=Array.from({length:1000},(_,i)=>({id:String(i)}));
 const renderItem=vi.fn((item:{id:string})=><article key={item.id}>{item.id}</article>);
 const {container}=render(<VirtualDownloadList items={items} view="grid" renderItem={renderItem}/>);
 expect(container.querySelectorAll('article').length).toBeLessThanOrEqual(14);
 const viewport=container.firstElementChild as HTMLElement;const count=renderItem.mock.calls.length;
 viewport.scrollTop=1;fireEvent.scroll(viewport);expect(renderItem.mock.calls.length).toBe(count);
 viewport.scrollTop=499*110;fireEvent.scroll(viewport);expect(screen.getByText('999')).toBeTruthy();
 expect(container.querySelectorAll('article').length).toBeLessThanOrEqual(18);
});
