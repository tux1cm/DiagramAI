import { createHash, createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const wrappingKey = (code: string) => createHash('sha256').update(`diagramai-short-link-wrap-v1\0${code}`).digest();
export function shortLinkAad(row: { id: string; workspace_id: string; share_id: string | null; code_hash: string }) {
  return Buffer.from(`diagramai-short-link-v1\0${row.id}\0${row.workspace_id}\0${row.share_id ?? ''}\0${row.code_hash}`);
}
export function wrapShortAccess(access: { id: string; key: string }, code: string, aad: Buffer) {
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', wrappingKey(code), iv);
  cipher.setAAD(aad);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(access), 'utf8'), cipher.final()]);
  return { ciphertext: ciphertext.toString('base64url'), iv: iv.toString('base64url'), tag: cipher.getAuthTag().toString('base64url') };
}
export function unwrapShortAccess(row: { ciphertext: string; iv: string; tag: string }, code: string, aad: Buffer): unknown {
  const decipher = createDecipheriv('aes-256-gcm', wrappingKey(code), Buffer.from(row.iv, 'base64url'));
  decipher.setAAD(aad); decipher.setAuthTag(Buffer.from(row.tag, 'base64url'));
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(row.ciphertext, 'base64url')), decipher.final()]).toString('utf8'));
}
