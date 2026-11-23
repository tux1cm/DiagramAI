import { SHAPE_DEFINITIONS, type Arrange, type DiagramDocument, type EdgePatch, type GraphSelection, type NodePatch, type NodeStyle } from '@diagramai/diagram-core';
import { FILLS } from './fixture';
import { Icon } from './Icon';

export interface PropertiesProps {
  document: DiagramDocument; selection: GraphSelection;
  nodePatch: (patch: NodePatch) => boolean; edgePatch: (patch: EdgePatch) => boolean;
  geometry: (patch: { x?: number; y?: number; width?: number; height?: number }) => boolean;
  arrange: (kind: Arrange) => void; group: () => void; ungroup: () => void;
  duplicate: () => void; remove: () => void; snap: boolean; setSnap: (snap: boolean) => void;
}
function CommitField({ label, value, commit, numeric = false, min, max, multiline = false, maxLength }: {
  label: string; value: string | number; commit: (text: string) => boolean; numeric?: boolean;
  min?: number; max?: number; multiline?: boolean; maxLength?: number;
}) {
  const display = typeof value === 'number' ? String(Math.round(value * 1000) / 1000) : value;
  const blur = (element: HTMLInputElement | HTMLTextAreaElement) => {
    if (element.value !== display && !commit(element.value)) element.value = display;
  };
  const keyboard = (event: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (event.nativeEvent.isComposing) return;
    if (event.key === 'Escape') { event.preventDefault(); event.currentTarget.value = display; event.currentTarget.blur(); }
    else if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); event.currentTarget.blur(); }
  };
  return <div className="field"><label>{label}{multiline
    ? <textarea key={display} defaultValue={display} aria-label={label} maxLength={maxLength} onBlur={(event) => blur(event.currentTarget)} onKeyDown={keyboard}/>
    : <input key={display} type={numeric ? 'number' : 'text'} defaultValue={display} aria-label={label} min={min} max={max} step={numeric ? 1 : undefined} maxLength={maxLength} onBlur={(event) => blur(event.currentTarget)} onKeyDown={keyboard}/>}</label></div>;
}
function ColorField({ label, color, commit }: { label: string; color: string | undefined; commit: (color: string) => boolean }) {
  const value = color && color !== 'transparent' ? color : '#ffffff';
  return <div className="field color-field"><label>{label} <input key={value} type="color" aria-label={label} defaultValue={value} onBlur={(event) => { if (event.currentTarget.value !== value && !commit(event.currentTarget.value)) event.currentTarget.value = value; }}/></label>{(!color || color === 'transparent') && <span className="tiny-muted">{color === 'transparent' ? 'Trong suốt' : 'Nhiều giá trị'}</span>}</div>;
}
const numeric = (text: string, action: (value: number) => boolean) => text.trim() !== '' && Number.isFinite(Number(text)) ? action(Number(text)) : false;

