import { z } from 'zod';
import { WorkspaceKeySchema, WorkspaceFolderSchema, type ShareAccess, type ShareCatalog } from '@diagramai/sync-core';
import { LocalConflict } from './types';

export const WorkspaceStateSchema = z.object({
  id: z.uuid(), generation: z.number().int().positive(), provisionPending: z.boolean(),
  selectedFolderId: z.uuid(),
  folders: z.array(WorkspaceFolderSchema.extend({ pending: z.boolean() })).max(100),
  drawings: z.array(z.object({ localId: z.uuid(), cloudId: z.uuid(), folderId: z.uuid(), operationId: z.uuid(), published: z.boolean() }).strict()).max(100),
  ignoredLocalIds: z.array(z.uuid()).max(10000),
  shares: z.array(z.object({ id: z.uuid(), kind: z.enum(['project', 'drawing']), targetId: z.uuid() }).strict()).max(100).optional(),
}).strict();
export type WorkspaceState = z.infer<typeof WorkspaceStateSchema>;
export interface WorkspaceCommit { expectedGeneration: number | null; state: WorkspaceState; key?: string; switchFromId?: string }
export interface WorkspaceBackend {
  workspaceRead(): Promise<WorkspaceState | null>;
  workspaceWrite(input: WorkspaceCommit): Promise<void>;
  workspaceArchives(): Promise<WorkspaceState[]>;
  syncCredential(id: string): Promise<string | null>;
  shareCredentialWrite(access: ShareAccess): Promise<void>;
  shareCatalogRead(id: string): Promise<ShareCatalog | null>;
  shareCatalogWrite(catalog: ShareCatalog): Promise<void>;
  shareContextRead(): Promise<string | null>;
  shareContextWrite(id: string | null): Promise<void>;
}
export function checkWorkspaceCommit(input: WorkspaceCommit) {
  WorkspaceStateSchema.parse(input.state);
  if (input.state.generation !== (input.expectedGeneration ?? 0) + 1) throw new LocalConflict();
  if (input.key !== undefined) WorkspaceKeySchema.parse(input.key);
  if (input.switchFromId !== undefined) {
    z.uuid().parse(input.switchFromId);
    if (!input.key || input.expectedGeneration === null || input.switchFromId === input.state.id) throw new LocalConflict();
  }
}
export class WorkspaceJournal {
  constructor(readonly backend: WorkspaceBackend) {}
  async update(work: (state: WorkspaceState) => WorkspaceState) {
    for (let attempt = 0; attempt < 6; attempt++) {
      const current = await this.backend.workspaceRead();
      if (!current) throw new Error('Chưa mở kho chung.');
      const state = { ...work(structuredClone(current)), generation: current.generation + 1 };
      try { await this.backend.workspaceWrite({ expectedGeneration: current.generation, state }); return state; }
      catch (error) { if (!(error instanceof LocalConflict) || attempt === 5) throw error; }
    }
    throw new LocalConflict();
  }
}
