import {render,screen,fireEvent,cleanup,act} from '@testing-library/react';
import {it,expect,vi,afterEach,beforeEach} from 'vitest';
import {ResetApplicationDialog} from './ResetApplicationDialog';
beforeEach(()=>vi.useFakeTimers());afterEach(()=>{cleanup();vi.useRealTimers();});
const hold=()=>screen.getByRole('button',{name:'Segure por 3 segundos para redefinir aplicativo'});
it('does not reset on a click or on an interrupted hold',()=>{
 const confirm=vi.fn(async()=>{});render(<ResetApplicationDialog onClose={()=>{}} onConfirm={confirm}/>);
 fireEvent.click(hold());act(()=>vi.advanceTimersByTime(4000));expect(confirm).not.toHaveBeenCalled();
 fireEvent.keyDown(hold(),{key:' '});act(()=>vi.advanceTimersByTime(1500));fireEvent.keyUp(hold(),{key:' '});act(()=>vi.advanceTimersByTime(4000));expect(confirm).not.toHaveBeenCalled();
});
it('requires an uninterrupted three-second hold and submits only once',()=>{
 const confirm=vi.fn(()=>new Promise<void>(()=>{}));render(<ResetApplicationDialog onClose={()=>{}} onConfirm={confirm}/>);
 fireEvent.keyDown(hold(),{key:'Enter'});act(()=>vi.advanceTimersByTime(2999));expect(confirm).not.toHaveBeenCalled();
 act(()=>vi.advanceTimersByTime(1));expect(confirm).toHaveBeenCalledOnce();act(()=>vi.advanceTimersByTime(5000));expect(confirm).toHaveBeenCalledOnce();
});
it('cancels a hold when the app loses focus',()=>{
 const confirm=vi.fn(async()=>{});render(<ResetApplicationDialog onClose={()=>{}} onConfirm={confirm}/>);
 fireEvent.keyDown(hold(),{key:' '});act(()=>vi.advanceTimersByTime(2000));fireEvent(window,new Event('blur'));act(()=>vi.advanceTimersByTime(2000));expect(confirm).not.toHaveBeenCalled();
});
