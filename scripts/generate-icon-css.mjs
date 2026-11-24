import {writeFileSync} from 'node:fs';
import {baseCss,iconCss} from '@kineticons/core';
import {ICONS} from 'kineticons/data';
const names=['settings','download','archive','file-text','chart-no-axes-column-increasing','folder-open','palette','languages','sliders','refresh-cw','link','search','pause','play','external-link','cpu','info','puzzle','magnet','music','video','grid-2x2','more-horizontal','globe','folder'];
const values=Array.isArray(ICONS)?ICONS:Object.values(ICONS);
const selected=names.map(name=>{const icon=values.find(icon=>icon.name===name);if(!icon)throw Error(name);return icon;});
writeFileSync('src/styles/kineticons.css','/* Generated from Kineticons 0.3.0 (MIT). Packaged locally for production CSP. */\n'+baseCss()+'\n'+selected.map(iconCss).join('\n'));
