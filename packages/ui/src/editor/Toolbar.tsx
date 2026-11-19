import type { EditorTool } from '@diagramai/editor';
import { Icon } from './Icon';
import { useRef, useState } from 'react';

export function Toolbar({ zoom, tool, setTool, changeZoom, fit, undo, redo, canUndo, canRedo, duplicate, remove, hasSelection }: {
  zoom: number; tool: EditorTool; setTool: (tool: EditorTool) => void;
  changeZoom: (zoom: number) => void; fit: () => void; undo: () => void; redo: () => void;
  canUndo: boolean; canRedo: boolean; duplicate: () => void; remove: () => void; hasSelection: boolean;
}) {
  const [zoomDraft, setZoomDraft] = useState<string | null>(null), cancelZoom = useRef(false);
  const finishZoom = () => {
    if (!cancelZoom.current && zoomDraft !== null && zoomDraft.trim() && Number.isFinite(Number(zoomDraft)) && Number(zoomDraft) >= 20 && Number(zoomDraft) <= 300) changeZoom(Number(zoomDraft) / 100);
    setZoomDraft(null);
  };
  const tools = [['select', 'cursor', 'Chọn (V)'], ['pan', 'hand', 'Di chuyển canvas (Space)'], ['link', 'link', 'Kết nối hai hình'], ['text', 'text', 'Thêm văn bản']] as const;
  return <div className="toolbar" role="toolbar" aria-label="Công cụ canvas">
    <div className="tool-group">{tools.map(([value, icon, label]) => <button key={value} className={`toolbtn ${tool === value ? 'active' : ''}`} title={label} aria-label={label} aria-pressed={tool === value} onClick={() => setTool(value)}><Icon name={icon}/></button>)}</div>
    <span className="sep"/>
    <div className="tool-group"><button className="toolbtn" disabled={!canUndo} onClick={undo} title="Hoàn tác (Ctrl+Z)"><Icon name="undo"/></button><button className="toolbtn" disabled={!canRedo} onClick={redo} title="Làm lại (Ctrl+Y)"><Icon name="redo"/></button></div>
    <span className="sep"/>
    <div className="tool-group"><button className="toolbtn" disabled={!hasSelection} onClick={duplicate} title="Nhân đôi (Ctrl+D)"><Icon name="copy"/></button><button className="toolbtn" disabled={!hasSelection} onClick={remove} title="Xóa (Delete)"><Icon name="trash"/></button></div>
    <div className="tool-zoom"><button onClick={() => changeZoom(zoom / 1.15)} title="Thu nhỏ" aria-label="Thu nhỏ">−</button>{zoomDraft === null
      ? <span id="zoomLabel" title="Nhấp đúp để nhập mức thu phóng" onDoubleClick={() => { cancelZoom.current = false; setZoomDraft(String(Math.round(zoom * 100))); }}>{Math.round(zoom * 100)}%</span>
      : <input className="zoom-input" aria-label="Mức thu phóng (%)" type="number" min="20" max="300" value={zoomDraft} ref={(element) => element?.focus()} onChange={(event) => setZoomDraft(event.target.value)} onBlur={finishZoom} onKeyDown={(event) => { if (event.nativeEvent.isComposing) return; if (event.key === 'Enter') event.currentTarget.blur(); else if (event.key === 'Escape') { cancelZoom.current = true; setZoomDraft(null); } }}/>}<button onClick={() => changeZoom(zoom * 1.15)} title="Phóng to" aria-label="Phóng to">+</button></div>
    <button className="toolbtn" onClick={fit} title="Vừa màn hình"><Icon name="fit" size="sm"/></button>
  </div>;
}
