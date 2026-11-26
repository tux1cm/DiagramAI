import { z } from 'zod';
import { CreateProjectSchema, DeviceLabelSchema } from './protocol';

export const WorkspaceKeySchema = z.string().regex(/^dai_workspace_v1_[A-Za-z0-9_-]{43}$/);
export const WorkspaceAccessSchema = z.object({ id: z.uuid(), key: WorkspaceKeySchema }).strict();
export type WorkspaceAccess = z.infer<typeof WorkspaceAccessSchema>;
export const WorkspaceFolderSchema = z.object({ id: z.uuid(), title: z.string().trim().min(1).max(100) }).strict();
export const WorkspaceDrawingSchema = z.object({ id: z.uuid(), folderId: z.uuid(), title: z.string().min(1).max(100), revision: z.number().int().positive() }).strict();
export const WorkspaceCatalogSchema = z.object({ id: z.uuid(), folders: z.array(WorkspaceFolderSchema).max(100), drawings: z.array(WorkspaceDrawingSchema).max(100) }).strict();
export type WorkspaceCatalog = z.infer<typeof WorkspaceCatalogSchema>;
export const ShareKeySchema = z.string().regex(/^dai_share_v1_[A-Za-z0-9_-]{43}$/);
export const ShareAccessSchema = z.object({ id: z.uuid(), key: ShareKeySchema }).strict();
export type ShareAccess = z.infer<typeof ShareAccessSchema>;
export const ShortCodeSchema = z.string().regex(/^[A-Za-z0-9_-]{21}[AQgw]$/);
export const ShortReferenceSchema = z.object({ kind: z.enum(['workspace', 'share']), code: ShortCodeSchema }).strict();
export type ShortReference = z.infer<typeof ShortReferenceSchema>;
export const ShortBindingSchema = z.object({ id: z.uuid(), kind: z.enum(['workspace', 'share']), accessId: z.uuid() }).strict();
export type ShortBinding = z.infer<typeof ShortBindingSchema>;
export const ShortCredentialSchema = z.object({ id: z.uuid(), code: ShortCodeSchema }).strict();
export const CreateShortLinkSchema = z.object({ id: z.uuid(), code: ShortCodeSchema, share: ShareAccessSchema.optional() }).strict();
export const ShortResolutionSchema = z.discriminatedUnion('kind', [
  z.object({ id: z.uuid(), kind: z.literal('workspace'), access: WorkspaceAccessSchema }).strict(),
  z.object({ id: z.uuid(), kind: z.literal('share'), access: ShareAccessSchema }).strict(),
]);
export type ShortResolution = z.infer<typeof ShortResolutionSchema>;
export const WorkspaceChangesSchema = z.object({ deleted: z.array(z.object({ kind: z.enum(['project', 'drawing']), id: z.uuid() }).strict()).max(2000) }).strict();
export const WorkspaceDeleteSchema = z.object({ drawings: z.array(z.object({ id: z.uuid(), revision: z.number().int().positive() }).strict()).max(100) }).strict().refine((value) => new Set(value.drawings.map((item) => item.id)).size === value.drawings.length);
export const CreateShareSchema = ShareAccessSchema.extend({ kind: z.enum(['project', 'drawing']), targetId: z.uuid() }).strict();
export const ShareCatalogSchema = WorkspaceCatalogSchema.extend({ kind: z.enum(['project', 'drawing']), targetId: z.uuid() }).strict();
export type ShareCatalog = z.infer<typeof ShareCatalogSchema>;
export const WorkspaceCreateDrawingSchema = z.object({ id: z.uuid(), folderId: z.uuid(), project: CreateProjectSchema }).strict();
export const WorkspaceAdoptSchema = z.object({ folderId: z.uuid(), projectId: z.uuid(), token: z.string().regex(/^dai_device_v1_[A-Za-z0-9_-]{43}$/), deviceLabel: DeviceLabelSchema }).strict();

function compactId(id: string) {
  const bytes = id.replaceAll('-', '').match(/../g)!.map((value) => Number.parseInt(value, 16));
  return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}
