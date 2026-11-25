import { useState } from 'react';
import type { ProjectSessionSnapshot } from '@diagramai/local-storage';
import { parseWorkspaceLink } from '@diagramai/sync-core';
import type { WorkspaceController } from './useWorkspace';

export function WorkspacePanel({ workspace, local, linkBase, close, files }: { workspace: WorkspaceController; local: ProjectSessionSnapshot; linkBase: string; close: () => void; files: () => void }) {
  const { library, state, busy, error } = workspace;
  const [inputLink, setInputLink] = useState(''), [projectTitle, setProjectTitle] = useState(''), [drawingTitle, setDrawingTitle] = useState(''), [share, setShare] = useState('');
  const run = (work: () => Promise<void>) => { void library.perform(work); };
  const currentId = local.store.getSnapshot().document.documentId;
  const selected = state?.folders.find((folder) => folder.id === state.selectedFolderId);
  return <div className="workspace-panel project-manager">
    {error && <div className="storage-error" role="alert">{error}</div>}
    {!state ? <>
      <p>Một kho chung cho Desktop và Web, không đăng nhập, không ghép mã từng bản vẽ. Tạo kho một lần rồi dùng cùng link riêng trên các máy.</p>
      <p>Tạo kho sẽ đưa các bản vẽ hiện có trên máy này vào “Dự án đầu tiên”. Không gộp các bản trùng tên hoặc xóa bản cũ.</p>
      <button className="btn primary" disabled={busy || workspace.loading} onClick={() => run(() => library.create())}>Tạo kho riêng và đưa bản vẽ trên máy vào kho</button>
      <form className="workspace-form" onSubmit={(event) => { event.preventDefault(); run(() => library.connect(parseWorkspaceLink(inputLink))); }}>
        <label>Đã có kho? Dán link riêng<textarea aria-label="Link riêng vào kho" value={inputLink} onChange={(event) => setInputLink(event.target.value)} rows={3} autoComplete="off" spellCheck={false}/></label>
        <button className="btn" disabled={busy || !inputLink.trim()}>Mở kho bằng link riêng</button>
      </form>
    </> : <>
      <div className="project-actions"><button className="btn" disabled={busy} onClick={() => run(() => library.synchronize(true))}>{busy ? 'Đang cập nhật kho…' : 'Cập nhật kho ngay'}</button><button className="btn" onClick={() => run(async () => { setShare(await library.shareLink(linkBase)); })}>Hiện link riêng của kho</button></div>
      {share && <section className="confirmation"><p><strong>Ai có link này có quyền vào toàn bộ kho.</strong> Giữ riêng, không gửi vào chat hoặc đăng công khai. Desktop chỉ cần dán link một lần; Web mở bằng link này. Hãy sao lưu link để không mất quyền khi xóa dữ liệu máy.</p><textarea aria-label="Link truy cập riêng của kho" readOnly value={share} rows={3} spellCheck={false} autoComplete="off" onFocus={(event) => event.target.select()}/><button className="btn small" onClick={() => setShare('')}>Ẩn link riêng</button></section>}
      <form className="workspace-form" onSubmit={(event) => { event.preventDefault(); run(async () => { await library.createFolder(projectTitle); setProjectTitle(''); }); }}>
        <label>Tên dự án mới<input aria-label="Tên dự án mới" value={projectTitle} maxLength={100} onChange={(event) => setProjectTitle(event.target.value)}/></label><button className="btn" disabled={busy || !projectTitle.trim()}>Tạo dự án</button>
      </form>
      <div className="workspace-browser">
        <nav aria-label="Danh sách dự án">{state.folders.map((folder) => <button key={folder.id} className={`btn ${folder.id === selected?.id ? 'primary' : ''}`} aria-pressed={folder.id === selected?.id} onClick={() => run(() => library.selectFolder(folder.id))}>{folder.title}{folder.pending ? ' · Chờ gửi' : ''}</button>)}</nav>
        <section aria-label="Các bản vẽ trong dự án"><h4>{selected?.title ?? 'Chọn dự án'}</h4>
          <form className="workspace-form" onSubmit={(event) => { event.preventDefault(); run(async () => { await library.createDrawing(drawingTitle); close(); }); }}>
            <label>Tên bản vẽ mới<input aria-label="Tên bản vẽ mới" value={drawingTitle} maxLength={100} onChange={(event) => setDrawingTitle(event.target.value)}/></label><button className="btn primary" disabled={busy || !selected || !drawingTitle.trim()}>Tạo bản vẽ</button>
          </form>
          <ul className="project-list">{state.drawings.filter((drawing) => drawing.folderId === selected?.id).map((drawing) => {
            const record = local.projects.find((item) => item.documentId === drawing.localId);
            return <li key={drawing.cloudId}><strong>{record?.title ?? 'Bản vẽ chưa tải trên máy'}</strong>{drawing.localId === currentId && <span> · Đang mở</span>}<small>{drawing.published ? 'Đã có trong kho' : 'Đã lưu local · Chờ đưa vào kho'}</small><button className="btn small" disabled={!record || local.busy} aria-label={`Mở bản vẽ ${record?.title ?? ''}`} onClick={() => run(async () => { await library.open(drawing.localId); close(); })}>Mở</button></li>;
          })}</ul>
          {!state.drawings.some((drawing) => drawing.localId === currentId) && <button className="btn" disabled={busy || !selected} onClick={() => run(async () => { await library.enroll(currentId); await library.synchronize(); })}>Đưa bản đang mở vào dự án này</button>}
        </section>
      </div>
      <p>Tạo/thêm bản vẽ trên máy này sẽ tự đưa vào dự án đang chọn. Bản local có sẵn trên máy mới và nhánh xung đột không tự gộp vào kho. Offline vẫn lưu local; có mạng sẽ gửi tiếp.</p>
    </>}
    <button className="btn" onClick={files}>File / Bản vẽ chỉ trên máy / Checkpoint</button>
  </div>;
}
