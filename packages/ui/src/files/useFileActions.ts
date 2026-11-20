import { useCallback, useRef, useState } from 'react';
import type { ProjectSession } from '@diagramai/local-storage';
import { chooseSaveTarget, diagramBlob, openDiagramFile, suggestedName, type FileReference, type FileWriteResult } from './file-port';

export function fileResultMessage(result: FileWriteResult) {
  return result.status === 'written' ? `Đã ghi file ${result.name}.` : result.status === 'download-started' ? `Đã tạo tệp tải xuống ${result.name}. Kiểm tra trình duyệt/thư mục tải xuống để xác nhận.` : '';
}
export function useFileActions(session: ProjectSession, notice: (message: string) => void) {
  const reference = useRef<FileReference | undefined>(undefined), running = useRef(false);
  const [busy, setBusy] = useState(false);
  const save = useCallback(async (saveAs = false, download = false) => {
    if (running.current) return;
    if (session.getSnapshot().store.getSnapshot().interaction) { notice('Hãy kết thúc hoặc hủy thao tác kéo trước khi lưu file.'); return; }
    running.current = true; setBusy(true);
    try {
      const document = session.getSnapshot().store.getSnapshot().document, blob = diagramBlob(document);
      // Choose under the user's gesture, before awaiting local writes/export work.
      const target = await chooseSaveTarget(suggestedName(document.title, 'document'), 'document', saveAs ? undefined : reference.current, download);
      if (!target) return;
      const result = await target.write(blob);
      if (result.reference) reference.current = result.reference;
      const message = fileResultMessage(result); if (message) notice(message);
      // File backup must remain usable even when the local repository is failing.
      await session.flush().catch(() => { /* The persistent storage warning stays visible. */ });
    } catch (error) { notice(error instanceof Error ? error.message : 'Không ghi được file. Dữ liệu trong bộ nhớ vẫn được giữ nguyên.'); }
    finally { running.current = false; setBusy(false); }
  }, [session, notice]);
  const open = useCallback(async () => {
    if (running.current) return; running.current = true; setBusy(true);
    try { const document = await openDiagramFile(); if (document) await session.importDocument(document); }
    catch (error) { notice(error instanceof Error ? error.message : 'Không mở được file; bản đang vẽ được giữ nguyên.'); }
    finally { running.current = false; setBusy(false); }
  }, [session, notice]);
  return { busy, save, open };
}
