import { useState } from 'react';
import type { ProjectSessionSnapshot } from '@diagramai/local-storage';
import { parseWorkspaceLink, parseShareLink } from '@diagramai/sync-core';
import type { WorkspaceController } from './useWorkspace';
import type { SharedController } from './useShared';
import { Icon } from '../editor/Icon';
import type { ManualSyncController } from '../cloud/useManualSync';

export function WorkspacePanel({ workspace, shared, local, manual, linkBase, files }: { workspace: WorkspaceController; shared: SharedController; local: ProjectSessionSnapshot; manual: ManualSyncController; linkBase: string; files: () => void }) {
  const { library, state } = workspace;
  const [inputLink, setInputLink] = useState(''), [projectTitle, setProjectTitle] = useState(''), [drawingTitle, setDrawingTitle] = useState('');
  const [share, setShare] = useState<{ url: string; title: string; scope: string; owner?: boolean } | null>(null), [copyMessage, setCopyMessage] = useState('');
  const [ownerLink, setOwnerLink] = useState(''), [switchConfirmed, setSwitchConfirmed] = useState(false);
  const scoped = shared.active, busy = scoped ? shared.busy : workspace.busy;
  const error = scoped ? shared.error : workspace.error;
  const folders = scoped ? shared.catalog?.folders ?? [] : state?.folders ?? [];
  const mappings = scoped ? shared.mappings : state?.drawings ?? [];
  const selectedId = scoped ? folders[0]?.id : state?.selectedFolderId;
  const selected = folders.find((folder) => folder.id === selectedId);
  const root = !scoped && workspace.view === 'projects';
  const run = (work: () => Promise<void>) => { void (scoped ? shared.library : library).perform(work); };
  const currentId = local.store.getSnapshot().document.documentId;
  const showEditor = () => scoped ? shared.library.showEditor() : library.showEditor();
  const cards = scoped ? shared.catalog?.drawings ?? [] : state?.drawings.filter((item) => item.folderId === selectedId).map((item) => ({ id: item.cloudId, folderId: item.folderId, title: local.projects.find((record) => record.documentId === item.localId)?.title ?? 'Bản vẽ chưa tải' })) ?? [];
  const reveal = async (kind: 'project' | 'drawing', id: string, title: string) => {
    const url = await library.createScopedLink(linkBase, kind, id); setShare({ url, title, scope: kind === 'project' ? 'mọi bản vẽ trong Project này' : 'chỉ bản vẽ này' }); setCopyMessage('');
  };
  return <section className="workspace-surface workspace-panel" aria-label={root ? 'Kho Project' : 'Bản vẽ trong Project'}>
    <header className="workspace-heading"><div className="workspace-breadcrumb">
      {!scoped && <button className="btn" onClick={library.showProjects}>Kho</button>}
      {!root && <><span>/</span><h2>{selected?.title ?? (scoped ? 'Đang mở link chia sẻ…' : 'Project')}</h2></>}
      {root && <h2>Tất cả Project</h2>}{scoped && <span className="local-badge">Link chia sẻ · Xem &amp; sửa</span>}
    </div><div className="project-actions">
      <button className="btn" disabled={busy || manual.busy} onClick={manual.run}>{busy || manual.busy ? 'Đang cập nhật…' : 'Cập nhật kho ngay'}</button>
      {(!scoped || mappings.some((item) => item.localId === currentId)) && <button className="btn" onClick={showEditor}>Trở lại bản vẽ</button>}
      {scoped && <button className="btn" onClick={() => run(async () => { await shared.library.leave(); window.history.replaceState(null, '', `${window.location.pathname}#/`); library.showProjects(); })}>Về kho của tôi</button>}
    </div></header>
    {!scoped && state && <p>Kho chính: <code aria-label="Mã kho đang mở">{state.id}</code>. Dùng cùng link kho chính trên Web và Desktop; app nhớ sau lần mở đầu.</p>}
    {!scoped && workspace.pendingAccess && <div className="confirmation" role="status">Bạn vừa mở link kho chính khác. Kho hiện tại và mọi bản local vẫn được giữ. Xác nhận trong mục Link kho chính của tôi bên dưới để dùng link vừa mở.</div>}
    {error && <div className="storage-error" role="alert">{error}</div>}
    <p>Cloud đồng bộ thủ công hai chiều: tạo/sửa trên Web hoặc Desktop rồi bấm Đồng bộ để gửi; thiết bị kia bấm Đồng bộ để nhận. Tự lưu trên máy vẫn bật.</p>
    {share && <section className="confirmation share-result" aria-label={share.owner ? 'Link kho chính của bạn' : 'Link chia sẻ đã tạo'}><strong>{share.title}</strong><p>{share.owner ? 'Link kho chính dành riêng cho bạn, có quyền toàn kho. Dùng cùng link này trên Web và Desktop. Chỉ gửi link Project hoặc bản vẽ cho người khác, không gửi link kho chính.' : `Ai có link đều xem và sửa được ${share.scope}. Không cấp quyền sang Project hoặc bản vẽ khác.`}</p>
      <textarea aria-label={share.owner ? 'Link kho chính' : 'Link chia sẻ'} readOnly value={share.url} rows={2} spellCheck={false} autoComplete="off" onFocus={(event) => event.target.select()}/>
      <button className="btn" onClick={() => { void navigator.clipboard?.writeText(share.url).then(() => setCopyMessage('Đã sao chép link.')).catch(() => setCopyMessage('Chọn link rồi nhấn Ctrl+C.')); }}>Sao chép link</button><button className="btn" onClick={() => setShare(null)}>Ẩn link</button><span role="status">{copyMessage}</span>
    </section>}
    {!scoped && !state ? <div className="workspace-setup">
      <h3>Mở kho chính</h3><p>Dán link kho chính của bạn một lần. Web và Desktop dùng cùng kho; app nhớ quyền đã lưu, không tạo kho riêng cho mỗi máy. Không cần tài khoản hay mã quản trị.</p>
      <form className="workspace-form" onSubmit={(event) => { event.preventDefault(); run(async () => { library.showProjects(); await library.connect(parseWorkspaceLink(ownerLink)); setOwnerLink(''); }); }}>
        <label>Link kho chính<textarea aria-label="Link kho chính để mở" value={ownerLink} onChange={(event) => setOwnerLink(event.target.value)} rows={2} autoComplete="off" spellCheck={false}/></label><button className="btn primary" disabled={busy || workspace.loading || !ownerLink.trim()}>Mở kho chính</button>
      </form>
    </div> : <>
      {!scoped && <form className="workspace-form workspace-create" onSubmit={(event) => { event.preventDefault(); run(async () => { if (root) { await library.createFolder(projectTitle); setProjectTitle(''); } else await library.createDrawing(drawingTitle); }); }}>
        <label>{root ? 'Tên Project mới' : 'Tên bản vẽ mới'}<input aria-label={root ? 'Tên dự án mới' : 'Tên bản vẽ mới'} value={root ? projectTitle : drawingTitle} maxLength={100} onChange={(event) => root ? setProjectTitle(event.target.value) : setDrawingTitle(event.target.value)}/></label>
        <button className="btn primary" disabled={busy || !(root ? projectTitle : drawingTitle).trim()}>{root ? 'Tạo dự án' : 'Tạo bản vẽ'}</button>
      </form>}
      <div className="workspace-cards" role="list" aria-label={root ? 'Danh sách Project' : 'Danh sách bản vẽ'}>
        {root ? folders.map((folder) => <article className="workspace-card" key={folder.id} role="listitem" data-project-id={folder.id}>
          <button className="workspace-card-open" aria-label={folder.title} disabled={busy} onClick={() => run(() => library.selectFolder(folder.id))}><Icon name="file" size="lg"/><strong>{folder.title}</strong><small>{state?.drawings.filter((item) => item.folderId === folder.id).length ?? 0} bản vẽ</small></button>
          <button className="btn small" disabled={busy || state?.folders.find((item) => item.id === folder.id)?.pending} aria-label={`Chia sẻ Project ${folder.title}`} onClick={() => run(() => reveal('project', folder.id, folder.title))}>Chia sẻ</button>
        </article>) : cards.map((drawing) => {
          const mapping = mappings.find((item) => item.cloudId === drawing.id), record = local.projects.find((item) => item.documentId === mapping?.localId);
          const title = record?.title ?? drawing.title;
          return <article className="workspace-card" key={drawing.id} role="listitem" data-drawing-id={drawing.id}>
            <button className="workspace-card-open" aria-label={`Mở bản vẽ ${title}`} disabled={!mapping || local.busy} onClick={() => run(() => scoped ? shared.library.open(mapping!.localId) : library.open(mapping!.localId))}><Icon name="file" size="lg"/><strong>{title}</strong><small>{record ? `${record.nodeCount} hình · ${record.edgeCount} đường nối` : 'Đang tải bản vẽ…'}</small></button>
            {!scoped && <button className="btn small" disabled={busy || !state?.drawings.find((item) => item.cloudId === drawing.id)?.published} aria-label={`Chia sẻ bản vẽ ${title}`} onClick={() => run(() => reveal('drawing', drawing.id, title))}>Chia sẻ</button>}
          </article>;
        })}
      </div>
      {!root && !cards.length && !busy && <p className="workspace-empty">Project chưa có bản vẽ.</p>}
      {!root && !scoped && !state?.drawings.some((drawing) => drawing.localId === currentId) && <button className="btn" disabled={busy || !selected} onClick={() => run(() => library.enroll(currentId))}>Đưa bản đang mở vào dự án này</button>}
    </>}
    {!scoped && <footer className="workspace-utilities">
      <button className="btn" onClick={files}>File / Bản vẽ chỉ trên máy / Checkpoint</button>
      <details><summary>Mở link Project / bản vẽ</summary><form className="workspace-form" onSubmit={(event) => { event.preventDefault(); void shared.library.perform(async () => { const access = parseShareLink(inputLink); window.history.replaceState(null, '', `${window.location.pathname}#/share/${access.id}`); await shared.library.connect(access.id, access.key); }); }}><label>Link được chia sẻ<textarea aria-label="Link Project hoặc bản vẽ" value={inputLink} onChange={(event) => setInputLink(event.target.value)} autoComplete="off" spellCheck={false}/></label><button className="btn" disabled={!inputLink.trim()}>Mở link chia sẻ</button></form></details>
      {state && <details open={workspace.pendingAccess ? true : undefined}><summary>Link kho chính của tôi</summary>
        <p>Dùng link kho chính này cho cả Web và Desktop. Chỉ gửi link Project/bản vẽ từ nút Chia sẻ trên thẻ cho người khác; không gửi link kho chính vào chat.</p>
        <button className="btn" onClick={() => run(async () => { setShare({ url: await library.shareLink(linkBase), title: 'Link kho chính · dành riêng cho bạn', scope: 'toàn bộ kho', owner: true }); })}>Hiện link kho chính</button>
        <form className="workspace-form" onSubmit={(event) => { event.preventDefault(); run(async () => { if (!switchConfirmed) return; library.showProjects(); const access = ownerLink.trim() ? parseWorkspaceLink(ownerLink) : workspace.pendingAccess; if (!access) return; await library.connect(access, true); workspace.clearPendingAccess(); setOwnerLink(''); setSwitchConfirmed(false); setShare(null); }); }}>
          <label>Mở link kho chính khác<textarea aria-label="Link kho chính khác" placeholder={workspace.pendingAccess ? 'Đã nhận link vừa mở; chỉ cần xác nhận bên dưới.' : 'Dán link kho chính của bạn'} value={ownerLink} onChange={(event) => setOwnerLink(event.target.value)} autoComplete="off" spellCheck={false}/></label>
          <label><input type="checkbox" checked={switchConfirmed} onChange={(event) => setSwitchConfirmed(event.target.checked)}/>Tôi xác nhận đổi kho đang mở, giữ kho cũ và mọi bản local; không tự gộp dữ liệu.</label>
          <button className="btn" disabled={(!ownerLink.trim() && !workspace.pendingAccess) || !switchConfirmed || busy || manual.busy}>Dùng link kho chính này</button>
        </form>
        {workspace.archives.length > 0 && <section aria-label="Kho cũ được giữ"><p>Kho cũ vẫn còn cùng quyền và hàng đợi, không tự gửi sang kho mới. Chọn để quay lại:</p>{workspace.archives.map((archive) => <button className="btn" key={archive.id} disabled={!switchConfirmed || busy || manual.busy} onClick={() => run(async () => { await library.restoreWorkspace(archive.id); setSwitchConfirmed(false); setShare(null); })}>Mở lại kho {archive.id}</button>)}</section>}
      </details>}
    </footer>}
  </section>;
}
