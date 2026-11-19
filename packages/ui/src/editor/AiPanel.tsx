import { useEffect, useRef, useState } from 'react';
import { Icon } from './Icon';

export function AiPanel() {
  const [prompt, setPrompt] = useState('');
  const [messages, setMessages] = useState<{ role: 'user' | 'ai'; text: string }[]>([]);
  const chat = useRef<HTMLDivElement>(null);
  useEffect(() => { if (chat.current) chat.current.scrollTop = chat.current.scrollHeight; }, [messages]);
  return <>
    <div className="ai-intro"><div className="ai-icon"><Icon name="sparkle" size="lg"/></div><h3>Vẽ nhanh hơn cùng AI</h3><p>Mô tả quy trình bằng tiếng Việt. AI giúp tạo, bổ sung và phân tích sơ đồ của bạn.</p><span className="ai-tag">✦ ENGINE P3 · CHƯA KẾT NỐI AI</span></div>
    <div className="chatbox" ref={chat} aria-live="polite"><div className="ai-msg"><div className="ai-avatar"><Icon name="sparkle" size="sm"/></div><div className="msg-bubble"><strong>Chào bạn!</strong><br/>Bạn có thể thêm, kéo, resize hình và nhấp đúp để sửa chữ. AI chưa được kết nối; sơ đồ hiện chỉ trong bộ nhớ.</div></div>{messages.map((message, index) => <div key={index} className={`ai-msg ${message.role === 'user' ? 'user' : ''}`}>{message.role === 'ai' && <div className="ai-avatar"><Icon name="sparkle" size="sm"/></div>}<div className="msg-bubble">{message.text}</div></div>)}</div>
    <div className="chat-area"><div className="suggestions">{[['+ Kiểm tra chất lượng', 'Thêm bước kiểm tra chất lượng'], ['Phân tích logic', 'Phân tích logic sơ đồ'], ['Tự căn chỉnh', 'Sắp xếp sơ đồ cho gọn']].map(([label, value]) => <button key={label} className="suggestion" onClick={() => setPrompt(value)}>{label}</button>)}</div>
      <form className="promptbox" onSubmit={(event) => { event.preventDefault(); const text = prompt.trim().slice(0, 2000); if (!text) return; setMessages((previous) => [...previous.slice(-18), { role: 'user', text }, { role: 'ai', text: 'AI chưa được kết nối (P6). Yêu cầu chưa gửi lên máy chủ và sơ đồ không bị thay đổi.' }]); setPrompt(''); }}><textarea aria-label="Yêu cầu cho trợ lý AI" placeholder="VD: Thêm bước kiểm tra chất lượng trước khi nhập kho..." maxLength={2000} value={prompt} onChange={(event) => setPrompt(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }}/><div className="prompt-footer"><span className="model-tag"><Icon name="info" size="sm"/> Chưa kết nối AI</span><button type="submit" className="send" title="Gửi" disabled={!prompt.trim()}><Icon name="arrow" size="sm"/></button></div></form>
    </div>
  </>;
}
