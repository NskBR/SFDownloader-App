import {render,screen,fireEvent,cleanup,waitFor} from '@testing-library/react';
import {it,expect,vi,afterEach} from 'vitest';
import {BrowserIntegrationWizard} from './BrowserIntegrationWizard';
vi.mock('@tauri-apps/api/core',()=>({invoke:vi.fn(async(command:string)=>command==='browser_extension_status'?false:'C:/extension')}));
vi.mock('../services/downloadService',()=>({browserExtensionConnected:vi.fn(async()=>false),browserExtensionDiagnostics:vi.fn(async()=>({connected:false,listening:true,port:17831,error:null})),revealInFolder:vi.fn(),openFile:vi.fn()}));
afterEach(cleanup);
it('guides installation one step at a time with progress and back controls',async()=>{
 const close=vi.fn();render(<BrowserIntegrationWizard onClose={close}/>);
 expect(screen.getByRole('dialog')).toBeTruthy();expect(screen.getByRole('progressbar').getAttribute('value')).toBe('1');
 expect(screen.getByRole('button',{name:'Voltar'}).hasAttribute('disabled')).toBe(true);
 fireEvent.click(screen.getByRole('button',{name:'Continuar'}));
 expect(screen.getByRole('progressbar').getAttribute('value')).toBe('2');
 expect(screen.getByRole('button',{name:/Copiar/})).toBeTruthy();
 expect(screen.queryByRole('button',{name:/Abrir p/})).toBeNull();
 expect(screen.getByRole('button',{name:/Arrastar/})).toBeTruthy();
 fireEvent.click(screen.getByRole('button',{name:'Continuar'}));
 expect(screen.getByRole('progressbar').getAttribute('value')).toBe('3');
 await waitFor(()=>expect(screen.getByRole('status').textContent).toContain('Aguardando'));
 fireEvent.click(screen.getByRole('button',{name:/Concluir/}));expect(close).toHaveBeenCalledOnce();
});
it('uses Firefox installation instructions without developer mode',async()=>{
 render(<BrowserIntegrationWizard onClose={()=>{}}/>);
 fireEvent.click(screen.getByRole('button',{name:/Firefox/}));
 fireEvent.click(screen.getByRole('button',{name:'Continuar'}));
 expect(screen.queryByRole('button',{name:/Abrir p/})).toBeNull();
 expect(screen.getByRole('button',{name:'Instalar no Firefox'})).toBeTruthy();
});
