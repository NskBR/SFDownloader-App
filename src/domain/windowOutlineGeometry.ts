/** Outline follows individual corner radii, including asymmetric theme shapes. */
export function roundedOutlinePath(width:number,height:number,radii:number[][]):string {
 const pairs=radii.map(([x,y])=>[Math.max(0,x),Math.max(0,y)]);
 const [tl,tr,br,bl]=pairs;
 const factor=Math.min(1,width/Math.max(1,tl[0]+tr[0]),width/Math.max(1,bl[0]+br[0]),height/Math.max(1,tl[1]+bl[1]),height/Math.max(1,tr[1]+br[1]));
 const [a,b,c,d]=pairs.map(pair=>pair.map(n=>n*factor));
 const arc=(r:number[],x:number,y:number)=>r[0]&&r[1]?`A${r[0]} ${r[1]} 0 0 1 ${x} ${y}`:`L${x} ${y}`;
 return `M${a[0]} 0 H${width-b[0]} ${arc(b,width,b[1])} V${height-c[1]} ${arc(c,width-c[0],height)} H${d[0]} ${arc(d,0,height-d[1])} V${a[1]} ${arc(a,a[0],0)} Z`;
}
