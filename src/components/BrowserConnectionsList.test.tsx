import {render,screen,cleanup,fireEvent} from '@testing-library/react';
import {afterEach,it,expect,vi} from 'vitest';
import {BrowserConnectionsList} from './BrowserConnectionsList';
afterEach(cleanup);
it('shows independent current, outdated and unverified connections',()=>{
 render(<BrowserConnectionsList instances={[
 {id:'1',browserName:'Brave',version:'0.4.1',connected:true,legacy:false,outdated:false},
 {id:'2',browserName:'Firefox',version:'0.4.0',connected:true,legacy:false,outdated:true},
 {id:'3',browserName:'Firefox',version:null,connected:true,legacy:true,outdated:false},
 ]}/>);
 expect(screen.getByText('Atualizada')).toBeTruthy();expect(screen.getByText('Desatualizada')).toBeTruthy();expect(screen.getByText('Não verificada')).toBeTruthy();expect(screen.getByText('Conexão legada · Conectada')).toBeTruthy();
});

it('offers a separate connection refresh even when no browsers are listed',()=>{
 const refresh=vi.fn();const view=render(<BrowserConnectionsList instances={[]} onRefresh={refresh}/>);
 fireEvent.click(screen.getByRole('button',{name:'Rever conexões'}));expect(refresh).toHaveBeenCalledOnce();
 view.rerender(<BrowserConnectionsList instances={[]} onRefresh={refresh} refreshing/>);
 expect(screen.getByRole('button',{name:'Consultando…'}).hasAttribute('disabled')).toBe(true);
});
