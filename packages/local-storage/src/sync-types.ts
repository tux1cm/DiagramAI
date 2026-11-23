import type { CloudSnapshot, DeviceGrant, SyncLink } from '@diagramai/sync-core';
import type { StoredProject } from './types';

export interface LocalSyncLink extends SyncLink {
  generation: number;
  conflictCopyId: string | null;
  conflictCopyHash: string | null;
}
export interface SyncRead { record: StoredProject | null; link: LocalSyncLink | null }
export interface SyncCommit {
  documentId: string;
  expectedVersion: number | null;
  expectedGeneration: number | null;
  // A record with this documentId replaces the primary (version must increment).
  // Other records are new, independent local copies and must not already exist.
  records: StoredProject[];
  link: LocalSyncLink | null;
  credential?: DeviceGrant;
}
export interface SyncBackend {
  syncRead(documentId: string): Promise<SyncRead>;
  syncCommit(request: SyncCommit): Promise<void>;
  syncCredential(deviceId: string): Promise<string | null>;
}
export interface CloudBinding { credentials: DeviceGrant; snapshot: CloudSnapshot }
