// P1 view-model only. P2 will introduce the validated, platform-independent domain.
export const SHAPES = [
  { id: 'rect', name: 'Chữ nhật', group: 'basic' }, { id: 'round', name: 'Bo góc', group: 'basic' },
  { id: 'ellipse', name: 'Hình tròn', group: 'basic' }, { id: 'diamond', name: 'Hình thoi', group: 'basic' },
  { id: 'parallelogram', name: 'Bình hành', group: 'basic' }, { id: 'hexagon', name: 'Lục giác', group: 'basic' },
  { id: 'triangle', name: 'Tam giác', group: 'basic' }, { id: 'cylinder', name: 'CSDL', group: 'basic' },
  { id: 'document', name: 'Tài liệu', group: 'basic' }, { id: 'cloud', name: 'Đám mây', group: 'basic' },
  { id: 'note', name: 'Ghi chú', group: 'basic' }, { id: 'speech', name: 'Hội thoại', group: 'basic' },
  { id: 'folder', name: 'Thư mục', group: 'process' }, { id: 'chevron', name: 'Tiến trình', group: 'process' },
  { id: 'database', name: 'Kho dữ liệu', group: 'process' }, { id: 'actor', name: 'Tác nhân', group: 'process' },
  { id: 'table', name: 'Bảng', group: 'process' }, { id: 'card', name: 'Thẻ', group: 'process' },
  { id: 'arrow', name: 'Mũi tên', group: 'line' }, { id: 'line', name: 'Đường thẳng', group: 'line' },
  { id: 'bidirectional', name: 'Hai chiều', group: 'line' },
] as const;
export type ShapeId = typeof SHAPES[number]['id'];
export type Port = 'top' | 'right' | 'bottom' | 'left';
export interface FixtureNode {
  id: string; type: ShapeId; x: number; y: number; w: number; h: number;
  label: string; fill: string; stroke: string;
}
export interface FixtureEdge { id: string; from: string; to: string; fromPort: Port; toPort: Port; label: string }
export type Selection = { kind: 'node' | 'edge'; id: string } | null;
export interface EditorViewState { title: string; nodes: FixtureNode[]; edges: FixtureEdge[]; selection: Selection }

export const FILLS = ['#ffffff', '#e9f0ff', '#e3f9ef', '#fff4d9', '#fff0f1', '#f1eaff'] as const;
const borders: Record<string, string> = { '#ffffff': '#aab9d3', '#e9f0ff': '#6588ec', '#e3f9ef': '#62c99f', '#fff4d9': '#e4b659', '#fff0f1': '#e7a3aa', '#f1eaff': '#ad97e8' };
export function createFixture(): EditorViewState {
  return {
    title: 'Quy trình nhập kho', selection: null,
    nodes: [
      { id: 'n1', type: 'round', x: 300, y: 55, w: 170, h: 56, label: 'Bắt đầu', fill: '#e9f0ff', stroke: '#6588ec' },
      { id: 'n2', type: 'rect', x: 300, y: 169, w: 170, h: 65, label: 'Tiếp nhận vật tư', fill: '#ffffff', stroke: '#bbc8df' },
      { id: 'n3', type: 'diamond', x: 300, y: 305, w: 170, h: 96, label: 'Đạt yêu cầu?', fill: '#fff4d9', stroke: '#e4b659' },
      { id: 'n4', type: 'rect', x: 300, y: 480, w: 170, h: 65, label: 'Nhập kho', fill: '#e3f9ef', stroke: '#62c99f' },
      { id: 'n5', type: 'round', x: 300, y: 611, w: 170, h: 55, label: 'Hoàn tất', fill: '#e9f0ff', stroke: '#6588ec' },
      { id: 'n6', type: 'document', x: 575, y: 316, w: 175, h: 73, label: 'Trả nhà cung cấp', fill: '#fff0f1', stroke: '#e7a3aa' },
    ],
    edges: [
      { id: 'e1', from: 'n1', to: 'n2', fromPort: 'bottom', toPort: 'top', label: '' },
      { id: 'e2', from: 'n2', to: 'n3', fromPort: 'bottom', toPort: 'top', label: '' },
      { id: 'e3', from: 'n3', to: 'n4', fromPort: 'bottom', toPort: 'top', label: 'Có' },
      { id: 'e4', from: 'n3', to: 'n6', fromPort: 'right', toPort: 'left', label: 'Không' },
      { id: 'e5', from: 'n4', to: 'n5', fromPort: 'bottom', toPort: 'top', label: '' },
    ],
  };
}
export type ViewAction = { type: 'select'; selection: Selection } | { type: 'fill'; value: string } | { type: 'rename'; title: string };
export function viewReducer(state: EditorViewState, action: ViewAction): EditorViewState {
  if (action.type === 'select') {
    const selection = action.selection;
    if (selection && !(selection.kind === 'node' ? state.nodes : state.edges).some((item) => item.id === selection.id)) return state;
    return { ...state, selection };
  }
  if (action.type === 'rename') {
    const title = action.title.trim().slice(0, 100);
    return title ? { ...state, title } : state;
  }
  if (state.selection?.kind !== 'node' || !FILLS.some((fill) => fill === action.value)) return state;
  return { ...state, nodes: state.nodes.map((node) => node.id === state.selection?.id ? { ...node, fill: action.value, stroke: borders[action.value] } : node) };
}
