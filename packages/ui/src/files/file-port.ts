import { invoke, isTauri } from '@tauri-apps/api/core';
import { migrateDocument, serializeDocument, type DiagramDocument } from '@diagramai/diagram-core';
import { MAX_DOCUMENT_BYTES } from '@diagramai/local-storage';

export type FileKind = 'document' | 'svg' | 'png' | 'pdf';
interface WebHandle { name: string; getFile(): Promise<File>; createWritable(): Promise<{ write(blob: Blob): Promise<void>; close(): Promise<void>; abort?(): Promise<void> }>; requestPermission?(options: { mode: 'readwrite' }): Promise<string> }
export type FileReference = { kind: 'native'; token: string; name: string } | { kind: 'web'; handle: WebHandle };
interface Pickers { showOpenFilePicker?: (options: unknown) => Promise<WebHandle[]>; showSaveFilePicker?: (options: unknown) => Promise<WebHandle> }
const types = { document: { extension: 'diagramai', mime: 'application/json' }, svg: { extension: 'svg', mime: 'image/svg+xml' }, png: { extension: 'png', mime: 'image/png' }, pdf: { extension: 'pdf', mime: 'application/pdf' } };
export function suggestedName(title: string, kind: FileKind) { return `${[...title].map((c) => c.charCodeAt(0) < 32 || '<>:"/\\|?*'.includes(c) ? '_' : c).join('').replace(/[. ]+$/, '').slice(0, 90) || 'DiagramAI'}.${types[kind].extension}`; }
export function parseDiagramFile(text: string): DiagramDocument {
  if (new TextEncoder().encode(text).length > MAX_DOCUMENT_BYTES) throw new Error('File vượt giới hạn 2 MB.');
  try { return migrateDocument(JSON.parse(text)); }
  catch { throw new Error('File không phải sơ đồ DiagramAI hợp lệ, bị hỏng hoặc có phiên bản chưa hỗ trợ. Bản đang mở được giữ nguyên.'); }
}
export function diagramBlob(document: DiagramDocument) {
  const text = serializeDocument(document);
  if (new TextEncoder().encode(text).length > MAX_DOCUMENT_BYTES) throw new Error('Sơ đồ vượt giới hạn file 2 MB.');
  return new Blob([text], { type: 'application/json;charset=utf-8' });
}
export async function openDiagramFile(): Promise<DiagramDocument | null> {
  if (isTauri()) {
    const file = await invoke<{ text: string } | null>('native_open_file');
    return file ? parseDiagramFile(file.text) : null;
  }
  const pickers = window as unknown as Pickers;
  if (pickers.showOpenFilePicker) {
    try {
      const [handle] = await pickers.showOpenFilePicker({ multiple: false, types: [{ description: 'DiagramAI', accept: { 'application/json': ['.diagramai', '.json'] } }] });
      const file = await handle.getFile(); if (file.size > MAX_DOCUMENT_BYTES) throw new Error('File vượt giới hạn 2 MB.');
      return parseDiagramFile(await file.text());
    } catch (error) { if (error instanceof DOMException && error.name === 'AbortError') return null; throw error; }
  }
  return new Promise((resolve, reject) => {
    const input = document.createElement('input'); input.type = 'file'; input.accept = '.diagramai,.json,application/json'; input.hidden = true;
    const done = () => input.remove();
    input.addEventListener('cancel', () => { done(); resolve(null); }, { once: true });
    input.addEventListener('change', () => {
      const file = input.files?.[0]; done();
      if (!file) { resolve(null); return; }
      if (file.size > MAX_DOCUMENT_BYTES) { reject(new Error('File vượt giới hạn 2 MB.')); return; }
      void file.text().then((text) => resolve(parseDiagramFile(text))).catch(reject);
    }, { once: true });
    document.body.append(input); input.click();
  });
}
export interface FileWriteResult { status: 'written' | 'download-started' | 'cancelled'; name: string; reference?: FileReference }
export interface SaveTarget { write(blob: Blob): Promise<FileWriteResult> }
export async function chooseSaveTarget(name: string, kind: FileKind, reference?: FileReference, forceDownload = false): Promise<SaveTarget | null> {
  if (isTauri()) return { async write(blob) {
    if (blob.size > 40 * 1024 * 1024) throw new Error('File xuất vượt giới hạn 40 MB.');
    const saved = await invoke<{ name: string; handle: string } | null>('native_save_file', { name, kind, bytes: Array.from(new Uint8Array(await blob.arrayBuffer())), handle: reference?.kind === 'native' ? reference.token : null });
    return saved ? { status: 'written', name: saved.name, reference: { kind: 'native', token: saved.handle, name: saved.name } } : { status: 'cancelled', name };
  } };
  const pickers = window as unknown as Pickers;
  if (!forceDownload && (reference?.kind === 'web' || pickers.showSaveFilePicker)) {
    try {
      const handle = reference?.kind === 'web' ? reference.handle : await pickers.showSaveFilePicker!({ suggestedName: name, types: [{ description: types[kind].extension.toUpperCase(), accept: { [types[kind].mime]: [`.${types[kind].extension}`] } }] });
      if (handle.requestPermission && await handle.requestPermission({ mode: 'readwrite' }) !== 'granted') throw new Error('Chưa có quyền ghi file. Chọn Lưu thành file mới hoặc Tải xuống.');
      return { async write(blob) {
        const writable = await handle.createWritable();
        try { await writable.write(blob); await writable.close(); }
        catch (error) { await writable.abort?.().catch(() => {}); throw error; }
        return { status: 'written', name: handle.name, reference: { kind: 'web', handle } };
      } };
    } catch (error) { if (error instanceof DOMException && error.name === 'AbortError') return null; throw error; }
  }
  return { async write(blob) {
    const url = URL.createObjectURL(blob), link = document.createElement('a');
    link.href = url; link.download = name; link.style.display = 'none'; document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    // A browser download can still be cancelled outside the app; do not claim disk acknowledgement.
    return { status: 'download-started', name };
  } };
}
