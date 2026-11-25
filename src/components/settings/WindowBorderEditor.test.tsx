import {render,screen,fireEvent,cleanup} from '@testing-library/react';
import {afterEach,beforeEach,it,expect,vi} from 'vitest';
import {WindowBorderEditor} from './WindowBorderEditor';
import {defaultWindowBorder,applySavedWindowBorder} from '../../domain/windowBorder';
beforeEach(()=>{HTMLDialogElement.prototype.showModal=vi.fn(function(this:HTMLDialogElement){this.setAttribute('open','');});});
afterEach(cleanup);
it('previews outline across layout updates and only commits with Apply',()=>{
 const apply=vi.fn();render(<WindowBorderEditor value={defaultWindowBorder} onApply={apply}/>);
 fireEvent.click(screen.getByRole('button',{name:/Contorno da janela/}));fireEvent.click(screen.getByRole('button',{name:'Sólido'}));
 expect(document.documentElement.dataset.windowBorder).toBe('solid');
 applySavedWindowBorder(defaultWindowBorder);expect(document.documentElement.dataset.windowBorder).toBe('solid');
 fireEvent.click(screen.getByRole('button',{name:'Cancelar'}));expect(document.documentElement.dataset.windowBorder).toBe('off');expect(apply).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:/Contorno da janela/}));fireEvent.click(screen.getByRole('button',{name:'Sólido'}));fireEvent.click(screen.getByRole('button',{name:'Aplicar'}));expect(apply).toHaveBeenCalledWith(expect.objectContaining({enabled:true}));
});
it('offers shape cards and restores the previous shape on cancel',()=>{
 const apply=vi.fn();render(<WindowBorderEditor value={defaultWindowBorder} onApply={apply}/>);
 fireEvent.click(screen.getByRole('button',{name:/Formato da janela/}));fireEvent.click(screen.getByRole('button',{name:'Diagonal'}));expect(document.documentElement.dataset.windowShape).toBe('diagonal');
 fireEvent.click(screen.getByRole('button',{name:'Cancelar'}));expect(document.documentElement.dataset.windowShape).toBe('theme');expect(apply).not.toHaveBeenCalled();
});

it('closes a clean backdrop click but protects a pending outline preview',()=>{
 const apply=vi.fn();render(<WindowBorderEditor value={defaultWindowBorder} onApply={apply}/>);
 const open=()=>fireEvent.click(screen.getByRole('button',{name:/Contorno da janela/}));
 const backdrop=()=>{const dialog=screen.getByRole('dialog');vi.spyOn(dialog,'getBoundingClientRect').mockReturnValue({left:10,top:10,right:200,bottom:200} as DOMRect);fireEvent(dialog,new MouseEvent('pointerdown',{bubbles:true,clientX:0,clientY:0}));fireEvent.click(dialog,{clientX:0,clientY:0});};
 open();backdrop();expect(screen.queryByRole('dialog')).toBeNull();
 open();fireEvent.click(screen.getByRole('button',{name:'Neon'}));backdrop();
 expect(screen.getByRole('alert').textContent).toContain('Alterações não salvas');expect(screen.getByRole('dialog')).toBeTruthy();expect(apply).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'Cancelar'}));expect(document.documentElement.dataset.windowBorder).toBe('off');
});
