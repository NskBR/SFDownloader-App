import {render,screen,fireEvent,cleanup} from '@testing-library/react';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {ExtensionInstancesNotice} from './ExtensionInstancesNotice';
beforeEach(()=>{localStorage.clear();HTMLDialogElement.prototype.showModal=vi.fn(function(this:HTMLDialogElement){this.setAttribute('open','');});});afterEach(cleanup);
it('shows only a titlebar icon until clicked and X closes only the modal',()=>{
 render(<ExtensionInstancesNotice/>);expect(screen.queryByRole('dialog')).toBeNull();
 fireEvent.click(screen.getByRole('button',{name:'Aviso sobre a atualização da extensão'}));expect(screen.getByRole('dialog')).toBeTruthy();
 fireEvent.click(screen.getByRole('button',{name:'Fechar aviso'}));expect(screen.queryByRole('dialog')).toBeNull();expect(screen.getByRole('button',{name:'Aviso sobre a atualização da extensão'})).toBeTruthy();
});
it('removing the notice dismisses it permanently',()=>{
 const view=render(<ExtensionInstancesNotice/>);fireEvent.click(screen.getByRole('button',{name:'Aviso sobre a atualização da extensão'}));fireEvent.click(screen.getByRole('button',{name:'Remover aviso'}));expect(screen.queryByRole('button')).toBeNull();view.unmount();render(<ExtensionInstancesNotice/>);expect(screen.queryByRole('button')).toBeNull();
});
