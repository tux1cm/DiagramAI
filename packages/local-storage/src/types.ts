import { parseDocument, serializeDocument, type DiagramDocument } from '@diagramai/diagram-core';

export const MAX_DOCUMENT_BYTES = 2 * 1024 * 1024;
export interface ProjectSummary { documentId: string; title: string; version: number; savedAt: number; nodeCount: number; edgeCount: number }
export interface StoredProject extends ProjectSummary { payload: string; hash: string; operationId: string }
export interface SaveRequest { document: DiagramDocument; expectedVersion: number | null; operationId: string }
export interface LocalRepository {
  readonly kind: 'indexeddb' | 'sqlite';
  list(): Promise<ProjectSummary[]>;
  load(documentId: string): Promise<StoredProject | null>;
  save(request: SaveRequest): Promise<StoredProject>;
  remove(documentId: string, expectedVersion: number): Promise<void>;
  revisions(documentId: string): Promise<StoredProject[]>;
  active(): Promise<string | null>;
  setActive(documentId: string): Promise<void>;
  close(): void;
}
export class LocalConflict extends Error { constructor() { super('Bản trên máy đã được thay đổi ở cửa sổ khác. Không ghi đè tự động.'); this.name = 'LocalConflict'; } }
export async function contentHash(payload: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(payload));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
export async function prepareRecord(request: SaveRequest): Promise<Omit<StoredProject, 'version' | 'savedAt'>> {
  const document = parseDocument(request.document), payload = serializeDocument(document);
  if (new TextEncoder().encode(payload).length > MAX_DOCUMENT_BYTES) throw new Error('Tài liệu vượt giới hạn 2 MB. Hãy chia thành các sơ đồ nhỏ hơn.');
  return { documentId: document.documentId, title: document.title, payload, hash: await contentHash(payload), operationId: request.operationId, nodeCount: document.nodes.length, edgeCount: document.edges.length };
}
export async function decodeRecord(record: StoredProject): Promise<DiagramDocument> {
  if (new TextEncoder().encode(record.payload).length > MAX_DOCUMENT_BYTES || !Number.isSafeInteger(record.version) || record.version < 1 || await contentHash(record.payload) !== record.hash) throw new Error('Bản lưu không vượt qua kiểm tra toàn vẹn. Không ghi đè dữ liệu cũ.');
  const document = parseDocument(JSON.parse(record.payload));
  if (document.documentId !== record.documentId) throw new Error('ID của bản lưu không khớp.');
  return document;
}