export function PropertiesPanel(props: PropertiesProps) {
  const nodes = props.document.nodes.filter((node) => props.selection.nodeIds.includes(node.id));
  const edges = props.document.edges.filter((edge) => props.selection.edgeIds.includes(edge.id));
  const node = nodes[0], edge = edges[0];
  const common = <K extends keyof NodeStyle>(key: K): NodeStyle[K] | undefined => node && nodes.every((item) => item.style[key] === node.style[key]) ? node.style[key] : undefined;
  const setStyle = (style: Partial<NodeStyle>) => props.nodePatch({ style });
  const hasSelection = Boolean(nodes.length || edges.length);
  const hasGroup = props.document.groups.some((group) => group.nodeIds.some((id) => props.selection.nodeIds.includes(id)));
  return <div className="prop-content">
    <h3>{nodes.length === 1 && !edges.length ? 'Chỉnh sửa hình khối' : edges.length === 1 && !nodes.length ? 'Thuộc tính đường nối' : 'Thuộc tính'}</h3>
    <p>{hasSelection ? `${nodes.length} hình · ${edges.length} đường nối đang chọn` : 'Chọn hình hoặc đường nối để chỉnh sửa. Thay đổi đã xác nhận được tự lưu trên máy; trạng thái cloud hiển thị riêng.'}</p>
    {!hasSelection && <><div className="feature-card"><span>Hình khối</span><strong>{props.document.nodes.length}</strong></div><div className="feature-card"><span>Đường nối</span><strong>{props.document.edges.length}</strong></div></>}
    {node && <>
      {nodes.length === 1 && <><p>{SHAPE_DEFINITIONS[node.type].name}</p><CommitField label="Nội dung" value={node.text} multiline maxLength={4000} commit={(text) => props.nodePatch({ text })}/></>}
      <div className="field"><label>Màu nền</label><div className="swatches">{FILLS.map((fill) => <button key={fill} className={`swatch ${common('fill') === fill ? 'on' : ''}`} style={{ background: fill }} title={fill} aria-label={`Màu nền ${fill}`} aria-pressed={common('fill') === fill} onClick={() => setStyle({ fill })}/>)}</div><button className="btn small" onClick={() => setStyle({ fill: 'transparent' })}>Trong suốt</button></div>
      <div className="property-grid"><ColorField label="Màu nền tùy chọn" color={common('fill')} commit={(fill) => setStyle({ fill })}/><ColorField label="Màu viền" color={common('stroke')} commit={(stroke) => setStyle({ stroke })}/><ColorField label="Màu chữ" color={common('textColor')} commit={(textColor) => setStyle({ textColor })}/></div>
      <div className="property-grid"><CommitField label="Độ dày viền" numeric min={0} max={12} value={common('strokeWidth') ?? ''} commit={(text) => numeric(text, (strokeWidth) => setStyle({ strokeWidth }))}/><CommitField label="Cỡ chữ" numeric min={8} max={96} value={common('fontSize') ?? ''} commit={(text) => numeric(text, (fontSize) => setStyle({ fontSize }))}/></div>
      <div className="field"><label>Font chữ<select aria-label="Font chữ" value={common('fontFamily') ?? ''} onChange={(event) => setStyle({ fontFamily: event.target.value as NodeStyle['fontFamily'] })}><option value="" disabled>Nhiều giá trị</option>{['Inter, Segoe UI, Arial', 'Segoe UI', 'Arial', 'monospace'].map((font) => <option key={font}>{font}</option>)}</select></label></div>
      <div className="property-grid"><div className="field"><label>Đậm chữ<select aria-label="Đậm chữ" value={common('fontWeight') ?? ''} onChange={(event) => setStyle({ fontWeight: Number(event.target.value) as NodeStyle['fontWeight'] })}><option value="" disabled>Nhiều giá trị</option><option value="400">Thường</option><option value="600">Vừa</option><option value="700">Đậm</option></select></label></div><div className="field"><label>Kiểu viền<select aria-label="Kiểu viền" value={common('dashed') === undefined ? '' : String(common('dashed'))} onChange={(event) => setStyle({ dashed: event.target.value === 'true' })}><option value="" disabled>Nhiều giá trị</option><option value="false">Liền</option><option value="true">Nét đứt</option></select></label></div></div>
      {nodes.length === 1 && <div className="property-grid">{(['width', 'height', 'x', 'y'] as const).map((key, i) => <CommitField key={`${node.id}-${key}`} label={['Rộng', 'Cao', 'Vị trí X', 'Vị trí Y'][i]} numeric value={node[key]} min={key === 'width' || key === 'height' ? SHAPE_DEFINITIONS[node.type].minSize[key] : -1_000_000} max={key === 'width' || key === 'height' ? 4096 : 1_000_000} commit={(text) => numeric(text, (value) => props.geometry({ [key]: value }))}/>)}</div>}
      <div className="field"><label>Căn chỉnh và lớp</label><div className="arrange-grid">{([['left', 'Căn trái'], ['center', 'Giữa ngang'], ['right', 'Căn phải'], ['top', 'Căn trên'], ['middle', 'Giữa dọc'], ['bottom', 'Căn dưới'], ['horizontal', 'Giãn ngang'], ['vertical', 'Giãn dọc'], ['front', 'Đưa lên trước'], ['back', 'Đưa ra sau']] as const).map(([kind, label]) => <button key={kind} className="btn small" disabled={nodes.length < (kind === 'front' || kind === 'back' ? 1 : kind === 'horizontal' || kind === 'vertical' ? 3 : 2)} onClick={() => props.arrange(kind)}>{label}</button>)}</div></div>
      <div className="property-actions"><button className="btn small" disabled={nodes.length < 2} onClick={props.group} title="Nhóm (Ctrl+G)">Nhóm</button><button className="btn small" disabled={!hasGroup} onClick={props.ungroup} title="Bỏ nhóm (Ctrl+Shift+G)">Bỏ nhóm</button></div>
    </>}
    {edge && <>
      {edges.length === 1 && <CommitField label="Nhãn đường nối" value={edge.label} maxLength={500} commit={(label) => props.edgePatch({ label })}/>}
      <ColorField label="Màu đường nối" color={edges.every((item) => item.style.stroke === edge.style.stroke) ? edge.style.stroke : undefined} commit={(stroke) => props.edgePatch({ style: { stroke } })}/>
      <CommitField label="Độ dày đường nối" numeric min={.5} max={12} value={edges.every((item) => item.style.strokeWidth === edge.style.strokeWidth) ? edge.style.strokeWidth : ''} commit={(text) => numeric(text, (strokeWidth) => props.edgePatch({ style: { strokeWidth } }))}/>
      <div className="field"><label>Kiểu đường<select aria-label="Kiểu đường" value={edges.every((item) => item.kind === edge.kind) ? edge.kind : ''} onChange={(event) => props.edgePatch({ kind: event.target.value as typeof edge.kind })}><option value="" disabled>Nhiều giá trị</option><option value="orthogonal">Gấp khúc</option><option value="straight">Thẳng</option><option value="smoothstep">Bo góc</option><option value="curved">Cong</option></select></label></div>
      <div className="field"><label>Nét đường<select aria-label="Nét đường" value={edges.every((item) => item.style.dashed === edge.style.dashed) ? String(edge.style.dashed) : ''} onChange={(event) => props.edgePatch({ style: { dashed: event.target.value === 'true' } })}><option value="" disabled>Nhiều giá trị</option><option value="false">Liền</option><option value="true">Nét đứt</option></select></label></div>
      {(['markerStart', 'markerEnd'] as const).map((key, i) => <div className="field" key={key}><label>{i ? 'Mũi tên cuối' : 'Mũi tên đầu'}<select aria-label={i ? 'Mũi tên cuối' : 'Mũi tên đầu'} value={edges.every((item) => item[key] === edge[key]) ? edge[key] : ''} onChange={(event) => props.edgePatch({ [key]: event.target.value })}><option value="" disabled>Nhiều giá trị</option><option value="none">Không</option><option value="arrow">Mũi tên</option></select></label></div>)}
      {edges.length === 1 && <><div className="feature-card"><span>Từ</span><strong>{props.document.nodes.find((node) => node.id === edge.source)?.text}</strong></div><div className="feature-card"><span>Đến</span><strong>{props.document.nodes.find((node) => node.id === edge.target)?.text}</strong></div></>}
    </>}
    {hasSelection && <div className="property-actions"><button className="btn" onClick={props.duplicate}><Icon name="copy" size="sm"/> Nhân đôi</button><button className="btn" onClick={props.remove}><Icon name="trash" size="sm"/> Xóa</button></div>}
    <label className="snap-setting"><input type="checkbox" checked={props.snap} onChange={(event) => props.setSnap(event.target.checked)}/> Bắt dính lưới 10px</label>
    <p className="property-note">Ctrl+kéo nút góc: thu/phóng từ tâm, giữ tỷ lệ; Ctrl+kéo thân hình: nhân đôi. Theo dõi trạng thái lưu local và Cloud ở thanh trên. Thả hình rời lên cạnh sáng tím để chèn. Routing gấp khúc tránh khối ở mức cơ bản; có thể cần tự đổi neo khi không đủ khoảng trống.</p>
  </div>;
}
