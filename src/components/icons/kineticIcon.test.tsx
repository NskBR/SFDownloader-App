import {render,screen,fireEvent,cleanup,act} from '@testing-library/react';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {kineticIcon} from './kineticIcon';
import type {Settings} from 'kineticons';
vi.mock('./classic',()=>({Settings:()=> <svg data-testid="classic"/>}));
const Source=(({active,css}:{active?:boolean;css?:boolean})=><svg data-testid="filled" data-active={String(active)} data-runtime-css={String(css)}/>) as unknown as typeof Settings;
const Icon=kineticIcon(Source,'Settings');
beforeEach(()=>{document.documentElement.dataset.iconStyle='filled';vi.stubGlobal('matchMedia',()=>({matches:false,addEventListener:vi.fn(),removeEventListener:vi.fn()}));});
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
it('uses packaged styles and activates the filled icon from its whole control',()=>{
 render(<button>Configurar<Icon/></button>);
 expect(screen.getByTestId('filled').getAttribute('data-runtime-css')).toBe('false');
 fireEvent.mouseEnter(screen.getByRole('button'));expect(screen.getByTestId('filled').getAttribute('data-active')).toBe('true');
 fireEvent.mouseLeave(screen.getByRole('button'));expect(screen.getByTestId('filled').getAttribute('data-active')).toBe('false');
});
it('switches to classic icons without restarting the app',()=>{
 render(<button>Configurar<Icon/></button>);
 act(()=>{document.documentElement.dataset.iconStyle='classic';window.dispatchEvent(new Event('sf-icon-style'));});
 expect(screen.queryByTestId('filled')).toBeNull();expect(screen.getByTestId('classic')).toBeTruthy();
});
