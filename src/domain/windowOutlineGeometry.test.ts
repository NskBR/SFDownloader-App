import {it,expect} from 'vitest';
import {roundedOutlinePath} from './windowOutlineGeometry';
it('preserves distinct theme corner curves instead of repeating the first radius',()=>{
 const path=roundedOutlinePath(200,100,[[17,17],[8,8],[17,17],[8,8]]);
 expect(path).toContain('M17 0 H192 A8 8');expect(path).toContain('V83 A17 17');expect(path).toContain('H8 A8 8');
});
it('uses straight joins for square corners and clamps oversized radii',()=>{
 expect(roundedOutlinePath(100,50,[[0,0],[0,0],[0,0],[0,0]])).not.toContain('A');
 expect(roundedOutlinePath(100,50,[[100,100],[100,100],[100,100],[100,100]])).toContain('M25 0');
});
