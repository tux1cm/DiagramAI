import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import type { ProjectSession, ProjectSessionSnapshot } from '@diagramai/local-storage';
import { isShareLinkHash, isWorkspaceLinkHash, parseShareLink, SyncClient } from '@diagramai/sync-core';
import { SharedLibrary } from './shared-library';

function consume() {
  const hash = window.location.hash;
  if (!isShareLinkHash(hash)) return null;
  let access: { id: string; key?: string; invalid?: boolean };
  try {
    if (/^#\/share\/[a-f0-9-]{36}$/i.test(hash)) access = { id: hash.split('/')[2] };
    else access = parseShareLink(window.location.href);
  } catch { access = { id: '', invalid: true }; }
  window.history.replaceState(null, '', `${window.location.pathname}#/share/${access.id}`);
  return access;
}
export function useShared(session: ProjectSession, _local: ProjectSessionSnapshot, baseUrl: string, syncOne: (id: string, force?: boolean) => Promise<void>) {
  const [ownerIntent] = useState(() => isWorkspaceLinkHash(window.location.hash));
  const [incoming, setIncoming] = useState(() => consume());
  const library = useMemo(() => {
    let client: SyncClient | null = null; try { if (baseUrl) client = new SyncClient(baseUrl); } catch { /* Local remains available. */ }
    return new SharedLibrary(session, client, syncOne);
  }, [session, baseUrl, syncOne]);
  const snapshot = useSyncExternalStore(library.subscribe, library.getSnapshot);
  useEffect(() => { const changed = () => { const next = consume(); if (next) setIncoming(next); }; window.addEventListener('hashchange', changed); return () => window.removeEventListener('hashchange', changed); }, []);
  useEffect(() => { void library.perform(async () => {
    if (incoming) { if (incoming.invalid) throw new Error('Invalid share'); await library.connect(incoming.id, incoming.key); }
    else if (ownerIntent) await session.repository.shareContextWrite(null);
    else { await session.initialize(); const id = await session.repository.shareContextRead(); if (id) await library.connect(id); }
  }); }, [library, incoming, session, ownerIntent]);
  return { library, ...snapshot, active: snapshot.active || Boolean(incoming && !incoming.invalid && !snapshot.catalog && snapshot.busy) };
}
export type SharedController = ReturnType<typeof useShared>;
