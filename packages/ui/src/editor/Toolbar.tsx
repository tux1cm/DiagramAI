import { Icon } from './Icon';

export function Toolbar({ zoom, changeZoom, fit }: { zoom: number; changeZoom: (zoom: number) => void; fit: () => void }) {
  return <div className="toolbar" role="toolbar" aria-label="Công cụ canvas">
    <div className="tool-group"><button className="toolbtn active" title="Chọn hình mẫu" aria-pressed="true"><Icon name="cursor"/></button>{[['hand', 'Di chuyển canvas'], ['link', 'Kết nối hai hình'], ['text', 'Thêm văn bản']].map(([name, label]) => <button key={name} className="toolbtn" disabled title={`${label} · P2`}><Icon name={name}/></button>)}</div>
    <span className="sep"/>
    <div className="tool-group">{[['undo', 'Hoàn tác'], ['redo', 'Làm lại']].map(([name, label]) => <button key={name} className="toolbtn" disabled title={`${label} · P2`}><Icon name={name}/></button>)}</div>
    <span className="sep"/>
    <div className="tool-group">{[['copy', 'Nhân đôi'], ['trash', 'Xóa']].map(([name, label]) => <button key={name} className="toolbtn" disabled title={`${label} · P2`}><Icon name={name}/></button>)}</div>
    <div className="tool-zoom"><button onClick={() => changeZoom(zoom / 1.15)} title="Thu nhỏ" aria-label="Thu nhỏ">−</button><span id="zoomLabel">{Math.round(zoom * 100)}%</span><button onClick={() => changeZoom(zoom * 1.15)} title="Phóng to" aria-label="Phóng to">+</button></div>
    <button className="toolbtn" onClick={fit} title="Vừa màn hình"><Icon name="fit" size="sm"/></button>
  </div>;
}
