import {render,screen,fireEvent,cleanup} from '@testing-library/react';
import {afterEach,beforeEach,it,expect,vi} from 'vitest';
import {WindowBorderEditor} from './WindowBorderEditor';
import {defaultWindowBorder,applySavedWindowBorder} from '../../domain/windowBorder';
beforeEach(()=>{HTMLDialogElement.prototype.showModal=vi.fn(function(this:HTMLDialogElement){this.setAttribute('open','');});});
afterEach(cleanup);
it('previews outline across layout updates and only commits with Apply',()=>{
 const apply=vi.fn();render(<WindowBorderEditor value={defaultWindowBorder} onApply={apply}/>);
 fireEvent.click(screen.getByRole('button',{name:/Contorno da janela/}));fireEvent.click(screen.getByRole('switch'));
 expect(document.documentElement.dataset.windowBorder).toBe('solid');
 applySavedWindowBorder(defaultWindowBorder);expect(document.documentElement.dataset.windowBorder).toBe('solid');
 fireEvent.click(screen.getByRole('button',{name:'Cancelar'}));expect(document.documentElement.dataset.windowBorder).toBe('off');expect(apply).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:/Contorno da janela/}));fireEvent.click(screen.getByRole('switch'));fireEvent.click(screen.getByRole('button',{name:'Aplicar'}));expect(apply).toHaveBeenCalledWith(expect.objectContaining({enabled:true}));
});
it('offers shape cards and restores the previous shape on cancel',()=>{
 const apply=vi.fn();render(<WindowBorderEditor value={defaultWindowBorder} onApply={apply}/>);
 fireEvent.click(screen.getByRole('button',{name:/Formato da janela/}));fireEvent.click(screen.getByRole('button',{name:'Diagonal'}));expect(document.documentElement.dataset.windowShape).toBe('diagonal');
 fireEvent.click(screen.getByRole('button',{name:'Cancelar'}));expect(document.documentElement.dataset.windowShape).toBe('theme');expect(apply).not.toHaveBeenCalled();
});
