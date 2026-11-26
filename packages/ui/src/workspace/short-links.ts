import type { WorkspaceBackend } from '@diagramai/local-storage';
import { shortCodeHash, ShortResolutionSchema, type ShortReference, type ShortResolution, type SyncClient } from '@diagramai/sync-core';

export async function resolveShort(repository: WorkspaceBackend, client: SyncClient, reference: ShortReference): Promise<ShortResolution> {
  const cached = await repository.shortLinkRead(await shortCodeHash(reference.code));
  if (cached?.kind === reference.kind && await repository.syncCredential(cached.id) === `dai_link_v1_${reference.code}`) {
    const key = await repository.syncCredential(cached.accessId);
    const result = ShortResolutionSchema.safeParse({ id: cached.id, kind: cached.kind, access: { id: cached.accessId, key } });
    if (result.success) return result.data;
  }
  return client.resolveShortLink(reference);
}

export async function rememberShort(repository: WorkspaceBackend, reference: ShortReference, resolution: ShortResolution) {
  if (resolution.kind !== reference.kind) throw new Error('Link ngắn không đúng phạm vi.');
  await repository.shortCredentialWrite({ id: resolution.id, code: reference.code });
  await repository.shortLinkWrite(await shortCodeHash(reference.code), { id: resolution.id, kind: resolution.kind, accessId: resolution.access.id });
}
