import { describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { createDocument, newId } from '@diagramai/diagram-core';
import { IndexedDbRepository, LocalConflict, WorkspaceJournal, type WorkspaceState } from '@diagramai/local-storage';
import { parseWorkspaceLink, workspaceLink, workspaceLocalId, SyncClient } from '@diagramai/sync-core';

const access = () => ({ id: newId(), key: `dai_workspace_v1_${'a'.repeat(43)}` });
const state = (id: string): WorkspaceState => ({ id, generation: 1, provisionPending: true, selectedFolderId: newId(), folders: [], drawings: [], ignoredLocalIds: [] });
describe('P5 workspace private link and durable catalog header', () => {
  it('keeps the capability only in a fragment, never query/credentials, and rejects malformed links', () => {
    const a = access(), link = workspaceLink('https://tux1cm.github.io/DiagramAI/', a);
    expect(parseWorkspaceLink(link)).toEqual(a); expect(new URL(link).search).toBe('');
    expect(() => parseWorkspaceLink(`https://example.com/?key=${a.key}`)).toThrow();
    expect(() => parseWorkspaceLink(link.replace('https:', 'javascript:'))).toThrow();
  });
  it('uses stable workspace-local IDs across reload/tabs without name-based merging', async () => {
    const a = newId(), b = newId(); expect(await workspaceLocalId(a, b)).toBe(await workspaceLocalId(a, b));
    expect(await workspaceLocalId(newId(), b)).not.toBe(await workspaceLocalId(a, b));
  });
  it('sends workspace access only in the bearer header, never a request URL or cookie', async () => {
    const a = access(); let requested = false;
    const client = new SyncClient('https://api.example', async (url, options) => {
      requested = true; expect(String(url).includes(a.key)).toBe(false);
      expect(new Headers(options?.headers).get('Authorization')).toBe(`Bearer ${a.key}`);
      expect(options?.credentials).toBe('omit'); expect(options?.referrerPolicy).toBe('no-referrer');
      return Response.json({ id: a.id, folders: [], drawings: [] });
    });
    await client.workspaceCatalog(a); expect(requested).toBe(true);
  });
  it('atomically stores workspace header/capability without changing existing documents/checkpoints; CAS rejects stale tabs', async () => {
    const factory = new IDBFactory(), repo = new IndexedDbRepository('workspace', factory), a = access();
    const doc = createDocument('Bản local trước P5 workspace'), saved = await repo.save({ document: doc, expectedVersion: null, operationId: newId() });
    await repo.workspaceWrite({ expectedGeneration: null, state: state(a.id), key: a.key });
    expect(await repo.syncCredential(a.id)).toBe(a.key); expect(JSON.stringify(await repo.workspaceRead())).not.toContain(a.key);
    expect(await repo.load(doc.documentId)).toEqual(saved); expect(await repo.revisions(doc.documentId)).toEqual([saved]);
    const journal = new WorkspaceJournal(repo); await journal.update((current) => ({ ...current, provisionPending: false }));
    await expect(repo.workspaceWrite({ expectedGeneration: 1, state: { ...state(a.id), generation: 2 } })).rejects.toBeInstanceOf(LocalConflict);
    repo.close(); const reopened = new IndexedDbRepository('workspace', factory);
    expect((await reopened.workspaceRead())?.provisionPending).toBe(false); expect(await reopened.syncCredential(a.id)).toBe(a.key); reopened.close();
  });
});
