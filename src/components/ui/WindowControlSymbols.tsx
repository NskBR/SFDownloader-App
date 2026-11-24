export function WindowControlSymbols({index}:{index:0|1|2}) {
 return <><span className="window-symbol-nintendo" aria-hidden="true">{['Y','X','A'][index]}</span><span className="window-symbol-xbox" aria-hidden="true">{['X','Y','B'][index]}</span><svg className="window-symbol-playstation" viewBox="0 0 20 20" aria-hidden="true" focusable="false">{index===0?<rect x="5" y="5" width="10" height="10" rx=".5"/>:index===1?<path d="M10 3.5 17 15.5H3Z"/>:<circle cx="10" cy="10" r="6"/>}</svg></>;
}
