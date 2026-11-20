import { useState } from 'react';
import type { ProjectSession } from '@diagramai/local-storage';
import { chooseSaveTarget, suggestedName, type FileKind } from './file-port';
import { fileResultMessage } from './useFileActions';

export function ExportPanel({ session, basePath, notice }: { session: ProjectSession; basePath: string; notice: (message: string) => void }) {
  const [kind, setKind] = useState<'svg' | 'png' | 'pdf'>('svg'), [transparent, setTransparent] = useState(false), [scale, setScale] = useState(2), [busy, setBusy] = useState(false);
  const exportFile = async (download = false) => {
    if (busy) return;
    if (session.getSnapshot().store.getSnapshot().interaction) { notice('Hãy kết thúc thao tác kéo trước khi xuất.'); return; }
    setBusy(true);
    try {
      const document = session.getSnapshot().store.getSnapshot().document;
      const target = await chooseSaveTarget(suggestedName(document.title, kind as FileKind), kind, undefined, download);
      if (!target) return;
      const { exportArtifact } = await import('./export-artifacts');
      const blob = await exportArtifact(document, kind, basePath, { transparent, scale });
      const result = await target.write(blob), message = fileResultMessage(result); if (message) notice(message);
    } catch (error) { notice(error instanceof Error ? error.message : 'Không xuất được file; bản vẽ được giữ nguyên.'); }
    finally { setBusy(false); }
  };
  return <div className="export-panel">
    <p>Xuất toàn bộ sơ đồ, không phụ thuộc pan/zoom hoặc vùng đang chọn. Bản .diagramai mới giữ dữ liệu để sửa tiếp.</p>
    <label>Định dạng<select aria-label="Định dạng xuất" value={kind} onChange={(event) => setKind(event.target.value as typeof kind)}><option value="svg">SVG — vector, giữ text</option><option value="png">PNG — ảnh, font tiếng Việt nhúng</option><option value="pdf">PDF — A4 tự chọn ngang/dọc, font nhúng</option></select></label>
    {kind !== 'pdf' && <label className="export-checkbox"><input type="checkbox" checked={transparent} onChange={(event) => setTransparent(event.target.checked)}/>Nền trong suốt</label>}
    {kind === 'png' && <label>Tỷ lệ ảnh<select aria-label="Tỷ lệ xuất PNG" value={scale} onChange={(event) => setScale(Number(event.target.value))}><option value="1">1×</option><option value="2">2×</option><option value="3">3×</option></select></label>}
    <p>SVG giữ font đã chọn và dùng font thay thế nếu máy đích thiếu font. PNG/PDF dùng Noto Sans nhúng để hiển thị đúng tiếng Việt; PDF fit toàn sơ đồ vào một trang A4, sơ đồ quá lớn có thể nhỏ chữ.</p>
    <div className="project-actions"><button className="btn primary" disabled={busy} onClick={() => void exportFile()}>{busy ? 'Đang xuất…' : 'Chọn nơi lưu và xuất'}</button><button className="btn" disabled={busy} onClick={() => void exportFile(true)}>Tải xuống file xuất</button></div>
  </div>;
}
