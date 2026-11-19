import type { ShapeId } from './fixture';

export function Shape({ type, x, y, w, h }: { type: ShapeId; x: number; y: number; w: number; h: number }) {
  const cx = x + w / 2, cy = y + h / 2;
  switch (type) {
    case 'rect': return <rect x={x} y={y} width={w} height={h} rx="2"/>;
    case 'round': return <rect x={x} y={y} width={w} height={h} rx={Math.min(h / 2, 25)}/>;
    case 'ellipse': return <ellipse cx={cx} cy={cy} rx={w / 2} ry={h / 2}/>;
    case 'diamond': return <path d={`M${cx} ${y} L${x + w} ${cy} L${cx} ${y + h} L${x} ${cy} Z`}/>;
    case 'parallelogram': return <path d={`M${x + w * .22} ${y} H${x + w} L${x + w * .78} ${y + h} H${x} Z`}/>;
    case 'hexagon': return <path d={`M${x + w * .22} ${y} H${x + w * .78} L${x + w} ${cy} L${x + w * .78} ${y + h} H${x + w * .22} L${x} ${cy} Z`}/>;
    case 'triangle': return <path d={`M${cx} ${y} L${x + w} ${y + h} H${x} Z`}/>;
    case 'cylinder': case 'database': return <><path d={`M${x} ${y + 10} Q${x} ${y - 4} ${cx} ${y + 2} Q${x + w} ${y - 4} ${x + w} ${y + 10} V${y + h - 10} Q${x + w} ${y + h + 4} ${cx} ${y + h - 2} Q${x} ${y + h + 4} ${x} ${y + h - 10} Z`}/><path d={`M${x} ${y + 10} Q${x} ${y + 24} ${cx} ${y + 20} Q${x + w} ${y + 24} ${x + w} ${y + 10}`} fill="none"/></>;
    case 'document': return <path d={`M${x} ${y} H${x + w} V${y + h - 12} Q${x + w * .75} ${y + h + 7} ${cx} ${y + h - 12} Q${x + w * .25} ${y + h - 28} ${x} ${y + h - 12} Z`}/>;
    case 'cloud': return <path d={`M${x + 12} ${y + h * .78} Q${x - 9} ${y + h * .76} ${x + 5} ${y + h * .52} Q${x + 8} ${y + h * .27} ${x + w * .31} ${y + h * .35} Q${cx} ${y - 7} ${x + w * .67} ${y + h * .3} Q${x + w * .95} ${y + h * .18} ${x + w * .91} ${y + h * .52} Q${x + w + 8} ${y + h * .75} ${x + w * .83} ${y + h * .83} Z`}/>;
    case 'note': return <><path d={`M${x} ${y} H${x + w - 20} L${x + w} ${y + 20} V${y + h} H${x} Z`}/><path d={`M${x + w - 20} ${y} V${y + 20} H${x + w}`} fill="none"/></>;
    case 'speech': return <path d={`M${x} ${y} H${x + w} V${y + h * .72} H${x + w * .42} L${x + w * .25} ${y + h} V${y + h * .72} H${x} Z`}/>;
    case 'folder': return <path d={`M${x} ${y + 12} H${x + w * .4} L${x + w * .5} ${y + 3} H${x + w} V${y + h} H${x} Z`}/>;
    case 'chevron': return <path d={`M${x} ${y} H${x + w * .75} L${x + w} ${cy} L${x + w * .75} ${y + h} H${x} L${x + w * .25} ${cy} Z`}/>;
    case 'actor': return <><circle cx={cx} cy={y + 12} r="8"/><path d={`M${cx} ${y + 20} V${y + h * .64} M${x + w * .24} ${y + h * .44} H${x + w * .76} M${cx} ${y + h * .64} L${x + w * .27} ${y + h} M${cx} ${y + h * .64} L${x + w * .73} ${y + h}`} fill="none"/></>;
    case 'table': return <><rect x={x} y={y} width={w} height={h} rx="2"/><path d={`M${x} ${y + h * .3}H${x + w}M${x + w * .35} ${y}V${y + h}M${x + w * .7} ${y}V${y + h}`} fill="none"/></>;
    case 'card': return <><rect x={x} y={y} width={w} height={h} rx="4"/><path d={`M${x + 8} ${y + 12}H${x + w - 8} M${x + 8} ${y + 23}H${x + w * .68}`} fill="none"/></>;
    default: return null;
  }
}

export function ShapeThumbnail({ type }: { type: ShapeId }) {
  if (['line', 'arrow', 'bidirectional'].includes(type)) return <svg viewBox="0 0 56 43" fill="none" stroke="#687995" strokeWidth="2" aria-hidden="true"><path d="M6 21H50"/>{type !== 'line' && <path d="m43 15 7 6-7 6"/>}{type === 'bidirectional' && <path d="m13 15-7 6 7 6"/>}</svg>;
  return <svg viewBox="0 0 56 43" fill="#f4f7ff" stroke="#677b9b" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><Shape type={type} x={5} y={5} w={46} h={32}/></svg>;
}