function expandAccess(code: string, prefix: 'dai_workspace_v1_' | 'dai_share_v1_') {
  if (!/^[A-Za-z0-9_-]{65}$/.test(code)) throw new Error('Link gọn không hợp lệ.');
  const encodedId = code.slice(0, 22), binary = atob(encodedId.replaceAll('-', '+').replaceAll('_', '/') + '==');
  const hex = [...binary].map((value) => value.charCodeAt(0).toString(16).padStart(2, '0')).join('');
  const id = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  if (compactId(id) !== encodedId) throw new Error('Link gọn không hợp lệ.');
  // Keep all 43 key characters verbatim, including legacy non-canonical keys:
  // decoding/re-encoding their base64 tail would silently change the capability.
  return { id, key: prefix + code.slice(22) };
}
export const isWorkspaceLinkHash = (hash: string) => hash.startsWith('#/workspace/') || hash.startsWith('#/w/');
export const isShareLinkHash = (hash: string) => hash.startsWith('#/share/') || hash.startsWith('#/s/');
export function parseShortLink(text: string): ShortReference | null {
  const url = new URL(text.trim());
  if (url.username || url.password || url.search || !(url.protocol === 'https:' || url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) throw new Error('Link không hợp lệ.');
  const match = url.hash.match(/^#\/(w|s)\/([A-Za-z0-9_-]{22})$/);
  return match ? ShortReferenceSchema.parse({ kind: match[1] === 'w' ? 'workspace' : 'share', code: match[2] }) : null;
}
export function shortLink(base: string, reference: ShortReference) {
  const checked = ShortReferenceSchema.parse(reference), url = new URL(base);
  url.search = ''; url.hash = `/${checked.kind === 'workspace' ? 'w' : 's'}/${checked.code}`; return url.href;
}
export async function shortCodeHash(code: string) {
  ShortCodeSchema.parse(code);
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`short-link\0${code}`)))].map((value) => value.toString(16).padStart(2, '0')).join('');
}

// Fragment secrets are never sent to the static host or in request/referrer URLs.
export function parseWorkspaceLink(text: string): WorkspaceAccess {
  const url = new URL(text.trim());
  if (url.username || url.password || url.search || !(url.protocol === 'https:' || url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) throw new Error('Link kho không hợp lệ.');
  if (url.hash.startsWith('#/w/')) return WorkspaceAccessSchema.parse(expandAccess(url.hash.slice(4), 'dai_workspace_v1_'));
  const match = url.hash.match(/^#\/workspace\/([a-f0-9-]{36})\/(dai_workspace_v1_[A-Za-z0-9_-]{43})$/i);
  if (!match) throw new Error('Cần dán đầy đủ link riêng của kho.');
  return WorkspaceAccessSchema.parse({ id: match[1].toLowerCase(), key: match[2] });
}
export function workspaceLink(base: string, access: WorkspaceAccess) {
  const checked = WorkspaceAccessSchema.parse(access), url = new URL(base);
  url.search = ''; url.hash = `/w/${compactId(checked.id)}${checked.key.slice('dai_workspace_v1_'.length)}`; return url.href;
}
export function parseShareLink(text: string): ShareAccess {
  const url = new URL(text.trim());
  if (url.username || url.password || url.search || !(url.protocol === 'https:' || url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) throw new Error('Link chia sẻ không hợp lệ.');
  if (url.hash.startsWith('#/s/')) return ShareAccessSchema.parse(expandAccess(url.hash.slice(4), 'dai_share_v1_'));
  const match = url.hash.match(/^#\/share\/([a-f0-9-]{36})\/(dai_share_v1_[A-Za-z0-9_-]{43})$/i);
  if (!match) throw new Error('Cần dán đầy đủ link chia sẻ Project hoặc bản vẽ.');
  return ShareAccessSchema.parse({ id: match[1].toLowerCase(), key: match[2] });
}
export function shareLink(base: string, access: ShareAccess) {
  const checked = ShareAccessSchema.parse(access), url = new URL(base);
  url.search = ''; url.hash = `/s/${compactId(checked.id)}${checked.key.slice('dai_share_v1_'.length)}`; return url.href;
}
export async function workspaceLocalId(workspaceId: string, cloudId: string) {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`diagramai-workspace-local-v1\0${workspaceId}\0${cloudId}`))).slice(0, 16);
  digest[6] = (digest[6] & 15) | 64; digest[8] = (digest[8] & 63) | 128;
  const hex = [...digest].map((value) => value.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
