import { useState } from 'react';
import type { DiagramDocument } from '@diagramai/diagram-core';
import type { CloudController } from './useCloud';
import { chooseSaveTarget, diagramBlob, suggestedName } from '../files/file-port';
import { fileResultMessage } from '../files/useFileActions';

export const CLOUD_LABELS = { local: 'Chưa liên kết', pending: 'Chờ đồng bộ', syncing: 'Đang đồng bộ…', synced: 'Đã đồng bộ', offline: 'Offline · Chờ đồng bộ', conflict: 'Xung đột', revoked: 'Quyền không hợp lệ', error: 'Lỗi đồng bộ' };
export function CloudPanel({ cloud, document, notice, saveLocal }: { cloud: CloudController; document: DiagramDocument; notice: (message: string) => void; saveLocal: () => void }) {
  const [code, setCode] = useState(''), [recoveryText, setRecoveryText] = useState(''), [consent, setConsent] = useState(false);
  const [revoke, setRevoke] = useState<string | null>(null), [unlinking, setUnlinking] = useState(false);
  const [deleting, setDeleting] = useState(false), [deleteConfirmed, setDeleteConfirmed] = useState(false);
  const [revokeOnRecovery, setRevokeOnRecovery] = useState(false);
  const owner = cloud.devices.find((device) => device.id === cloud.link?.deviceId)?.scope === 'owner';
  const exportCloud = async () => {
    const remote = cloud.link?.conflict?.document; if (!remote) return;
    try {
      const target = await chooseSaveTarget(suggestedName(`${remote.title} (cloud)`, 'document'), 'document', undefined, true);
      if (target) notice(fileResultMessage(await target.write(diagramBlob(remote))));
    } catch { notice('Chưa xuất được bản cloud. Hai bản vẫn được giữ trong kho local.'); }
  };
  return <div className="cloud-panel project-manager">
    <p>Đồng bộ riêng cho từng sơ đồ, không cần tài khoản. Web/Desktop vẫn lưu local trước; không có quyền thiết bị thì không đọc được dự án cloud.</p>
    {cloud.error && <div className="storage-error" role="alert">{cloud.error}</div>}
    {cloud.recovery && <section className="confirmation" aria-label="Sao lưu mã khôi phục">
      <h4>Mã khôi phục · {cloud.recovery.title}</h4><p>Mã chỉ hiện một lần. Lưu vào nơi riêng tư hoặc trình quản lý mật khẩu. Người có mã này có thể nhận quyền chủ dự án. Mất mọi thiết bị và mất mã thì không thể khôi phục bằng email.</p>
      <textarea aria-label="Mã khôi phục dự án" readOnly rows={4} spellCheck={false} autoComplete="off" value={`diagramai-recovery-v1:${cloud.recovery.projectId}:${cloud.recovery.key}`} onFocus={(event) => event.target.select()}/>
      <p>Chọn và sao chép mã bằng Ctrl+C. Mã không nằm trong file .diagramai hoặc đường dẫn chia sẻ.</p>
      <button className="btn primary" onClick={cloud.confirmRecoverySaved}>Tôi đã sao lưu mã khôi phục</button>
    </section>}
    {!cloud.link ? <section>
      <h4>Bật đồng bộ cho “{document.title}”</h4>
      <label className="export-checkbox"><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)}/>Tôi đồng ý tải nội dung sơ đồ này lên cloud và sẽ sao lưu mã khôi phục.</label>
      <button className="btn primary" disabled={cloud.busy || !consent} onClick={() => void cloud.create()}>Bật đồng bộ cho dự án này</button>
    </section> : <section>
      <h4>{cloud.link.conflict ? 'Xung đột' : CLOUD_LABELS[cloud.state.status === 'local' ? 'pending' : cloud.state.status]}</h4>
      <p>Revision đã xác nhận: {cloud.link.baseRevision}. {cloud.state.message} Dự án: <code>{cloud.link.projectId}</code></p>
      <div className="project-actions"><button className="btn primary" disabled={cloud.busy || Boolean(cloud.link.conflict)} onClick={() => void cloud.syncNow()}>Đồng bộ ngay</button><button className="btn" disabled={cloud.busy} onClick={() => void cloud.makeCode()}>Tạo mã liên kết</button><button className="btn" disabled={cloud.busy} onClick={() => void cloud.loadDevices()}>Xem thiết bị đã ghép</button><button className="btn" disabled={cloud.busy} onClick={() => setUnlinking(true)}>Ngắt liên kết trên máy này…</button></div>
      {cloud.pairing && <div className="confirmation"><p>Nhập mã này trên Web/Desktop đích. Dùng một lần, chỉ cấp quyền chỉnh sửa dự án đang chọn.</p><output className="pairing-code" aria-label="Mã liên kết thiết bị">{cloud.pairing.code}</output><p>Hết hạn lúc {new Date(cloud.pairing.expiresAt).toLocaleTimeString('vi-VN')}. Tạo mã mới sẽ vô hiệu mã trước từ thiết bị này. Không gửi mã cho người lạ.</p></div>}
      {cloud.link.conflict && <div className="storage-error" role="alert"><h4>Đã giữ cả bản local và bản cloud</h4>
        <p>Local: {document.nodes.length} hình / {document.edges.length} cạnh. Cloud revision {cloud.link.conflict.revision}: {cloud.link.conflict.document.nodes.length} hình / {cloud.link.conflict.document.edges.length} cạnh.</p>
        <p>Không tự ghép hoặc ghi đè. Khi chọn bản cloud, bản local hiện tại được lưu thêm thành sơ đồ riêng trước khi thay editor.</p>
        <div className="project-actions"><button className="btn" onClick={saveLocal}>Xuất bản local .diagramai</button><button className="btn" onClick={() => void exportCloud()}>Xuất bản cloud .diagramai</button><button className="btn primary" disabled={cloud.busy} onClick={() => void cloud.useCloud(false)}>Dùng bản cloud, giữ bản local riêng</button><button className="btn" disabled={cloud.busy} onClick={() => void cloud.useCloud(true)}>Mở bản local thành dự án riêng</button></div>
      </div>}
      {cloud.devices.length > 0 && <ul className="project-list">{cloud.devices.map((device) => <li key={device.id}><strong>{device.deviceLabel}</strong> · {device.scope === 'owner' ? 'Chủ dự án' : 'Chỉnh sửa'}{device.id === cloud.link?.deviceId && ' · Máy này'}{device.revokedAt ? ' · Đã thu hồi' : owner && device.id !== cloud.link?.deviceId && <button className="btn small" disabled={cloud.busy} onClick={() => setRevoke(device.id)}>Thu hồi quyền…</button>}</li>)}</ul>}
      {revoke && <div className="confirmation"><p>Thu hồi quyền thiết bị này? Nó không thể đọc/đẩy thay đổi cloud hoặc dùng mã ghép đã tạo nữa. Bản local trên thiết bị đó không bị xóa.</p><button className="btn" onClick={() => setRevoke(null)}>Hủy thu hồi</button><button className="btn danger" disabled={cloud.busy} onClick={() => { void cloud.revoke(revoke); setRevoke(null); }}>Xác nhận thu hồi</button></div>}
      {unlinking && <div className="confirmation"><p>Chỉ bỏ quyền/liên kết trên máy này; giữ sơ đồ local, không xóa dự án cloud. Các thay đổi đang chờ sẽ không tự gửi nữa. Hãy giữ mã khôi phục hoặc quyền trên máy khác trước khi tiếp tục.</p><button className="btn" onClick={() => setUnlinking(false)}>Giữ liên kết</button><button className="btn danger" disabled={cloud.busy} onClick={() => { void cloud.unlink(); setUnlinking(false); }}>Xác nhận ngắt liên kết local</button></div>}
      {owner && <button className="btn danger" disabled={cloud.busy} onClick={() => setDeleting(true)}>Xóa dự án trên cloud…</button>}
      {deleting && <div className="confirmation" role="alert"><p>Xóa vĩnh viễn mọi snapshot, lịch sử và quyền thiết bị của dự án này trên cloud? Mã khôi phục cũng không còn dùng được. Bản local trên các máy không bị xóa. Nếu có xung đột, cần dự phòng cả hai nhánh trước.</p><label className="export-checkbox"><input type="checkbox" checked={deleteConfirmed} onChange={(event) => setDeleteConfirmed(event.target.checked)}/>Tôi đã dự phòng các bản cần giữ và hiểu rằng không thể khôi phục cloud sau khi xóa.</label><button className="btn" onClick={() => setDeleting(false)}>Không xóa cloud</button><button className="btn danger" disabled={cloud.busy || !deleteConfirmed} onClick={() => { void cloud.deleteProject(); setDeleting(false); }}>Xác nhận xóa vĩnh viễn cloud</button></div>}
    </section>}
    <section className="cloud-join"><h4>Liên kết một dự án từ thiết bị khác</h4><p>Việc liên kết tạo sơ đồ local mới, không ghi đè bản đang mở.</p><form onSubmit={(event) => { event.preventDefault(); void cloud.join(code); }}><label>Mã một lần<input aria-label="Nhập mã liên kết" value={code} maxLength={10} autoComplete="off" spellCheck={false} onChange={(event) => setCode(event.target.value.toUpperCase())}/></label><button className="btn primary" disabled={cloud.busy || code.trim().length !== 10}>Liên kết dự án</button></form></section>
    <section className="cloud-join"><h4>Khôi phục khi không còn máy nguồn</h4><form onSubmit={(event) => { event.preventDefault(); void cloud.recover(recoveryText, revokeOnRecovery); }}><label>Chuỗi khôi phục<textarea aria-label="Nhập mã khôi phục" value={recoveryText} rows={3} maxLength={180} autoComplete="off" spellCheck={false} onChange={(event) => setRecoveryText(event.target.value)}/></label><label className="export-checkbox"><input type="checkbox" checked={revokeOnRecovery} onChange={(event) => setRevokeOnRecovery(event.target.checked)}/>Thu hồi quyền tất cả thiết bị cũ khi khôi phục (nếu mất máy/token hoặc đã đủ 10 thiết bị). Bản local trên các máy đó không bị xóa.</label><button className="btn" disabled={cloud.busy || !recoveryText.trim()}>Khôi phục quyền dự án</button></form></section>
    <p>Đồng bộ khi đang mở app (poll khoảng 15 giây), khi có mạng/focus lại hoặc bấm Đồng bộ ngay; không phải cộng tác realtime. AI chưa bật ở P5.</p>
  </div>;
}
