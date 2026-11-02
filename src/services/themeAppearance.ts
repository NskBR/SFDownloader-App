import type {ThemeAppearance} from "../domain/settings";
/** Emit only restricted visual tokens from built-in profiles or validated local packages. */
export function appearanceCss(value?:ThemeAppearance):string {
 if(!value)return "";
 const root='html[data-test-theme="true"][data-test-preset]';
 const main='html.window-type-main[data-test-theme="true"][data-test-preset]';
 const declarations:string[]=[];const rules:string[]=[];
 const palette=value.palette;
 if(palette&&Object.values(palette).every(color=>/^#[a-f0-9]{6}$/i.test(color))){
  declarations.push(`--game-surface:${palette.surface}`,`--game-raised:${palette.raised}`,`--ember:${palette.accent}`,`--ember-solid:${palette.accent}`,`--ember-strong:${palette.strong}`,`--ember-stop-1:${palette.accent}`,`--ember-stop-2:${palette.strong}`,`--ember-soft:color-mix(in srgb,${palette.accent} 16%,transparent)`,`--st-downloading:${palette.accent}`);
 }
 if(value.font&&/^[a-z0-9 "',-]+$/i.test(value.font))declarations.push(`--font:${value.font}`,`--window-font:${value.font}`);
 if(declarations.length)rules.push(`${root}{${declarations.map(item=>item+' !important;').join('')}}`);
 const geometry=value.geometry;
 if(geometry){
  if(/^(polygon|inset)\([a-z0-9 (),.%+-]+\)$/i.test(geometry.window)){
   rules.push(`${main}:not([data-window-maximized="true"]){--game-window-shape:${geometry.window} !important;}`);
   rules.push(`${main}:not([data-window-maximized="true"]) .window-frame{clip-path:var(--game-window-shape) !important;}`);
  }
  for(const [selector,radius] of [[".download-card",geometry.cardRadius],[".sidebar .navigation__item",geometry.navigationRadius]]){
   if(/^[0-9.px% /]+$/.test(radius))rules.push(`${main} .window-frame ${selector}{border-radius:${radius} !important;}`);
  }
 }
 return rules.join('\n');
}
