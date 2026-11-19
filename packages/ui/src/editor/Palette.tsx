import { useState } from 'react';
import { Icon } from './Icon';
import { SHAPES } from './fixture';
import { ShapeThumbnail } from './Shape';

export function Palette({ collapsed, pending }: { collapsed: boolean; pending: () => void }) {
  const [query, setQuery] = useState('');
  const filtered = SHAPES.filter((shape) => shape.name.toLocaleLowerCase('vi').includes(query.trim().toLocaleLowerCase('vi')));
  return <aside className={`palette ${collapsed ? 'is-collapsed' : ''}`} aria-label="Thư viện hình khối">
    <div className="panehead"><div className="panetitle">Thư viện hình khối <Icon name="grid" size="sm"/></div><div className="tiny-muted">Kéo hình vào canvas hoặc bấm để thêm</div><label className="searchbox"><Icon name="search" size="sm"/><input aria-label="Tìm hình khối" placeholder="Tìm hình khối..." autoComplete="off" value={query} onChange={(event) => setQuery(event.target.value)}/></label></div>
    <div className="palettecontent">{(['basic', 'process', 'line'] as const).map((group, index) => <div key={group}><div className="section-label">{['CƠ BẢN', 'QUY TRÌNH', 'ĐƯỜNG NỐI'][index]}</div><div className="shape-grid">{filtered.filter((shape) => shape.group === group).map((shape) => <button type="button" key={shape.id} className="shape-tile" data-shape={shape.id} title={`${shape.name} — Thêm hình thuộc P2`} onClick={pending}><ShapeThumbnail type={shape.id}/><span>{shape.name}</span></button>)}{!filtered.some((shape) => shape.group === group) && <span className="no-shapes">Không tìm thấy</span>}</div></div>)}
      <div className="palette-tip"><b>✦ Mẹo:</b> Kéo một hình lên đường nối để tự động chèn thành một bước mới.</div>
    </div>
  </aside>;
}
