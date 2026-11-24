import {render,screen,fireEvent,cleanup} from '@testing-library/react';
import {it,expect,vi,afterEach} from 'vitest';
import {CompletionSoundDialog} from './CompletionSoundDialog';
vi.mock('@tauri-apps/api/core',()=>({invoke:vi.fn(async()=>{})}));
afterEach(cleanup);
it('selects without saving and commits the chosen variation only on Apply',()=>{
 HTMLDialogElement.prototype.showModal=vi.fn(function(this:HTMLDialogElement){this.setAttribute('open','');});
 const apply=vi.fn(),close=vi.fn();render(<CompletionSoundDialog value="default" name="" onClose={close} onApply={apply}/>);
 fireEvent.click(screen.getByRole('button',{name:/Suave Dois/}));expect(apply).not.toHaveBeenCalled();fireEvent.click(screen.getByRole('button',{name:'Aplicar'}));expect(apply).toHaveBeenCalledWith('soft','');
});
