import {render,screen,fireEvent,cleanup} from '@testing-library/react';
import {it,expect,vi,afterEach} from 'vitest';
import {PersonalizationPanel} from './PersonalizationPanel';
afterEach(cleanup);
it('opens a grouped modal and closes through its footer without changing preferences',()=>{
 HTMLDialogElement.prototype.showModal=vi.fn(function(this:HTMLDialogElement){this.setAttribute('open','');});
 const close=vi.fn();render(<PersonalizationPanel title="Janela e controles" description="Ajustes da janela" onClose={close} onApply={()=>{}}><button>Formato da janela</button></PersonalizationPanel>);
 expect(screen.getByRole('dialog',{name:'Janela e controles'})).toBeTruthy();expect(screen.getByRole('button',{name:'Formato da janela'})).toBeTruthy();
 fireEvent.click(screen.getByRole('button',{name:'Cancelar'}));expect(close).toHaveBeenCalledOnce();
});
