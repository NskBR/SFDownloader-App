import {render,screen,fireEvent,cleanup,waitFor} from '@testing-library/react';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {ReplaceDownloadLinkDialog} from './ReplaceDownloadLinkDialog';
import {replaceDownloadUrl} from '../../services/downloadService';
import type {DownloadTask} from '../../domain/download';
vi.mock('../../services/downloadService',()=>({replaceDownloadUrl:vi.fn()}));
beforeEach(()=>{vi.resetAllMocks();HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};});
afterEach(cleanup);
const task={id:'failed-download',fileName:'arquivo.rar'} as DownloadTask;
it('validates the replacement before requesting resume',async()=>{
  const saved=vi.fn(),close=vi.fn();vi.mocked(replaceDownloadUrl).mockResolvedValue(task);
  render(<ReplaceDownloadLinkDialog task={task} onSaved={saved} onClose={close}/>);
  fireEvent.change(screen.getByLabelText('Novo link'),{target:{value:'https://example.test/new.rar'}});
  fireEvent.submit(screen.getByRole('button',{name:'Salvar link e retomar'}).closest('form')!);
  await waitFor(()=>expect(saved).toHaveBeenCalledOnce());
  expect(replaceDownloadUrl).toHaveBeenCalledWith(task.id,'https://example.test/new.rar');expect(close).toHaveBeenCalledOnce();
});
it('keeps the dialog open and does not resume an incompatible file',async()=>{
  const saved=vi.fn(),close=vi.fn();vi.mocked(replaceDownloadUrl).mockRejectedValue('Arquivo incompatível.');
  render(<ReplaceDownloadLinkDialog task={task} onSaved={saved} onClose={close}/>);
  fireEvent.change(screen.getByLabelText('Novo link'),{target:{value:'https://example.test/other.rar'}});
  fireEvent.submit(screen.getByRole('button',{name:'Salvar link e retomar'}).closest('form')!);
  expect((await screen.findByRole('alert')).textContent).toContain('Arquivo incompatível');
  expect(saved).not.toHaveBeenCalled();expect(close).not.toHaveBeenCalled();
});
