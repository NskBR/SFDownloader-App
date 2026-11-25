import {render,screen,fireEvent,cleanup,waitFor} from '@testing-library/react';
import {it,expect,vi,afterEach} from 'vitest';
import {invoke} from '@tauri-apps/api/core';
import {BrowserIntegrationWizard} from './BrowserIntegrationWizard';
vi.mock('@tauri-apps/api/core',()=>({invoke:vi.fn(async(command:string)=>command==='browser_extension_diagnostics'?{connected:false,instances:[]}:command==='browser_extension_status'?false:'C:/extension')}));
vi.mock('../services/downloadService',()=>({browserExtensionConnected:vi.fn(async()=>false),browserExtensionDiagnostics:vi.fn(async()=>({connected:false,listening:true,port:17831,error:null})),revealInFolder:vi.fn(),openFile:vi.fn()}));
afterEach(cleanup);
it('guides installation one step at a time with progress and back controls',async()=>{
 const close=vi.fn();render(<BrowserIntegrationWizard onClose={close}/>);
 expect(screen.getByRole('dialog')).toBeTruthy();expect(screen.getByRole('progressbar').getAttribute('value')).toBe('1');
 expect(screen.getByRole('progressbar').getAttribute('max')).toBe('2');
 fireEvent.click(screen.getByRole('button',{name:'Continuar'}));
 expect(screen.getByRole('progressbar').getAttribute('value')).toBe('2');
 expect(screen.getByRole('button',{name:/Copiar/})).toBeTruthy();
 expect(screen.queryByRole('button',{name:/Abrir p/})).toBeNull();
 expect(screen.getByRole('button',{name:/Arrastar/})).toBeTruthy();
 fireEvent.click(screen.getByRole('button',{name:'Voltar às conexões'}));
 expect(screen.getByRole('progressbar').getAttribute('value')).toBe('1');
 expect(screen.getByRole('region',{name:'Navegadores conectados'})).toBeTruthy();
 fireEvent.click(screen.getByRole('button',{name:'Continuar'}));
 expect(screen.queryByText('Confira a conexão')).toBeNull();
 fireEvent.click(screen.getByRole('button',{name:/Concluir/}));expect(close).toHaveBeenCalledOnce();
});
it('uses Firefox installation instructions without developer mode',async()=>{
 render(<BrowserIntegrationWizard onClose={()=>{}}/>);
 fireEvent.click(screen.getByRole('button',{name:/Firefox/}));
 fireEvent.click(screen.getByRole('button',{name:'Continuar'}));
 expect(screen.queryByRole('button',{name:/Abrir p/})).toBeNull();
 expect(screen.getByRole('button',{name:'Instalar no Firefox'})).toBeTruthy();
});

it('takes an outdated Chromium instance directly to the drag installation step',async()=>{
 vi.mocked(invoke).mockImplementation(async(command:string)=>command==='browser_extension_diagnostics'?{connected:true,availableVersion:'0.4.1',instances:[{id:'test-brave',browserName:'Brave',version:'0.4.0',connected:true,outdated:true,legacy:false}]} as any:'C:/extension');
 render(<BrowserIntegrationWizard onClose={()=>{}}/>);
 fireEvent.click(await screen.findByRole('button',{name:'Atualizar extensão do Brave'}));
 expect(screen.getByRole('progressbar').getAttribute('value')).toBe('2');expect(screen.getByRole('button',{name:/Arrastar extensão/})).toBeTruthy();
});
it('takes an outdated Firefox instance directly to Firefox installation',async()=>{
 vi.mocked(invoke).mockImplementation(async(command:string)=>command==='browser_extension_diagnostics'?{connected:true,availableVersion:'0.4.1',instances:[{id:'test-firefox',browserName:'Firefox',version:'0.4.0',connected:true,outdated:true,legacy:false}]} as any:'C:/extension');
 render(<BrowserIntegrationWizard onClose={()=>{}}/>);
 fireEvent.click(await screen.findByRole('button',{name:'Atualizar extensão do Firefox'}));
 expect(screen.getByRole('progressbar').getAttribute('value')).toBe('2');expect(screen.getByRole('button',{name:'Instalar no Firefox'})).toBeTruthy();
});

it('keeps unsigned XPI information out of browser selection and shows a compact notice only on installation',async()=>{
 vi.mocked(invoke).mockImplementation(async(command:string)=>{
  if(command==='get_firefox_xpi_path')throw new Error('A extensão Firefox 0.4.1 ainda aguarda o XPI assinado. A versão antiga não inclui os novos recursos.');
  return command==='browser_extension_diagnostics'?{connected:false,instances:[]} as any:'C:/extension';
 });
 render(<BrowserIntegrationWizard onClose={()=>{}}/>);
 fireEvent.click(screen.getByRole('button',{name:/Firefox/}));
 expect(screen.queryByRole('alert')).toBeNull();expect(screen.queryByText(/O pacote do Firefox aguarda assinatura/)).toBeNull();
 fireEvent.click(screen.getByRole('button',{name:'Continuar'}));
 expect(await screen.findByText(/O pacote do Firefox aguarda assinatura/)).toBeTruthy();
 expect(screen.queryByRole('alert')).toBeNull();expect(screen.getByRole('button',{name:'Instalar no Firefox'}).hasAttribute('disabled')).toBe(true);
});
