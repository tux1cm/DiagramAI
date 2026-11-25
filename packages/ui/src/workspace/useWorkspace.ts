import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import type { ProjectSession, ProjectSessionSnapshot } from '@diagramai/local-storage';
import { parseWorkspaceLink, SyncClient, type WorkspaceAccess } from '@diagramai/sync-core';
import { WorkspaceLibrary } from './library';

function consumeLink(): { access?: WorkspaceAccess; invalid?: boolean } | null {
  if (!window.location.hash.startsWith('#/workspace/')) return null;
  let access: WorkspaceAccess | undefined;
  try { access = parseWorkspaceLink(window.location.href); } catch { /* Never echo a secret-bearing URL. */ }
  window.history.replaceState(null, '', `${window.location.pathname}#/`);
  return access ? { access } : { invalid: true };
}
export function useWorkspace(session: ProjectSession, local: ProjectSessionSnapshot, baseUrl: string, syncOne: (id: string, force?: boolean) => Promise<void>, paused = false) {
  const [incoming, setIncoming] = useState<{ access?: WorkspaceAccess; invalid?: boolean }>(() => consumeLink() ?? {});
  useEffect(() => {
    const consume = () => { const next = consumeLink(); if (next) setIncoming(next); };
    window.addEventListener('hashchange', consume); return () => window.removeEventListener('hashchange', consume);
  }, []);
  const library = useMemo(() => {
    let client: SyncClient | null = null; try { if (baseUrl) client = new SyncClient(baseUrl); } catch { /* Local-only remains available. */ }
    return new WorkspaceLibrary(session, client, syncOne);
  }, [session, baseUrl, syncOne]);
  const snapshot = useSyncExternalStore(library.subscribe, library.getSnapshot);
  const connected = Boolean(snapshot.state);
  const localRevision = local.projects.map((project) => `${project.documentId}:${project.version}`).sort().join(',');
  useEffect(() => { void library.perform(async () => { await library.initialize(); if (incoming.invalid) throw new Error('Link kho không hợp lệ. Hãy dán lại link đầy đủ trong Quản lý dự án.'); if (incoming.access) { library.showProjects(); await library.connect(incoming.access); } }); }, [library, incoming]);
  useEffect(() => {
    if (paused || local.status === 'loading' || snapshot.loading || !connected) return;
    const run = () => { if (document.visibilityState !== 'hidden') void library.perform(() => library.synchronize()); };
    const first = setTimeout(run, 1000), timer = setInterval(run, 15000);
    window.addEventListener('focus', run); window.addEventListener('online', run);
    return () => { clearTimeout(first); clearInterval(timer); window.removeEventListener('focus', run); window.removeEventListener('online', run); };
  }, [library, local.status, local.version, localRevision, snapshot.loading, connected, paused]);
  return { library, ...snapshot };
}
export type WorkspaceController = ReturnType<typeof useWorkspace>;
