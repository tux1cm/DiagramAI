import { useEffect, useRef, useState } from 'react';
import { FILLS, SHAPES, type EditorViewState } from './fixture';
import { Icon } from './Icon';

export type InspectorTab = 'ai' | 'properties';
export function Inspector({ state, activeTab, setTab, collapsed, setFill }: {
  state: EditorViewState; activeTab: InspectorTab; setTab: (tab: InspectorTab) => void;
  collapsed: boolean; setFill: (fill: string) => void;
}) {
  const [prompt, setPrompt] = useState('');
  const [messages, setMessages] = useState<{ role: 'user' | 'ai'; text: string }[]>([]);
  const chat = useRef<HTMLDivElement>(null);
  useEffect(() => { if (chat.current) chat.current.scrollTop = chat.current.scrollHeight; }, [messages]);
  const node = state.selection?.kind === 'node' ? state.nodes.find((node) => node.id === state.selection?.id) : undefined;
  const edge = state.selection?.kind === 'edge' ? state.edges.find((edge) => edge.id === state.selection?.id) : undefined;
  const tabs: InspectorTab[] = ['ai', 'properties'];
  return <aside className={`inspector ${collapsed ? 'is-collapsed' : ''}`} aria-label="Trợ lý và thuộc tính">
    <div className="tabbar" role="tablist" aria-label="Bảng bên phải">{tabs.map((tab, i) => <button key={tab} id={`tab-${tab}`} className={`tab ${activeTab === tab ? 'active' : ''}`} role="tab" aria-selected={activeTab === tab} aria-controls={`panel-${tab}`} tabIndex={activeTab === tab ? 0 : -1} onClick={() => setTab(tab)} onKeyDown={(event) => { if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); const target = tabs[1 - i]; setTab(target); document.getElementById(`tab-${target}`)?.focus(); } }}><Icon name={tab === 'ai' ? 'sparkle' : 'settings'}/>{tab === 'ai' ? 'Trợ lý AI' : 'Thuộc tính'}</button>)}</div>
    <div id="panel-ai" className={`tabcontent ${activeTab === 'ai' ? '' : 'hidden'}`} role="tabpanel" aria-labelledby="tab-ai">
      <div className="ai-intro"><div className="ai-icon"><Icon name="sparkle" size="lg"/></div><h3>Vẽ nhanh hơn cùng AI</h3><p>Mô tả quy trình bằng tiếng Việt. AI giúp tạo, bổ sung và phân tích sơ đồ của bạn.</p><span className="ai-tag">✦ GIAO DIỆN P1 · CHƯA KẾT NỐI AI</span></div>
      <div className="chatbox" ref={chat} aria-live="polite"><div className="ai-msg"><div className="ai-avatar"><Icon name="sparkle" size="sm"/></div><div className="msg-bubble"><strong>Chào bạn!</strong><br/>Đây là giao diện P1. Bạn có thể chọn hình mẫu và thử màu trong tab Thuộc tính. AI chưa được kết nối.</div></div>{messages.map((message, index) => <div key={index} className={`ai-msg ${message.role === 'user' ? 'user' : ''}`}>{message.role === 'ai' && <div className="ai-avatar"><Icon name="sparkle" size="sm"/></div>}<div className="msg-bubble">{message.text}</div></div>)}</div>
      <div className="chat-area"><div className="suggestions">{[['+ Kiểm tra chất lượng', 'Thêm bước kiểm tra chất lượng'], ['Phân tích logic', 'Phân tích logic sơ đồ'], ['Tự căn chỉnh', 'Sắp xếp sơ đồ cho gọn']].map(([label, value]) => <button key={label} className="suggestion" onClick={() => setPrompt(value)}>{label}</button>)}</div>
        <form className="promptbox" onSubmit={(event) => { event.preventDefault(); const text = prompt.trim().slice(0, 2000); if (!text) return; setMessages((previous) => [...previous.slice(-18), { role: 'user', text }, { role: 'ai', text: 'AI chưa được kết nối (P6). Yêu cầu chưa gửi lên máy chủ và sơ đồ không bị thay đổi.' }]); setPrompt(''); }}><textarea aria-label="Yêu cầu cho trợ lý AI" placeholder="VD: Thêm bước kiểm tra chất lượng trước khi nhập kho..." maxLength={2000} value={prompt} onChange={(event) => setPrompt(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }}/><div className="prompt-footer"><span className="model-tag"><Icon name="info" size="sm"/> Chưa kết nối AI</span><button type="submit" className="send" title="Gửi" disabled={!prompt.trim()}><Icon name="arrow" size="sm"/></button></div></form>
      </div>
    </div>
    <div id="panel-properties" className={`tabcontent ${activeTab === 'properties' ? '' : 'hidden'}`} role="tabpanel" aria-labelledby="tab-properties"><div className="prop-content">
      {!node && !edge && <><h3>Thuộc tính</h3><p>Chọn một hình khối hoặc đường nối để xem thông tin. Thử màu trên hình mẫu; thay đổi chưa được lưu.</p><div className="feature-card"><span>Hình khối</span><strong>{state.nodes.length}</strong></div><div className="feature-card"><span>Đường nối</span><strong>{state.edges.length}</strong></div></>}
      {node && <><h3>Chỉnh sửa hình khối</h3><p>{SHAPES.find((shape) => shape.id === node.type)?.name} · Hình mẫu P1, chỉ thử màu</p><div className="field"><label htmlFor="property-label">Nội dung</label><textarea id="property-label" value={node.label} readOnly title="Sửa chữ thuộc P2"/></div><div className="field"><label>Màu nền</label><div className="swatches">{FILLS.map((fill) => <button key={fill} className={`swatch ${node.fill === fill ? 'on' : ''}`} style={{ background: fill }} title={fill} aria-label={`Màu nền ${fill}`} aria-pressed={node.fill === fill} onClick={() => setFill(fill)}/>)}</div></div><div className="field"><label>Định dạng</label><div className="feature-card"><span>Vị trí</span><strong>X: {node.x} · Y: {node.y}</strong></div><div className="feature-card"><span>Kích thước</span><strong>{node.w} × {node.h}</strong></div></div><p className="property-note">Màu chỉ thay đổi trong bộ nhớ của phiên này. Sửa chữ, resize và Undo/Redo thuộc P2.</p><button className="btn" disabled title="Nhân đôi thuộc P2"><Icon name="copy" size="sm"/> Nhân đôi</button>{' '}<button className="btn" disabled title="Xóa thuộc P2"><Icon name="trash" size="sm"/> Xóa</button></>}
      {edge && <><h3>Thuộc tính đường nối</h3><p>Đường nối mẫu. Chỉnh sửa cạnh thuộc P2/P3.</p><div className="field"><label htmlFor="edge-label">Nhãn đường nối</label><input id="edge-label" value={edge.label} readOnly title="Sửa nhãn thuộc P2"/></div><div className="feature-card"><span>Từ</span><strong>{state.nodes.find((node) => node.id === edge.from)?.label}</strong></div><div className="feature-card"><span>Đến</span><strong>{state.nodes.find((node) => node.id === edge.to)?.label}</strong></div></>}
    </div></div>
  </aside>;
}
