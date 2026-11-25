import {render,screen,fireEvent,cleanup} from '@testing-library/react';
import {afterEach,it,expect} from 'vitest';
import {MetricsInsights} from './MetricsInsights';
afterEach(cleanup);
it('changes period and measure and exposes daily chart values without a pointer',()=>{
 render(<MetricsInsights tasks={[]} loading={false} error={false} formatBytes={n=>`${n} B`}/>);
 const chart=screen.getByRole('group',{name:'Downloads concluídos por dia'});expect(chart.querySelectorAll('button')).toHaveLength(14);
 fireEvent.click(screen.getByRole('button',{name:'30 dias'}));expect(chart.querySelectorAll('button')).toHaveLength(30);
 fireEvent.click(screen.getByRole('button',{name:'Volume'}));expect(screen.getByRole('button',{name:'Volume'}).getAttribute('aria-pressed')).toBe('true');
 fireEvent.click(chart.querySelector('button')!);expect(screen.getByText(/0 concluídos · 0 B/)).toBeTruthy();
});
