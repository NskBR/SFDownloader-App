import {render,screen,waitFor,act,cleanup,fireEvent} from "@testing-library/react";
import {afterEach,it,expect,vi} from "vitest";
const mocks=vi.hoisted(()=>({listDownloads:vi.fn(),details:vi.fn(),resume:vi.fn(),pause:vi.fn(),receive:undefined as undefined|((event:{payload:unknown})=>void)}));
vi.mock('@tauri-apps/api/core',()=>({invoke:mocks.details}));
vi.mock('../services/downloadService',()=>({listDownloads:mocks.listDownloads,resumeDownload:mocks.resume,pauseDownload:mocks.pause}));
vi.mock('@tauri-apps/api/event',()=>({listen:vi.fn(async(_name:string,receive:(event:{payload:unknown})=>void)=>{mocks.receive=receive;return ()=>{};})}));
vi.mock('@tauri-apps/api/window',()=>({getCurrentWindow:()=>({show:async()=>{},setFocus:async()=>{},innerSize:async()=>({width:440,height:252}),scaleFactor:async()=>1,setSize:async()=>{},close:async()=>{},minimize:async()=>{}})}));
import {TorrentProgressWindow} from './TorrentProgressWindow';
afterEach(cleanup);
it('shows local reading rate and uses verification total instead of selected download size',async()=>{
 mocks.listDownloads.mockResolvedValue([{id:'one',fileName:'pack',fileSize:100,totalDownloaded:0,speedCurrent:0,status:'checking_files',finalPath:'C:/Downloads/pack',extension:'torrent',createdAt:'2026-11-25T00:00:00Z'}]);
 render(<TorrentProgressWindow downloadId="one"/>);await screen.findByText('pack');await waitFor(()=>expect(mocks.receive).toBeTruthy());
 act(()=>mocks.receive?.({payload:{id:'one',status:'checking_files',downloaded:0,total:100,verifiedBytes:500,verificationTotal:1000,verificationSpeed:2097152,verificationReadBytes:4096,speed:0}}));
 expect(screen.getByText(/Leitura · 2.0 MB\/s/)).toBeTruthy();expect(screen.getByText('50%')).toBeTruthy();expect(screen.getByText(/4.0 KB lidos/)).toBeTruthy();
 act(()=>mocks.receive?.({payload:{id:'one',status:'downloading',downloaded:20,total:100,speed:1024,diskWriteSpeed:1048576,peers:7,trackers:12}}));
 expect(screen.getByText('100%')).toBeTruthy();expect(screen.getByText(/Verification complete|Verificação concluída/)).toBeTruthy();
 await waitFor(()=>expect(screen.getByText('20%')).toBeTruthy(),{timeout:1500});
 expect(screen.getByText(/Escrita · 1.0 MB\/s/)).toBeTruthy();expect(screen.getByRole('button',{name:'7 peers transferindo, 12 trackers configurados'})).toBeTruthy();
 const speedControl=screen.getByRole('button',{name:/Download Speed|Velocidade de Download/});fireEvent.mouseEnter(speedControl);
 expect(screen.getByRole('tooltip').textContent).toContain('Download1.0 KB/s');fireEvent.mouseLeave(speedControl);
 const timeControl=screen.getByRole('button',{name:/Time Remaining|Tempo Restante/});fireEvent.focus(timeControl);
 expect(screen.getByRole('tooltip').textContent).toContain('Estimativa1 s');expect(screen.getByRole('tooltip').textContent).toContain('Falta baixar80 B');fireEvent.blur(timeControl);
 const diskControl=screen.getByRole('button',{name:'Escrita nos arquivos'});fireEvent.mouseEnter(diskControl);
 expect(screen.getByRole('tooltip').textContent).toContain('Taxa atual1.0 MB/s');expect(screen.getByRole('tooltip').textContent).toContain('cache do Windows');fireEvent.keyDown(diskControl,{key:'Escape'});expect(screen.queryByRole('tooltip')).toBeNull();

});

it('loads peer addresses and counters only when details are opened',async()=>{
 mocks.details.mockResolvedValue({active:true,peers:{'192.0.2.1:51413':{client_name:'Test client',state:'live',conn_kind:null,counters:{fetched_bytes:1024,uploaded_bytes:2048,errors:0,incoming_connections:0,connections:1}}}});
 mocks.listDownloads.mockResolvedValue([{id:'two',fileName:'pack',fileSize:100,totalDownloaded:20,speedCurrent:0,status:'downloading',finalPath:'C:/Downloads/pack',extension:'torrent',infoHash:'test-hash'}]);
 mocks.details.mockClear();render(<TorrentProgressWindow downloadId="two"/>);await screen.findByText('pack');expect(mocks.details.mock.calls.some(call=>call[0]==='torrent_connection_details')).toBe(false);
 fireEvent.click(screen.getByRole('button',{name:/More details|Mais detalhes/i}));
 expect(screen.getByRole('tab',{name:'Download'}).getAttribute('aria-selected')).toBe('true');
 expect(screen.queryByText('192.0.2.1:51413')).toBeNull();fireEvent.click(screen.getByRole('tab',{name:'Peers'}));
 expect(await screen.findByText('192.0.2.1:51413')).toBeTruthy();expect(screen.getByText('Test client')).toBeTruthy();
 expect(mocks.details).toHaveBeenCalledWith('torrent_connection_details',{id:'two'});
 expect(screen.getByText('1.0 KB')).toBeTruthy();
});

it('shows resuming immediately and ignores repeated clicks while resume is pending',async()=>{
 let finish!:()=>void;mocks.resume.mockClear();mocks.resume.mockImplementation(()=>new Promise<void>(resolve=>{finish=resolve;}));
 mocks.listDownloads.mockResolvedValue([{id:'three',fileName:'paused-pack',fileSize:100,totalDownloaded:20,speedCurrent:0,status:'paused',finalPath:'C:/Downloads/pack',extension:'torrent'}]);
 render(<TorrentProgressWindow downloadId="three"/>);await screen.findByText('paused-pack');
 const button=screen.getByRole('button',{name:/^Resume$|^Retomar$/i});fireEvent.click(button);fireEvent.click(button);
 expect(mocks.resume).toHaveBeenCalledTimes(1);expect(button.hasAttribute('disabled')).toBe(true);expect(screen.getByRole('status').textContent).toMatch(/Resuming|Retomando/);
 await act(async()=>finish());expect(button.hasAttribute('disabled')).toBe(false);
});

it('does not show an error if resume reports that the task is already active',async()=>{
 mocks.resume.mockRejectedValueOnce('Este download já está ativo.');
 mocks.listDownloads.mockResolvedValue([{id:'four',fileName:'active-pack',fileSize:100,totalDownloaded:20,speedCurrent:0,status:'paused',finalPath:'C:/Downloads/pack',extension:'torrent'}]);
 render(<TorrentProgressWindow downloadId="four"/>);await screen.findByText('active-pack');fireEvent.click(screen.getByRole('button',{name:/^Resume$|^Retomar$/i}));
 await screen.findByRole('button',{name:/^Pause$|^Pausar$/i});expect(screen.queryByRole('alert')).toBeNull();
});
