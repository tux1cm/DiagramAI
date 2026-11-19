export const NODE_SHAPES = ['rect', 'round', 'ellipse', 'diamond', 'parallelogram', 'hexagon', 'triangle', 'cylinder', 'document', 'cloud', 'note', 'speech', 'folder', 'chevron', 'database', 'actor', 'table', 'card', 'text'] as const;
export type NodeShape = typeof NODE_SHAPES[number];
export type PaletteShape = Exclude<NodeShape, 'text'> | 'arrow' | 'line' | 'bidirectional';
export const PORTS = ['top', 'right', 'bottom', 'left'] as const;
export type Port = typeof PORTS[number];

export interface ShapeDefinition {
  name: string;
  defaultSize: { width: number; height: number };
  minSize: { width: number; height: number };
  textRegion: { x: number; y: number; width: number; height: number };
}
const base: ShapeDefinition = {
  name: 'Hình khối', defaultSize: { width: 150, height: 63 }, minSize: { width: 50, height: 30 },
  textRegion: { x: .08, y: .12, width: .84, height: .76 },
};
export const SHAPE_DEFINITIONS: Record<NodeShape, ShapeDefinition> = {
  rect: { ...base, name: 'Chữ nhật' }, round: { ...base, name: 'Bo góc' },
  ellipse: { ...base, name: 'Hình tròn', defaultSize: { width: 145, height: 67 } },
  diamond: { ...base, name: 'Hình thoi', defaultSize: { width: 170, height: 88 }, minSize: { width: 80, height: 50 }, textRegion: { x: .22, y: .25, width: .56, height: .5 } },
  parallelogram: { ...base, name: 'Bình hành', textRegion: { x: .23, y: .12, width: .54, height: .76 } },
  hexagon: { ...base, name: 'Lục giác', textRegion: { x: .23, y: .12, width: .54, height: .76 } },
  triangle: { ...base, name: 'Tam giác', defaultSize: { width: 120, height: 100 }, textRegion: { x: .25, y: .45, width: .5, height: .45 } },
  cylinder: { ...base, name: 'CSDL' }, document: { ...base, name: 'Tài liệu' },
  cloud: { ...base, name: 'Đám mây', textRegion: { x: .2, y: .35, width: .6, height: .3 } },
  note: { ...base, name: 'Ghi chú' }, speech: { ...base, name: 'Hội thoại', textRegion: { x: .08, y: .1, width: .84, height: .5 } },
  folder: { ...base, name: 'Thư mục' }, chevron: { ...base, name: 'Tiến trình', textRegion: { x: .26, y: .12, width: .48, height: .76 } },
  database: { ...base, name: 'Kho dữ liệu' },
  actor: { ...base, name: 'Tác nhân', defaultSize: { width: 90, height: 120 }, minSize: { width: 50, height: 90 }, textRegion: { x: 0, y: .8, width: 1, height: .2 } },
  table: { ...base, name: 'Bảng' }, card: { ...base, name: 'Thẻ' },
  text: { ...base, name: 'Văn bản', defaultSize: { width: 150, height: 40 }, minSize: { width: 30, height: 24 }, textRegion: { x: .02, y: .05, width: .96, height: .9 } },
};

export function newId(): string {
  if (globalThis.crypto.randomUUID) return globalThis.crypto.randomUUID();
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
