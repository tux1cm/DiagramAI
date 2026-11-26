import { describe, expect, it } from 'vitest';
import { newId } from '@diagramai/diagram-core';
import { isShareLinkHash, isWorkspaceLinkHash, parseShareLink, parseWorkspaceLink, shareLink, workspaceLink } from '@diagramai/sync-core';

describe('compact offline capability links', () => {
  for (const kind of ['workspace', 'share'] as const) {
    const prefix = kind === 'workspace' ? 'dai_workspace_v1_' : 'dai_share_v1_';
    const create = kind === 'workspace' ? workspaceLink : shareLink, parse = kind === 'workspace' ? parseWorkspaceLink : parseShareLink;
    it(`${kind}: shortens metadata without dropping any key character, including legacy base64 tails`, () => {
      for (const tail of ['a', 'b', 'c', 'd', '_', '-']) {
        const access = { id: newId(), key: prefix + tail.repeat(43) };
        const link = create('https://tux1cm.github.io/DiagramAI/?tracking=removed', access), url = new URL(link);
        const legacy = `https://tux1cm.github.io/DiagramAI/#/${kind}/${access.id}/${access.key}`;
        expect(url.hash).toMatch(kind === 'workspace' ? /^#\/w\/[A-Za-z0-9_-]{65}$/ : /^#\/s\/[A-Za-z0-9_-]{65}$/);
        expect(link.length).toBeLessThan(legacy.length - 25); expect(url.search).toBe('');
        expect(parse(link).id).toBe(access.id); expect(parse(link).key === access.key).toBe(true);
        expect(parse(legacy).key === access.key).toBe(true); expect(parse(legacy).id).toBe(access.id);
        expect(link.includes(access.id)).toBe(false); expect(link.includes(prefix)).toBe(false);
        expect(() => parse(`${url.origin}${url.pathname}?track=1${url.hash}`)).toThrow();
      }
    });
    it(`${kind}: round-trips every byte of UUID and random 256-bit keys without network access`, () => {
      for (let count = 0; count < 64; count++) {
        const bytes = crypto.getRandomValues(new Uint8Array(32));
        const access = { id: newId(), key: prefix + btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '') };
        const read = parse(create('https://example.com/', access));
        expect(read.id === access.id && read.key === access.key).toBe(true);
      }
    });
    it(`${kind}: rejects truncation, trailing data, illegal alphabet and non-canonical UUID aliases`, () => {
      const url = new URL(create('https://example.com/', { id: newId(), key: prefix + 'x'.repeat(43) }));
      const code = url.hash.slice(4), route = url.hash.slice(0, 4);
      for (const invalid of [code.slice(1), code + 'A', code.slice(0, 5) + '!' + code.slice(6), code.slice(0, 21) + 'B' + code.slice(22)]) {
        url.hash = route + invalid; expect(() => parse(url.href)).toThrow();
      }
    });
  }
  it('keeps owner and share routes distinct and recognizes old links/cached share IDs', () => {
    const owner = workspaceLink('https://example.com/', { id: newId(), key: `dai_workspace_v1_${'k'.repeat(43)}` });
    const scoped = shareLink('https://example.com/', { id: newId(), key: `dai_share_v1_${'s'.repeat(43)}` });
    expect(() => parseShareLink(owner)).toThrow(); expect(() => parseWorkspaceLink(scoped)).toThrow();
    expect(isWorkspaceLinkHash(new URL(owner).hash)).toBe(true); expect(isShareLinkHash(new URL(scoped).hash)).toBe(true);
    expect(isWorkspaceLinkHash('#/workspace/legacy')).toBe(true); expect(isShareLinkHash(`#/share/${newId()}`)).toBe(true);
    expect(isWorkspaceLinkHash(new URL(scoped).hash)).toBe(false);
  });
});
