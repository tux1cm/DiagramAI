import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import type { ProjectSession, ProjectSessionSnapshot } from '@diagramai/local-storage';
import { isWorkspaceLinkHash, parseShortLink, parseWorkspaceLink, SyncClient } from '@diagramai/sync-core';
import { WorkspaceLibrary, type WorkspaceEntry } from './library';

function consumeLink(): { link?: string; invalid?: boolean } | null {
  if (!isWorkspaceLinkHash(window.location.hash)) return null;
  let link: string | undefined;
  try { if (parseShortLink(window.location.href)?.kind === 'workspace' || parseWorkspaceLink(window.location.href)) link = window.location.href; } catch { /* Never echo a secret-bearing URL. */ }
  window.history.replaceState(null, '', `${window.location.pathname}#/`);
  return link ? { link } : { invalid: true };
}
export function useWorkspace(session: ProjectSession, _local: ProjectSessionSnapshot, baseUrl: string, syncOne: (id: string, force?: boolean) => Promise<void>) {
  const [incoming, setIncoming] = useState<{ link?: string; invalid?: boolean }>(() => consumeLink() ?? {});
  const [pendingAccess, setPendingAccess] = useState<WorkspaceEntry | null>(null);
  useEffect(() => {
    const consume = () => { const next = consumeLink(); if (next) setIncoming(next); };
    window.addEventListener('hashchange', consume); return () => window.removeEventListener('hashchange', consume);
  }, []);
  const library = useMemo(() => {
    let client: SyncClient | null = null; try { if (baseUrl) client = new SyncClient(baseUrl); } catch { /* Local-only remains available. */ }
    return new WorkspaceLibrary(session, client, syncOne);
  }, [session, baseUrl, syncOne]);
  const snapshot = useSyncExternalStore(library.subscribe, library.getSnapshot);
  useEffect(() => { void library.perform(async () => {
    await library.initialize();
    if (incoming.invalid) throw new Error('Link kho chính không hợp lệ. Hãy mở lại link đầy đủ.');
    if (incoming.link) {
      library.showProjects();
      const entry = await library.resolveLink(incoming.link);
      const current = library.getSnapshot().state;
      if (current && current.id !== entry.access.id) { setPendingAccess(entry); return; }
      await library.connectEntry(entry);
    }
  }); }, [library, incoming]);
  return { library, ...snapshot, pendingAccess, clearPendingAccess: () => setPendingAccess(null) };
}
export type WorkspaceController = ReturnType<typeof useWorkspace>;
