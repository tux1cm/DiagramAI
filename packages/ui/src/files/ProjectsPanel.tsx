import { useEffect, useState } from 'react';
import { type ProjectSession, type ProjectSessionSnapshot, type ProjectSummary, type StoredProject } from '@diagramai/local-storage';

export function ProjectsPanel({ session, state, close, notice, saveFile, openFile }: {
  session: ProjectSession; state: ProjectSessionSnapshot; close: () => void; notice: (message: string) => void;
  saveFile: (saveAs?: boolean, download?: boolean) => Promise<void>; openFile: () => Promise<void>;
}) {
  const [name, setName] = useState('Sơ đồ mới'), [rename, setRename] = useState<{ id: string; title: string } | null>(null);
  const [deleting, setDeleting] = useState<ProjectSummary | null>(null), [restoring, setRestoring] = useState<number | null>(null);
  const [checkpoints, setCheckpoints] = useState<StoredProject[]>([]), [discard, setDiscard] = useState(false);
  useEffect(() => { void session.checkpoints().then(setCheckpoints).catch(() => notice('Không đọc được checkpoint.')); }, [session, state.version, notice]);
  const run = async (work: () => Promise<void>, shouldClose = false) => {
    try { await work(); if (shouldClose) close(); }
    catch (error) { notice(error instanceof Error ? error.message : 'Thao tác local chưa hoàn tất.'); }
  };
  const active = state.store.getSnapshot().document.documentId;
  return <div className="project-manager">
    <p>Dữ liệu local nằm trên {session.repository.kind === 'sqlite' ? 'máy này (SQLite)' : 'trình duyệt này (IndexedDB)'}. Kho chung Dự án → Bản vẽ nằm trong Quản lý; trạng thái xác nhận nằm ở nút Cloud. Nên xuất .diagramai để dự phòng.</p>
    <div className="project-create"><label>Tên sơ đồ mới<input aria-label="Tên sơ đồ mới" maxLength={100} value={name} onChange={(event) => setName(event.target.value)}/></label><button className="btn primary" disabled={state.busy || !name.trim()} onClick={() => void run(() => session.createProject(name), true)}>Tạo sơ đồ</button></div>
    <div className="project-actions"><button className="btn" onClick={() => void openFile()}>Nhập file .diagramai</button><button className="btn" onClick={() => void saveFile(true)}>Lưu thành file mới</button><button className="btn" onClick={() => void saveFile(true, true)}>Tải xuống .diagramai</button><button className="btn" disabled={state.busy} onClick={() => void run(() => session.forkCurrent(), true)}>Lưu thành sơ đồ mới</button><button className="btn" disabled={state.busy} onClick={() => void run(() => session.retry())}>Thử lưu local lại</button></div>
    {(state.status === 'error' || state.status === 'conflict') && <div className="storage-error" role="alert"><p>{state.message}</p><p>Bản trong bộ nhớ chưa bị ghi đè. Hãy xuất file hoặc Lưu thành sơ đồ mới trước khi tải lại bản trên máy.</p><button className="btn" onClick={() => setDiscard(true)}>Tải lại bản trên máy…</button></div>}
    {discard && <div className="confirmation"><p>Bỏ thay đổi chưa lưu trong bộ nhớ và mở bản đã lưu trên máy?</p><button className="btn" onClick={() => setDiscard(false)}>Không, giữ bản hiện tại</button><button className="btn" onClick={() => void run(() => session.reloadSaved(), true)}>Bỏ thay đổi và tải lại</button></div>}
    <h3>Sơ đồ trên máy</h3>
    <ul className="project-list">{state.projects.map((project) => <li key={project.documentId} data-project={project.documentId}>
      <div><strong>{project.title}</strong>{project.documentId === active && <span className="local-badge">Đang mở</span>}<p>{project.nodeCount} hình · {project.edgeCount} cạnh · {new Date(project.savedAt).toLocaleString('vi-VN')}</p></div>
      <div className="project-row-actions"><button className="btn small" aria-label={`Mở sơ đồ ${project.title}`} disabled={state.busy || project.documentId === active} onClick={() => void run(() => session.openProject(project.documentId), true)}>Mở</button><button className="btn small" aria-label={`Đổi tên sơ đồ ${project.title}`} onClick={() => setRename({ id: project.documentId, title: project.title })}>Đổi tên</button><button className="btn small" aria-label={`Nhân đôi sơ đồ ${project.title}`} disabled={state.busy} onClick={() => void run(() => session.duplicateProject(project.documentId), true)}>Nhân đôi</button><button className="btn small" aria-label={`Xóa sơ đồ ${project.title}`} onClick={() => setDeleting(project)}>Xóa…</button></div>
    </li>)}</ul>
    {rename && <form className="confirmation" onSubmit={(event) => { event.preventDefault(); void run(async () => { await session.renameProject(rename.id, rename.title); setRename(null); }); }}><label>Tên sơ đồ<input aria-label="Đổi tên sơ đồ" maxLength={100} value={rename.title} onChange={(event) => setRename({ ...rename, title: event.target.value })}/></label><button className="btn primary" disabled={state.busy || !rename.title.trim()}>Xác nhận đổi tên</button><button className="btn" type="button" onClick={() => setRename(null)}>Hủy đổi tên</button></form>}
    {deleting && <div className="confirmation"><p>Xóa “{deleting.title}” và mọi checkpoint local của sơ đồ này? Thao tác không thể hoàn tác. File ngoài ổ đĩa không bị xóa.</p><button className="btn" onClick={() => setDeleting(null)}>Hủy xóa</button><button className="btn danger" disabled={state.busy} onClick={() => void run(async () => { await session.removeProject(deleting.documentId, deleting.version); setDeleting(null); })}>Xác nhận xóa sơ đồ</button></div>}
    <h3>Khôi phục checkpoint</h3><p>Giữ tối đa 20 bản ghi gần nhất. Khôi phục tạo một bản lưu mới, không sửa file ngoài ổ đĩa.</p>
    <div className="checkpoint-list">{checkpoints.map((checkpoint) => <button className="btn small" key={checkpoint.version} disabled={state.busy || checkpoint.version === state.version} onClick={() => setRestoring(checkpoint.version)}>Bản {checkpoint.version} · {new Date(checkpoint.savedAt).toLocaleString('vi-VN')}</button>)}</div>
    {restoring !== null && <div className="confirmation"><p>Khôi phục nội dung checkpoint {restoring}? Bản hiện tại được ghi lại trước khi khôi phục.</p><button className="btn" onClick={() => setRestoring(null)}>Hủy khôi phục</button><button className="btn primary" disabled={state.busy} onClick={() => void run(() => session.restoreCheckpoint(restoring), true)}>Xác nhận khôi phục</button></div>}
  </div>;
}
