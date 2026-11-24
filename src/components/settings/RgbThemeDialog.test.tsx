import {fireEvent,render,screen,cleanup} from '@testing-library/react';
import {afterEach,beforeEach,it,expect,vi} from 'vitest';
import {RgbThemeDialog} from './RgbThemeDialog';
vi.mock('../icons',()=>({X:()=>null,Plus:()=>null,Trash2:()=>null}));
beforeEach(()=>{HTMLDialogElement.prototype.showModal=vi.fn(function(this:HTMLDialogElement){this.setAttribute('open','');});});
afterEach(cleanup);
it('previews RGB changes without saving and restores on dismissal',()=>{
  const preview=vi.fn(),restore=vi.fn(),apply=vi.fn();
  const view=render(<RgbThemeDialog config={undefined} profiles={[]} onApply={apply} onClose={vi.fn()} onPreview={preview} onCancelPreview={restore}/>);
  fireEvent.click(screen.getByRole('button',{name:'Rápido'}));
  expect(preview.mock.lastCall?.[0].duration).toBe(6);
  expect(apply).not.toHaveBeenCalled();
  view.unmount();expect(restore).toHaveBeenCalledOnce();
});
it('does not restore the previous RGB after applying',()=>{
  const restore=vi.fn(),apply=vi.fn();
  const view=render(<RgbThemeDialog config={undefined} profiles={[]} onApply={apply} onClose={vi.fn()} onCancelPreview={restore}/>);
  fireEvent.click(screen.getByRole('button',{name:'Aplicar e salvar'}));
  view.unmount();expect(apply).toHaveBeenCalledOnce();expect(restore).not.toHaveBeenCalled();
});
it('saves a named profile with its configured cycle and applies it explicitly',()=>{
  const apply=vi.fn(),close=vi.fn();
  render(<RgbThemeDialog config={undefined} profiles={[]} onApply={apply} onClose={close}/>);
  fireEvent.change(screen.getByLabelText('Nome do perfil RGB'),{target:{value:'Meu perfil'}});
  fireEvent.click(screen.getByRole('button',{name:'Lento'}));
  fireEvent.click(screen.getByRole('button',{name:'Salvar perfil'}));
  expect(apply).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button',{name:'Aplicar e salvar'}));
  expect(apply.mock.calls[0][0].duration).toBe(36);
  expect(apply.mock.calls[0][1][0]).toMatchObject({name:'Meu perfil',config:{duration:36}});
  expect(close).toHaveBeenCalledOnce();
});
it('loads an existing profile into the editor without overwriting settings on cancel',()=>{
  const apply=vi.fn(),close=vi.fn();
  render(<RgbThemeDialog config={undefined} profiles={[{name:'Lento',config:{colors:['#ff0000','#00ff00'],duration:60,angle:90,reverse:true}}]} onApply={apply} onClose={close}/>);
  fireEvent.click(screen.getAllByRole('button',{name:'Lento'})[1]);
  expect(screen.getAllByRole('slider')).toHaveLength(1);
  expect(screen.getAllByRole('button',{name:'Lento'})[0].getAttribute('aria-pressed')).toBe('true');
  expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(true);
  fireEvent.click(screen.getByRole('button',{name:'Cancelar'}));
  expect(apply).not.toHaveBeenCalled();
  expect(close).toHaveBeenCalledOnce();
});
