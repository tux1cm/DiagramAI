import { describe, expect, it, vi } from 'vitest';
import { randomBytes, randomUUID } from 'node:crypto';
import { IDBFactory } from 'fake-indexeddb';
import { IndexedDbRepository } from '@diagramai/local-storage';
import { parseShortLink, shortLink, shortCodeHash, workspaceLink, SyncClient, type ShortResolution } from '@diagramai/sync-core';
import { shortLinkAad, wrapShortAccess, unwrapShortAccess } from '../../apps/api/src/short-link-crypto';
import { rememberShort, resolveShort } from '../../packages/ui/src/workspace/short-links';

const code = () => randomBytes(16).toString('base64url');
const access = () => ({ id: randomUUID(), key: `dai_share_v1_${randomBytes(32).toString('base64url')}` });
describe('real 22-character link aliases', () => {
  it('uses a canonical random 128-bit code in the fragment, distinct owner/share routes, and preserves old self-contained links', () => {
    for (const kind of ['workspace', 'share'] as const) {
      const ref = { kind, code: code() }, url = shortLink('https://tux1cm.github.io/DiagramAI/?tracking=removed', ref);
      expect(url.length).toBe(61); expect(parseShortLink(url)).toEqual(ref); expect(new URL(url).search).toBe('');
      expect(ref.code.length).toBe(22);
    }
    expect(parseShortLink(workspaceLink('https://example.com/', { id: randomUUID(), key: `dai_workspace_v1_${'x'.repeat(43)}` }))).toBeNull();
    expect(() => parseShortLink(`https://example.com/#/w/${'A'.repeat(21)}B`)).toThrow();
    expect(() => parseShortLink(`http://not-loopback.example/#/s/${code()}`)).toThrow();
  });
  it('encrypts the underlying capability using the alias secret without a deployment-dependent key, and binds all row metadata', () => {
    const secret = code(), original = access(), row = { id: randomUUID(), workspace_id: randomUUID(), share_id: original.id, code_hash: 'f'.repeat(64) };
    const sealed = wrapShortAccess(original, secret, shortLinkAad(row));
    expect(unwrapShortAccess(sealed, secret, shortLinkAad(row))).toEqual(original);
    expect(JSON.stringify(sealed).includes(original.key)).toBe(false); expect(JSON.stringify(sealed).includes(secret)).toBe(false);
    expect(() => unwrapShortAccess(sealed, code(), shortLinkAad(row))).toThrow();
    expect(() => unwrapShortAccess(sealed, secret, shortLinkAad({ ...row, workspace_id: randomUUID() }))).toThrow();
    expect(() => unwrapShortAccess({ ...sealed, tag: randomBytes(16).toString('base64url') }, secret, shortLinkAad(row))).toThrow();
  });
  it('stores only hash-indexed non-secret resolution metadata outside the credential store, and reopens known links offline', async () => {
    const repo = new IndexedDbRepository('short-alias-cache', new IDBFactory()), ref = { kind: 'share' as const, code: code() }, target = access();
    const resolution: ShortResolution = { id: randomUUID(), kind: 'share', access: target };
    await repo.shareCredentialWrite(target); await rememberShort(repo, ref, resolution);
    expect(await repo.shortLinkRead(await shortCodeHash(ref.code))).toEqual({ id: resolution.id, kind: 'share', accessId: target.id });
    expect(await repo.syncCredential(resolution.id)).toBe(`dai_link_v1_${ref.code}`);
    const remote = vi.fn(async () => { throw new Error('offline'); }), client = { resolveShortLink: remote } as unknown as SyncClient;
    expect(await resolveShort(repo, client, ref)).toEqual(resolution); expect(remote).not.toHaveBeenCalled();
    await expect(resolveShort(repo, client, { kind: 'workspace', code: ref.code })).rejects.toThrow('offline');
    await expect(repo.shortCredentialWrite({ id: resolution.id, code: code() })).rejects.toThrow();
    expect(await repo.syncCredential(resolution.id)).toBe(`dai_link_v1_${ref.code}`);
    await expect(repo.shortLinkWrite(await shortCodeHash(ref.code), Object.assign({}, { id: resolution.id, kind: 'share' as const, accessId: target.id }, { key: target.key }))).rejects.toThrow();
    repo.close();
  });
  it('resolves unknown aliases only through header auth/no-store and refuses a response of the wrong scope kind', async () => {
    const ref = { kind: 'share' as const, code: code() }, target = access();
    const transport = vi.fn<typeof fetch>(async () => Response.json({ id: randomUUID(), kind: 'share', access: target }));
    const client = new SyncClient('https://api.example/', transport);
    expect((await client.resolveShortLink(ref)).access.id).toBe(target.id);
    const [url, options] = transport.mock.calls[0];
    expect(String(url)).not.toContain(ref.code); expect(String(url)).toBe('https://api.example/v1/short-links/share');
    expect(options).toMatchObject({ cache: 'no-store', credentials: 'omit', redirect: 'error', referrerPolicy: 'no-referrer', headers: { Authorization: `Bearer dai_link_v1_${ref.code}` } });
    transport.mockResolvedValueOnce(Response.json({ id: randomUUID(), kind: 'workspace', access: { id: randomUUID(), key: `dai_workspace_v1_${'x'.repeat(43)}` } }));
    await expect(client.resolveShortLink(ref)).rejects.toMatchObject({ code: 'SHORT_LINK_MISMATCH' });
  });
});
