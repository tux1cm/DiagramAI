import { useState } from 'react';
import { Icon } from './Icon';

export function Topbar({ title, projectTitle, browseTitle, rename, open, status, cloudStatus, cloudBusy, save, openFile }: { title: string; projectTitle: string; browseTitle?: string; rename: (title: string) => void; open: (kind: 'cloud' | 'files' | 'export' | 'workspace') => void; status: string; cloudStatus: string; cloudBusy: boolean; save: () => void; openFile: () => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(title);
  return <header className="topbar">
    <div className="brand"><div className="logo"><Icon name="grid" size="lg"/></div><div><div className="brandtext">Diagram<span style={{ color: '#596bf1' }}>AI</span></div><div className="brand-sub">SMART DIAGRAM STUDIO</div></div></div>
    <div className="project-header">
      {browseTitle ? <button className="project-name" title="Mở kho" onClick={() => open('workspace')}><Icon name="file" size="sm"/><span>{browseTitle}</span></button> : editing ? <form className="project-name" onSubmit={(event) => { event.preventDefault(); rename(draft); setEditing(false); }}><input aria-label="Tên dự án mẫu" maxLength={100} autoFocus value={draft} onChange={(event) => setDraft(event.target.value)} onBlur={() => { rename(draft); setEditing(false); }} onKeyDown={(event) => { if (event.key === 'Escape') { event.preventDefault(); setEditing(false); } }}/></form>
        : <button className="project-name" title="Đổi tên sơ đồ" onClick={() => { setDraft(title); setEditing(true); }}><Icon name="file" size="sm"/><span><span className="workspace-project-title">{projectTitle}</span> / {title}</span><Icon name="chev" size="sm"/></button>}
      <span className="top-status" role="status"><span className={`status-dot ${status === 'Đã lưu trên máy' ? '' : 'unsaved dirty'}`}/><span>{status}</span></span>
    </div>
    <div className="top-actions">
      <button className="chip cloud-chip" aria-busy={cloudBusy} onClick={() => open('cloud')} title="Trạng thái đồng bộ"><Icon name="cloud" size="sm"/> Cloud <span style={{ color: '#7785a0' }}>· {cloudStatus}</span></button>
      <button className="chip" onClick={() => open('workspace')}>Kho</button>
      <button className="btn hide-small" onClick={openFile}><Icon name="upload" size="sm"/><span className="label-action">Mở file</span></button>
      <button className="btn hide-small" onClick={save}><Icon name="save" size="sm"/><span className="label-action">Lưu file</span></button>
      <button className="btn primary" onClick={() => open('export')}><Icon name="download" size="sm"/> Xuất SVG</button>
    </div>
  </header>;
}
