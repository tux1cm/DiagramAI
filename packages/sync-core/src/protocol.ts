import { z } from 'zod';
import { DocumentSchema, serializeDocument, type DiagramDocument } from '@diagramai/diagram-core';

export const MAX_SYNC_BYTES = 2 * 1024 * 1024;
export const RevisionSchema = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER);
export const HashSchema = z.string().regex(/^[a-f0-9]{64}$/);
export const DeviceLabelSchema = z.string().trim().min(1).max(80);
export const CreateProjectSchema = z.object({ operationId: z.uuid(), document: DocumentSchema, hash: HashSchema, deviceLabel: DeviceLabelSchema }).strict();
export const PushSnapshotSchema = z.object({ operationId: z.uuid(), baseRevision: RevisionSchema, document: DocumentSchema, hash: HashSchema }).strict();
export const RedeemSchema = z.object({ code: z.string().regex(/^[A-HJ-NP-Z2-9]{10}$/), deviceLabel: DeviceLabelSchema }).strict();
export const RecoverySchema = z.object({ recoveryKey: z.string().regex(/^dai_recovery_v1_[A-Za-z0-9_-]{43}$/), deviceLabel: DeviceLabelSchema, revokeOtherDevices: z.boolean().default(false) }).strict();
export const SnapshotSchema = z.object({ projectId: z.uuid(), revision: RevisionSchema, document: DocumentSchema, hash: HashSchema, updatedAt: z.iso.datetime() }).strict();
export const DeviceGrantSchema = z.object({ projectId: z.uuid(), deviceId: z.uuid(), token: z.string().regex(/^dai_device_v1_[A-Za-z0-9_-]{43}$/), scope: z.enum(['owner', 'editor']) }).strict();
export const JoinedProjectSchema = z.object({ credentials: DeviceGrantSchema, snapshot: SnapshotSchema }).strict();
export const CreatedProjectSchema = JoinedProjectSchema.extend({ recoveryKey: RecoverySchema.shape.recoveryKey });
export const PushReceiptSchema = z.object({ acceptedRevision: RevisionSchema, hash: HashSchema }).strict();
export type CloudSnapshot = z.infer<typeof SnapshotSchema>;
export type PushSnapshot = z.infer<typeof PushSnapshotSchema>;
export interface DeviceGrant { projectId: string; deviceId: string; token: string; scope: 'owner' | 'editor' }
export interface PendingSnapshot extends PushSnapshot { localVersion: number }
export interface SyncLink {
  documentId: string;
  projectId: string;
  deviceId: string;
  cloudDocumentId: string;
  baseRevision: number;
  syncedHash: string;
  pending: PendingSnapshot | null;
  conflict: CloudSnapshot | null;
  // Never put credentials into document JSON, portable files, history or outbox.
}
export type SyncStatus = 'local' | 'pending' | 'syncing' | 'synced' | 'offline' | 'conflict' | 'revoked' | 'error';
export async function snapshotHash(document: DiagramDocument): Promise<string> {
  const payload = serializeDocument(document), bytes = new TextEncoder().encode(payload);
  if (bytes.length > MAX_SYNC_BYTES) throw new Error('Sơ đồ vượt giới hạn đồng bộ 2 MB.');
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
