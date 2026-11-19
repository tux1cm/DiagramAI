import { useState } from 'react';
import { Icon } from './Icon';

export function Topbar({ title, rename, open }: { title: string; rename: (title: string) => void; open: (kind: 'cloud' | 'files') => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(title);
  return <header className="topbar">
    <div className="brand"><div className="logo"><Icon name="grid" size="lg"/></div><div><div className="brandtext">Diagram<span style={{ color: '#596bf1' }}>AI</span></div><div className="brand-sub">SMART DIAGRAM STUDIO</div></div></div>
    <div className="project-header">
      {editing ? <form className="project-name" onSubmit={(event) => { event.preventDefault(); rename(draft); setEditing(false); }}><input aria-label="Tên dự án mẫu" maxLength={100} autoFocus value={draft} onChange={(event) => setDraft(event.target.value)} onBlur={() => { rename(draft); setEditing(false); }} onKeyDown={(event) => { if (event.key === 'Escape') { event.preventDefault(); setEditing(false); } }}/></form>
        : <button className="project-name" title="Đổi tên bản mẫu trong phiên này" onClick={() => { setDraft(title); setEditing(true); }}><Icon name="file" size="sm"/><span>{title}</span><Icon name="chev" size="sm"/></button>}
      <span className="top-status"><span className="status-dot unsaved"/><span>Bản thử · Chưa lưu</span></span>
    </div>
    <div className="top-actions">
      <button className="chip" onClick={() => open('cloud')} title="Trạng thái đồng bộ"><Icon name="cloud" size="sm"/> Cloud <span style={{ color: '#7785a0' }}>· Chưa bật</span></button>
      <button className="btn hide-small" onClick={() => open('files')}><Icon name="upload" size="sm"/><span className="label-action">Mở file</span></button>
      <button className="btn hide-small" onClick={() => open('files')}><Icon name="save" size="sm"/><span className="label-action">Lưu file</span></button>
      <button className="btn primary" onClick={() => open('files')}><Icon name="download" size="sm"/> Xuất SVG</button>
    </div>
  </header>;
}
