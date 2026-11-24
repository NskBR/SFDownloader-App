import {render,screen,fireEvent,cleanup} from '@testing-library/react';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {ThemeCustomizerModal} from './ThemeCustomizerModal';
import {defaultSettings} from '../../domain/settings';
vi.mock('../icons',()=>({X:()=>null,Plus:()=>null,Trash2:()=>null,Dices:()=>null,RotateCcw:()=>null,Pipette:()=>null}));
beforeEach(()=>{HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};});
afterEach(cleanup);
it('previews changes without saving and restores the previous theme on dismissal',()=>{
  const preview=vi.fn(),restore=vi.fn(),apply=vi.fn();
  const view=render(<ThemeCustomizerModal config={defaultSettings.interfaceGradient} onChangeGradient={apply} onClose={vi.fn()} onPreview={preview} onCancelPreview={restore}/>);
  fireEvent.click(screen.getByRole('button',{name:'Radial'}));
  expect(preview.mock.lastCall?.[0].type).toBe('radial');
  expect(apply).not.toHaveBeenCalled();
  view.unmount();expect(restore).toHaveBeenCalledOnce();
});
it('keeps the applied theme when the panel is unmounted',()=>{
  const restore=vi.fn(),apply=vi.fn();
  const view=render(<ThemeCustomizerModal config={defaultSettings.interfaceGradient} onChangeGradient={apply} onClose={vi.fn()} onCancelPreview={restore}/>);
  fireEvent.click(screen.getByRole('button',{name:'Aplicar tema'}));
  view.unmount();expect(apply).toHaveBeenCalledOnce();expect(restore).not.toHaveBeenCalled();
});
it('stages edits and applies a radial background only on confirmation',()=>{
  const apply=vi.fn();
  render(<ThemeCustomizerModal config={defaultSettings.interfaceGradient} onChangeGradient={apply} onClose={vi.fn()}/>);
  fireEvent.click(screen.getByRole('button',{name:'Radial'}));
  expect(apply).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button',{name:'Aplicar tema'}));
  expect(apply.mock.calls[0][0]).toMatchObject({type:'radial',enabled:true});
});
it('does not save a cancelled edit or accept an invalid hexadecimal color',()=>{
  const apply=vi.fn(),close=vi.fn();
  render(<ThemeCustomizerModal config={defaultSettings.interfaceGradient} onChangeGradient={apply} onClose={close}/>);
  const hex=screen.getByLabelText('Código hexadecimal');
  fireEvent.change(hex,{target:{value:'invalid'}});fireEvent.blur(hex);
  expect(screen.getByRole('alert').textContent).toContain('#RRGGBB');
  expect((screen.getByRole('button',{name:'Aplicar tema'}) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole('button',{name:'Cancelar'}));
  expect(close).toHaveBeenCalledOnce();expect(apply).not.toHaveBeenCalled();
});
