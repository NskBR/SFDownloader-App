import {render,screen,cleanup} from '@testing-library/react';
import {afterEach,it,expect,vi} from 'vitest';
import {ConfirmationWindowHeader} from './ConfirmationWindowHeader';
vi.mock('../../i18n',()=>({useTranslation:()=>({t:{common:{close:'Fechar',minimize:'Minimizar'}}})}));
afterEach(cleanup);
it('shows only a lock with a tooltip for confirmed protection',()=>{
  render(<ConfirmationWindowHeader title="arquivo.zip" archiveProtected onClose={vi.fn()} onMinimize={vi.fn()}/>);
  const lock=screen.getByLabelText('Esse arquivo é protegido por senha');
  expect(lock.title).toBe('Esse arquivo é protegido por senha');
  expect(lock.textContent).toBe('');
});
it('does not display a lock when protection is unverified',()=>{
  render(<ConfirmationWindowHeader title="arquivo.zip" onClose={vi.fn()} onMinimize={vi.fn()}/>);
  expect(screen.queryByLabelText('Esse arquivo é protegido por senha')).toBeNull();
});
