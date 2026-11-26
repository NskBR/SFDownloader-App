import {render,screen,fireEvent,cleanup,act} from "@testing-library/react";
import {afterEach,it,expect,vi} from "vitest";
import {TorrentPeerStatus} from "./TorrentPeerStatus";
afterEach(()=>{cleanup();vi.useRealTimers();});
it('shows peers and configured trackers on hover and keyboard focus',()=>{
 vi.useFakeTimers();render(<TorrentPeerStatus peers={7} trackers={12} totalUploaded="2.5 GB"/>);const control=screen.getByRole('button');
 expect(screen.queryByRole('tooltip')).toBeNull();fireEvent.mouseEnter(control);
 expect(screen.getByRole('tooltip').textContent).toContain('Peers transferindo7');expect(screen.getByRole('tooltip').textContent).toContain('Trackers configurados12');expect(screen.getByRole('tooltip').textContent).toContain('Total enviado2.5 GB');
 fireEvent.mouseLeave(control);act(()=>vi.advanceTimersByTime(200));expect(screen.queryByRole('tooltip')).toBeNull();fireEvent.focus(control);expect(screen.getByRole('tooltip')).toBeTruthy();fireEvent.keyDown(control,{key:'Escape'});expect(screen.queryByRole('tooltip')).toBeNull();
});

it('stays open while crossing the gap into the tooltip and closes after leaving both',()=>{
 vi.useFakeTimers();render(<TorrentPeerStatus peers={7} trackers={12}/>);const control=screen.getByRole('button');
 fireEvent.mouseEnter(control);const tip=screen.getByRole('tooltip');fireEvent.mouseLeave(control);act(()=>vi.advanceTimersByTime(80));fireEvent.mouseEnter(tip);act(()=>vi.advanceTimersByTime(500));expect(screen.getByRole('tooltip')).toBeTruthy();
 fireEvent.mouseLeave(tip);act(()=>vi.advanceTimersByTime(200));expect(screen.queryByRole('tooltip')).toBeNull();
});

it('does not open when hovering the number instead of the icon',()=>{
 render(<TorrentPeerStatus peers={7} trackers={12}/>);
 fireEvent.mouseEnter(screen.getByText('7'));expect(screen.queryByRole('tooltip')).toBeNull();
 fireEvent.mouseEnter(screen.getByRole('button'));expect(screen.getByRole('tooltip')).toBeTruthy();
});
