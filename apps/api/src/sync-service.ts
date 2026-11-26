import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { serializeDocument } from '@diagramai/diagram-core';
import { CreateProjectSchema, PushSnapshotSchema, RecoverySchema, RedeemSchema, MAX_SYNC_BYTES, type CloudSnapshot, type DeviceGrant } from '@diagramai/sync-core';
import { z } from 'zod';
import { WorkspaceAccessSchema, WorkspaceFolderSchema, WorkspaceCreateDrawingSchema, WorkspaceAdoptSchema, WorkspaceKeySchema, CreateShareSchema, ShareKeySchema, ShareAccessSchema, CreateShortLinkSchema, ShortCodeSchema, WorkspaceDeleteSchema } from '@diagramai/sync-core';
import { shortLinkAad, wrapShortAccess, unwrapShortAccess } from './short-link-crypto';

export class SyncFault extends Error {
  constructor(readonly status: number, readonly code: string) { super(code); }
}
const hash = (kind: string, secret: string) => createHash('sha256').update(`${kind}\0${secret}`).digest('hex');
const token = (kind: 'device' | 'recovery') => `dai_${kind}_v1_${randomBytes(32).toString('base64url')}`;
const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
interface Principal { id: string; project_id: string; scope: 'owner' | 'editor' }
interface ProjectRow { id: string; document_id: string; current_revision: string; snapshot_jsonb: CloudSnapshot['document']; snapshot_hash: string; snapshot_bytes: number; updated_at: Date }
export interface SyncLimits { storageBytes: number; projects: number; revisions: number; rateNamespace: string }
const defaults: SyncLimits = { storageBytes: 128 * 1024 * 1024, projects: 20, revisions: 30, rateNamespace: '' };

export class SyncService {
  private limits: SyncLimits;
  constructor(private pool: Pool, private rateSecret: string, limits: Partial<SyncLimits> = {}) {
    if (rateSecret.length < 32) throw new Error('Sync rate-limit key must be configured server-side.');
    this.limits = { ...defaults, ...limits };
  }
  private async tx<T>(work: (db: PoolClient) => Promise<T>): Promise<T> {
    const db = await this.pool.connect();
    try { await db.query('BEGIN'); await db.query("SET LOCAL statement_timeout='8s'"); const value = await work(db); await db.query('COMMIT'); return value; }
    catch (error) { await db.query('ROLLBACK').catch(() => {}); throw error; }
    finally { db.release(); }
  }
  // Counters commit independently of rejected business requests; failed guesses
  // cannot roll back their rate-limit charge. No raw IP/token is stored or logged.
  async rate(route: string, address: string | null, bearer?: string) {
    const minute = Math.floor(Date.now() / 60000), day = Math.floor(Date.now() / 86400000);
    await this.bucket(`global:${route}`, minute, route === 'create' || route === 'workspace-create' ? 5 : route === 'redeem' || route === 'recover' ? 20 : route === 'short-resolve' ? 60 : 300, 120);
    // One charge per HTTP request, including idempotent retries. Previously the
    // create route charged this SAME bucket twice with two different limits.
    // Keep a small explicit 20-request/day creation budget plus the 5/min cap;
    // storage/project/workspace hard caps are unchanged. Never reset counters.
    await this.bucket(`global:${route}:day`, day, route === 'create' || route === 'workspace-create' ? 20 : route === 'push' ? 1000 : ['pull', 'workspace-list', 'share-access'].includes(route) ? 30000 : 3000, 172800, 1, 'DAILY_LIMIT');
    const identity = createHmac('sha256', this.rateSecret).update(`${day}\0${address ?? 'unverified-shared'}`).digest('hex');
    await this.bucket(`ip:${route}:${identity}`, minute, ['create', 'workspace-create', 'redeem', 'recover'].includes(route) ? 5 : route === 'short-resolve' ? 20 : 120, 120);
    if (bearer) await this.bucket(`device:${route}:${hash('rate', bearer)}`, minute, 60, 120);
    await this.pool.query('DELETE FROM diagramai_sync.rate_limit_buckets WHERE (bucket_id,window_start) IN (SELECT bucket_id,window_start FROM diagramai_sync.rate_limit_buckets WHERE expires_at < now() LIMIT 100)');
  }
  private async bucket(id: string, window: number, limit: number, ttl: number, amount = 1, code = 'RATE_LIMITED') {
    if (amount > limit) throw new SyncFault(429, code);
    id = `${this.limits.rateNamespace}${id}`;
    const result = await this.pool.query(`INSERT INTO diagramai_sync.rate_limit_buckets(bucket_id,window_start,counter,expires_at)
      VALUES ($1,$2,$5,now()+$4*interval '1 second') ON CONFLICT(bucket_id,window_start)
      DO UPDATE SET counter=diagramai_sync.rate_limit_buckets.counter+$5
      WHERE diagramai_sync.rate_limit_buckets.counter+$5 <= $3 RETURNING counter`, [id, window, limit, ttl, amount]);
    if (!result.rowCount) throw new SyncFault(429, code);
  }
  private snapshot(row: ProjectRow): CloudSnapshot {
    return { projectId: row.id, revision: Number(row.current_revision), document: row.snapshot_jsonb, hash: row.snapshot_hash, updatedAt: row.updated_at.toISOString() };
  }
  private payload(document: CloudSnapshot['document'], expected: string) {
    const payload = serializeDocument(document), bytes = Buffer.byteLength(payload);
    if (bytes > MAX_SYNC_BYTES) throw new SyncFault(413, 'PAYLOAD_TOO_LARGE');
    if (createHash('sha256').update(payload).digest('hex') !== expected) throw new SyncFault(400, 'HASH_MISMATCH');
    return { payload, bytes };
  }
  private async authorize(db: PoolClient, projectId: string, bearer: string, owner = false): Promise<Principal> {
    if (!/^dai_device_v1_[A-Za-z0-9_-]{43}$/.test(bearer)) throw new SyncFault(401, 'ACCESS_DENIED');
    const result = await db.query<Principal>('SELECT id,project_id,scope FROM diagramai_sync.project_devices WHERE project_id=$1 AND token_hash=$2 AND revoked_at IS NULL FOR SHARE', [projectId, hash('device', bearer)]);
    const principal = result.rows[0];
    if (!principal) throw new SyncFault(401, 'ACCESS_DENIED');
    if (owner && principal.scope !== 'owner') throw new SyncFault(403, 'OWNER_REQUIRED');
    return principal;
  }
  private async budget(db: PoolClient, delta: number) {
    const result = await db.query('UPDATE diagramai_sync.storage_budget SET used_bytes=used_bytes+$1 WHERE singleton=true AND used_bytes+$1 BETWEEN 0 AND $2 RETURNING used_bytes', [delta, this.limits.storageBytes]);
    if (!result.rowCount) throw new SyncFault(507, 'CLOUD_STORAGE_LIMIT');
  }
  private async grant(db: PoolClient, projectId: string, label: string, scope: 'owner' | 'editor', suppliedSecret?: string): Promise<DeviceGrant> {
    // Caller holds the project lock, so device caps and issuance are atomic.
    const count = await db.query('SELECT count(*)::int AS count FROM diagramai_sync.project_devices WHERE project_id=$1', [projectId]);
    if (count.rows[0].count >= 100) throw new SyncFault(409, 'DEVICE_LIMIT');
    const active = await db.query('SELECT count(*)::int AS count FROM diagramai_sync.project_devices WHERE project_id=$1 AND revoked_at IS NULL', [projectId]);
    if (active.rows[0].count >= 10) throw new SyncFault(409, 'DEVICE_LIMIT');
    const secret = suppliedSecret ?? token('device'), id = randomUUID();
    await db.query('INSERT INTO diagramai_sync.project_devices(id,project_id,token_hash,device_label,scope) VALUES ($1,$2,$3,$4,$5)', [id, projectId, hash('device', secret), label, scope]);
    return { projectId, deviceId: id, token: secret, scope };
  }
  async create(input: unknown) {
    const data = CreateProjectSchema.parse(input);
    return this.tx((db) => this.createRecord(db, data));
  }
  private async createRecord(db: PoolClient, data: z.infer<typeof CreateProjectSchema>, id: string = randomUUID(), secret?: string) {
      const { payload, bytes } = this.payload(data.document, data.hash);
      // A lost creation response is not silently retried with new credentials.
      // This advisory key prevents duplicate projects for the same operation ID.
      await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`create:${data.operationId}`]);
      if ((await db.query('SELECT 1 FROM diagramai_sync.projects WHERE create_operation_id=$1', [data.operationId])).rowCount) throw new SyncFault(409, 'CREATION_ALREADY_COMMITTED');
      const count = await db.query('UPDATE diagramai_sync.storage_budget SET project_count=project_count+1 WHERE singleton=true AND project_count<$1 RETURNING project_count', [this.limits.projects]);
      if (!count.rowCount) throw new SyncFault(507, 'CLOUD_PROJECT_LIMIT');
      await this.budget(db, bytes * 2);
      const recoveryKey = token('recovery');
      const result = await db.query<ProjectRow>(`INSERT INTO diagramai_sync.projects(id,create_operation_id,document_id,title,current_revision,snapshot_jsonb,snapshot_hash,snapshot_bytes)
        VALUES ($1,$2,$3,$4,1,$5,$6,$7) RETURNING *`, [id, data.operationId, data.document.documentId, data.document.title, payload, data.hash, bytes]);
      const credentials = await this.grant(db, id, data.deviceLabel, 'owner', secret);
      await db.query('INSERT INTO diagramai_sync.project_recovery(project_id,recovery_hash) VALUES ($1,$2)', [id, hash('recovery', recoveryKey)]);
      await db.query('INSERT INTO diagramai_sync.project_revisions(project_id,revision,snapshot_jsonb,snapshot_hash,snapshot_bytes,operation_id) VALUES ($1,1,$2,$3,$4,$5)', [id, payload, data.hash, bytes, data.operationId]);
      await db.query('INSERT INTO diagramai_sync.sync_operations(project_id,operation_id,device_id,base_revision,accepted_revision,snapshot_hash) VALUES ($1,$2,$3,0,1,$4)', [id, data.operationId, credentials.deviceId, data.hash]);
      return { credentials, recoveryKey, snapshot: this.snapshot(result.rows[0]) };
  }
  private async workspaceAuth(db: PoolClient, id: string, key: string) {
    if (!WorkspaceKeySchema.safeParse(key).success) throw new SyncFault(401, 'ACCESS_DENIED');
    const result = await db.query('SELECT id FROM diagramai_sync.workspaces WHERE id=$1 AND key_hash=$2 FOR UPDATE', [id, hash('workspace', key)]);
    if (!result.rowCount) throw new SyncFault(401, 'ACCESS_DENIED');
  }
  private workspaceToken(key: string, projectId: string) {
    return `dai_device_v1_${createHmac('sha256', key).update(`workspace-drawing\0${projectId.toLowerCase()}`).digest('base64url')}`;
  }
  async workspaceCreate(input: unknown) {
    const data = WorkspaceAccessSchema.parse(input);
    return this.tx(async (db) => {
      await db.query("SELECT pg_advisory_xact_lock(hashtextextended('diagramai-workspaces',0))");
      const existing = await db.query('SELECT key_hash FROM diagramai_sync.workspaces WHERE id=$1', [data.id]);
      if (existing.rowCount) {
        if (existing.rows[0].key_hash !== hash('workspace', data.key)) throw new SyncFault(401, 'ACCESS_DENIED');
      } else {
        if (Number((await db.query('SELECT count(*) AS count FROM diagramai_sync.workspaces')).rows[0].count) >= 20) throw new SyncFault(507, 'WORKSPACE_LIMIT');
        await db.query('INSERT INTO diagramai_sync.workspaces(id,key_hash) VALUES ($1,$2)', [data.id, hash('workspace', data.key)]);
      }
      return { id: data.id.toLowerCase() };
    });
  }
  async workspaceCatalog(id: string, key: string) {
    return this.tx(async (db) => {
      await this.workspaceAuth(db, id, key);
      const folders = await db.query('SELECT id,title FROM diagramai_sync.workspace_folders WHERE workspace_id=$1 ORDER BY title,id', [id]);
      const drawings = await db.query('SELECT p.id,d.folder_id AS "folderId",p.title,p.current_revision::double precision AS revision FROM diagramai_sync.workspace_drawings d JOIN diagramai_sync.projects p ON p.id=d.project_id WHERE d.workspace_id=$1 ORDER BY p.title,p.id', [id]);
      return { id: id.toLowerCase(), folders: folders.rows, drawings: drawings.rows };
    });
  }
  async workspaceFolder(id: string, key: string, input: unknown) {
    const folder = WorkspaceFolderSchema.parse(input);
    return this.tx(async (db) => {
      await this.workspaceAuth(db, id, key);
      await this.notDeleted(db, id, 'project', folder.id);
      const existing = await db.query('SELECT workspace_id,title FROM diagramai_sync.workspace_folders WHERE id=$1', [folder.id]);
      if (existing.rowCount) {
        if (existing.rows[0].workspace_id !== id.toLowerCase() || existing.rows[0].title !== folder.title) throw new SyncFault(409, 'FOLDER_CONFLICT');
      } else {
        if (Number((await db.query('SELECT count(*) AS count FROM diagramai_sync.workspace_folders WHERE workspace_id=$1', [id])).rows[0].count) >= 100) throw new SyncFault(507, 'FOLDER_LIMIT');
        await db.query('INSERT INTO diagramai_sync.workspace_folders(id,workspace_id,title) VALUES ($1,$2,$3)', [folder.id, id, folder.title]);
      }
      return folder;
    });
  }
  private async workspaceBinding(db: PoolClient, workspaceId: string, key: string, projectId: string) {
    const result = await db.query<ProjectRow & { device_id: string }>('SELECT p.*,d.device_id FROM diagramai_sync.workspace_drawings d JOIN diagramai_sync.projects p ON p.id=d.project_id WHERE d.workspace_id=$1 AND d.project_id=$2', [workspaceId, projectId]);
    if (!result.rowCount) throw new SyncFault(404, 'DRAWING_NOT_FOUND');
    const row = result.rows[0];
    return { snapshot: this.snapshot(row), credentials: { projectId: row.id, deviceId: row.device_id, token: this.workspaceToken(key, row.id), scope: 'owner' as const } };
  }
  async workspaceDrawingAccess(id: string, key: string, projectId: string) {
    return this.tx(async (db) => { await this.workspaceAuth(db, id, key); return this.workspaceBinding(db, id, key, projectId); });
  }
  async workspaceDrawingCreate(id: string, key: string, input: unknown) {
    const data = WorkspaceCreateDrawingSchema.parse(input);
    return this.tx(async (db) => {
      await this.workspaceAuth(db, id, key);
      await this.notDeleted(db, id, 'drawing', data.id); await this.notDeleted(db, id, 'project', data.folderId);
      const folder = await db.query('SELECT id FROM diagramai_sync.workspace_folders WHERE workspace_id=$1 AND id=$2', [id, data.folderId]);
      if (!folder.rowCount) throw new SyncFault(404, 'FOLDER_NOT_FOUND');
      const existing = await db.query('SELECT p.id,p.document_id FROM diagramai_sync.projects p JOIN diagramai_sync.workspace_drawings d ON d.project_id=p.id WHERE d.workspace_id=$1 AND p.create_operation_id=$2', [id, data.project.operationId]);
      if (existing.rowCount) {
        if (existing.rows[0].document_id !== data.project.document.documentId.toLowerCase()) throw new SyncFault(409, 'OPERATION_REUSED');
        return this.workspaceBinding(db, id, key, existing.rows[0].id);
      }
      const created = await this.createRecord(db, data.project, data.id, this.workspaceToken(key, data.id));
      await db.query('INSERT INTO diagramai_sync.workspace_drawings(project_id,workspace_id,folder_id,device_id) VALUES ($1,$2,$3,$4)', [data.id, id, data.folderId, created.credentials.deviceId]);
      return { snapshot: created.snapshot, credentials: created.credentials };
    });
  }
  async workspaceAdopt(id: string, key: string, input: unknown) {
    const data = WorkspaceAdoptSchema.parse(input);
    return this.tx(async (db) => {
      await this.workspaceAuth(db, id, key);
      await this.notDeleted(db, id, 'drawing', data.projectId); await this.notDeleted(db, id, 'project', data.folderId);
      await this.authorize(db, data.projectId, data.token, true);
      await db.query('SELECT id FROM diagramai_sync.projects WHERE id=$1 FOR UPDATE', [data.projectId]);
      if (!(await db.query('SELECT id FROM diagramai_sync.workspace_folders WHERE workspace_id=$1 AND id=$2', [id, data.folderId])).rowCount) throw new SyncFault(404, 'FOLDER_NOT_FOUND');
      const existing = await db.query('SELECT workspace_id FROM diagramai_sync.workspace_drawings WHERE project_id=$1', [data.projectId]);
      if (existing.rowCount && existing.rows[0].workspace_id !== id.toLowerCase()) throw new SyncFault(409, 'DRAWING_IN_OTHER_WORKSPACE');
      if (!existing.rowCount) {
        const grant = await this.grant(db, data.projectId, data.deviceLabel, 'owner', this.workspaceToken(key, data.projectId));
        await db.query('INSERT INTO diagramai_sync.workspace_drawings(project_id,workspace_id,folder_id,device_id) VALUES ($1,$2,$3,$4)', [data.projectId, id, data.folderId, grant.deviceId]);
      }
      return this.workspaceBinding(db, id, key, data.projectId);
    });
  }
  async workspaceDelete(id: string, key: string) {
    return this.tx(async (db) => {
      await this.workspaceAuth(db, id, key);
      const projects = await db.query('SELECT p.id,p.snapshot_bytes FROM diagramai_sync.projects p JOIN diagramai_sync.workspace_drawings d ON d.project_id=p.id WHERE d.workspace_id=$1 FOR UPDATE OF p', [id]);
      let released = 0;
      for (const project of projects.rows) {
        const retained = await db.query('SELECT coalesce(sum(snapshot_bytes),0)::bigint AS bytes FROM diagramai_sync.project_revisions WHERE project_id=$1', [project.id]);
        released += Number(project.snapshot_bytes) + Number(retained.rows[0].bytes);
        await db.query('DELETE FROM diagramai_sync.projects WHERE id=$1', [project.id]);
      }
      await db.query('UPDATE diagramai_sync.storage_budget SET used_bytes=used_bytes-$1,project_count=project_count-$2 WHERE singleton', [released, projects.rowCount]);
      await db.query('DELETE FROM diagramai_sync.workspace_folders WHERE workspace_id=$1', [id]);
      await db.query('DELETE FROM diagramai_sync.workspaces WHERE id=$1', [id]);
    });
  }
  private async notDeleted(db: PoolClient, workspaceId: string, kind: 'project' | 'drawing', id: string) {
    if ((await db.query('SELECT 1 FROM diagramai_sync.workspace_deletions WHERE workspace_id=$1 AND kind=$2 AND target_id=$3', [workspaceId, kind, id])).rowCount) throw new SyncFault(409, 'ITEM_DELETED');
  }
  async workspaceChanges(id: string, key: string) {
    return this.tx(async (db) => {
      await this.workspaceAuth(db, id, key);
      return { deleted: (await db.query('SELECT kind,target_id AS id FROM diagramai_sync.workspace_deletions WHERE workspace_id=$1 ORDER BY deleted_at,kind,target_id', [id])).rows };
    });
  }
  async workspaceDeleteItem(id: string, key: string, kind: 'project' | 'drawing', targetId: string, input: unknown) {
    const data = WorkspaceDeleteSchema.parse(input);
    return this.tx(async (db) => {
      await this.workspaceAuth(db, id, key);
      if ((await db.query('SELECT 1 FROM diagramai_sync.workspace_deletions WHERE workspace_id=$1 AND kind=$2 AND target_id=$3', [id, kind, targetId])).rowCount) return;
      const target = kind === 'project'
        ? await db.query('SELECT 1 FROM diagramai_sync.workspace_folders WHERE workspace_id=$1 AND id=$2', [id, targetId])
        : await db.query('SELECT 1 FROM diagramai_sync.workspace_drawings WHERE workspace_id=$1 AND project_id=$2', [id, targetId]);
      if (!target.rowCount) throw new SyncFault(404, 'DELETE_TARGET_NOT_FOUND');
      const current = await db.query('SELECT p.id,p.current_revision,p.snapshot_bytes FROM diagramai_sync.projects p JOIN diagramai_sync.workspace_drawings d ON d.project_id=p.id WHERE d.workspace_id=$1 AND (($2=\'project\' AND d.folder_id=$3) OR ($2=\'drawing\' AND d.project_id=$3)) ORDER BY p.id FOR UPDATE OF p', [id, kind, targetId]);
      if (current.rows.length !== data.drawings.length || current.rows.some((row) => !data.drawings.some((item) => item.id === row.id && item.revision === Number(row.current_revision)))) throw new SyncFault(409, 'DELETE_CHANGED');
      const count = Number((await db.query('SELECT count(*) AS count FROM diagramai_sync.workspace_deletions WHERE workspace_id=$1', [id])).rows[0].count);
      if (count + current.rows.length + 1 > 2000) throw new SyncFault(409, 'DELETE_HISTORY_LIMIT');
      await db.query('INSERT INTO diagramai_sync.workspace_deletions(workspace_id,kind,target_id) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING', [id, kind, targetId]);
      let released = 0;
      for (const row of current.rows) {
        await db.query('INSERT INTO diagramai_sync.workspace_deletions(workspace_id,kind,target_id) VALUES ($1,\'drawing\',$2) ON CONFLICT DO NOTHING', [id, row.id]);
        const revisions = await db.query('SELECT coalesce(sum(snapshot_bytes),0)::bigint AS bytes FROM diagramai_sync.project_revisions WHERE project_id=$1', [row.id]);
        released += Number(row.snapshot_bytes) + Number(revisions.rows[0].bytes);
        await db.query('DELETE FROM diagramai_sync.projects WHERE id=$1', [row.id]);
      }
      if (kind === 'project') await db.query('DELETE FROM diagramai_sync.workspace_folders WHERE workspace_id=$1 AND id=$2', [id, targetId]);
      await db.query('UPDATE diagramai_sync.storage_budget SET used_bytes=used_bytes-$1,project_count=project_count-$2 WHERE singleton', [released, current.rows.length]);
    });
  }
  async createShare(workspaceId: string, workspaceKey: string, input: unknown) {
    const data = CreateShareSchema.parse(input);
    return this.tx(async (db) => {
      await this.workspaceAuth(db, workspaceId, workspaceKey);
      const target = data.kind === 'project'
        ? await db.query('SELECT id FROM diagramai_sync.workspace_folders WHERE workspace_id=$1 AND id=$2', [workspaceId, data.targetId])
        : await db.query('SELECT project_id FROM diagramai_sync.workspace_drawings WHERE workspace_id=$1 AND project_id=$2', [workspaceId, data.targetId]);
      if (!target.rowCount) throw new SyncFault(404, 'SHARE_TARGET_NOT_FOUND');
      const existing = await db.query('SELECT * FROM diagramai_sync.share_links WHERE id=$1', [data.id]);
      if (existing.rowCount) {
        const row = existing.rows[0];
        if (row.workspace_id !== workspaceId.toLowerCase() || row.key_hash !== hash('share', data.key) || (data.kind === 'project' ? row.folder_id : row.project_id) !== data.targetId.toLowerCase()) throw new SyncFault(409, 'SHARE_CONFLICT');
      } else {
        if (Number((await db.query('SELECT count(*) AS count FROM diagramai_sync.share_links WHERE workspace_id=$1', [workspaceId])).rows[0].count) >= 100) throw new SyncFault(409, 'SHARE_LIMIT');
        await db.query('INSERT INTO diagramai_sync.share_links(id,workspace_id,folder_id,project_id,key_hash) VALUES ($1,$2,$3,$4,$5)', [data.id, workspaceId, data.kind === 'project' ? data.targetId : null, data.kind === 'drawing' ? data.targetId : null, hash('share', data.key)]);
      }
      return { id: data.id.toLowerCase() };
    });
  }
  async createShortLink(workspaceId: string, workspaceKey: string, input: unknown) {
    const data = CreateShortLinkSchema.parse(input);
    return this.tx(async (db) => {
      await this.workspaceAuth(db, workspaceId, workspaceKey);
      if (data.share) {
        const scope = await this.shareAuth(db, data.share.id, data.share.key);
        if (scope.workspace_id !== workspaceId.toLowerCase()) throw new SyncFault(404, 'SHARE_TARGET_NOT_FOUND');
      }
      const access = data.share ?? { id: workspaceId.toLowerCase(), key: workspaceKey };
      const row = { id: data.id.toLowerCase(), workspace_id: workspaceId.toLowerCase(), share_id: data.share?.id.toLowerCase() ?? null, code_hash: hash('short-link', data.code) };
      const existing = await db.query('SELECT * FROM diagramai_sync.short_links WHERE id=$1 OR code_hash=$2 FOR UPDATE', [row.id, row.code_hash]);
      if (existing.rowCount) {
        const old = existing.rows[0];
        if (old.id !== row.id || old.workspace_id !== row.workspace_id || old.share_id !== row.share_id || old.code_hash !== row.code_hash) throw new SyncFault(409, 'SHORT_LINK_CONFLICT');
        const stored = (data.share ? ShareAccessSchema : WorkspaceAccessSchema).parse(unwrapShortAccess(old, data.code, shortLinkAad(old)));
        if (stored.id !== access.id.toLowerCase() || stored.key !== access.key) throw new SyncFault(409, 'SHORT_LINK_CONFLICT');
      } else {
        if (Number((await db.query('SELECT count(*) AS count FROM diagramai_sync.short_links WHERE workspace_id=$1', [workspaceId])).rows[0].count) >= 200) throw new SyncFault(409, 'SHORT_LINK_LIMIT');
        const sealed = wrapShortAccess({ ...access, id: access.id.toLowerCase() }, data.code, shortLinkAad(row));
        await db.query('INSERT INTO diagramai_sync.short_links(id,workspace_id,share_id,code_hash,ciphertext,iv,tag) VALUES ($1,$2,$3,$4,$5,$6,$7)', [row.id, row.workspace_id, row.share_id, row.code_hash, sealed.ciphertext, sealed.iv, sealed.tag]);
      }
      return { id: row.id };
    });
  }
  async resolveShortLink(kind: 'workspace' | 'share', code: string) {
    if (!ShortCodeSchema.safeParse(code).success) throw new SyncFault(401, 'ACCESS_DENIED');
    return this.tx(async (db) => {
      const found = await db.query('SELECT * FROM diagramai_sync.short_links WHERE code_hash=$1', [hash('short-link', code)]), row = found.rows[0];
      if (!row || (row.share_id ? 'share' : 'workspace') !== kind) throw new SyncFault(401, 'ACCESS_DENIED');
      let access: { id: string; key: string };
      try { access = (kind === 'share' ? ShareAccessSchema : WorkspaceAccessSchema).parse(unwrapShortAccess(row, code, shortLinkAad(row))); }
      catch { throw new SyncFault(401, 'ACCESS_DENIED'); }
      if (access.id !== (row.share_id ?? row.workspace_id)) throw new SyncFault(401, 'ACCESS_DENIED');
      if (kind === 'workspace') await this.workspaceAuth(db, access.id, access.key);
      else { const scope = await this.shareAuth(db, access.id, access.key); if (scope.workspace_id !== row.workspace_id) throw new SyncFault(401, 'ACCESS_DENIED'); }
      // A scoped alias never returns the workspace ID/key or an owner grant.
      return { id: row.id as string, kind, access };
    });
  }
  private async shareAuth(db: PoolClient, id: string, key: string) {
    if (!ShareKeySchema.safeParse(key).success) throw new SyncFault(401, 'ACCESS_DENIED');
    const result = await db.query<{ workspace_id: string; folder_id: string | null; project_id: string | null }>('SELECT workspace_id,folder_id,project_id FROM diagramai_sync.share_links WHERE id=$1 AND key_hash=$2 FOR UPDATE', [id, hash('share', key)]);
    if (!result.rowCount) throw new SyncFault(401, 'ACCESS_DENIED'); return result.rows[0];
  }
  async shareCatalog(id: string, key: string) {
    return this.tx(async (db) => {
      const scope = await this.shareAuth(db, id, key);
      const drawings = await db.query('SELECT p.id,d.folder_id AS "folderId",p.title,p.current_revision::double precision AS revision FROM diagramai_sync.workspace_drawings d JOIN diagramai_sync.projects p ON p.id=d.project_id WHERE d.workspace_id=$1 AND (($2::uuid IS NOT NULL AND d.folder_id=$2) OR ($3::uuid IS NOT NULL AND d.project_id=$3)) ORDER BY p.title,p.id', [scope.workspace_id, scope.folder_id, scope.project_id]);
      const folderId = scope.folder_id ?? drawings.rows[0]?.folderId;
      const folders = folderId ? (await db.query('SELECT id,title FROM diagramai_sync.workspace_folders WHERE workspace_id=$1 AND id=$2', [scope.workspace_id, folderId])).rows : [];
      // No workspace key/ID, device credentials or sibling metadata in this response.
      return { id: id.toLowerCase(), kind: scope.folder_id ? 'project' : 'drawing', targetId: scope.folder_id ?? scope.project_id, folders, drawings: drawings.rows };
    });
  }
  async shareDrawingAccess(id: string, key: string, projectId: string) {
    return this.tx(async (db) => {
      const scope = await this.shareAuth(db, id, key);
      const allowed = await db.query('SELECT 1 FROM diagramai_sync.workspace_drawings WHERE workspace_id=$1 AND project_id=$2 AND (($3::uuid IS NOT NULL AND folder_id=$3) OR ($4::uuid IS NOT NULL AND project_id=$4))', [scope.workspace_id, projectId, scope.folder_id, scope.project_id]);
      if (!allowed.rowCount) throw new SyncFault(404, 'SHARE_TARGET_NOT_FOUND');
      const result = await db.query<ProjectRow>('SELECT * FROM diagramai_sync.projects WHERE id=$1 FOR UPDATE', [projectId]);
      const secret = `dai_device_v1_${createHmac('sha256', key).update(`share-drawing\0${projectId.toLowerCase()}`).digest('base64url')}`;
      const device = await db.query<{ id: string; revoked_at: Date | null }>('SELECT id,revoked_at FROM diagramai_sync.project_devices WHERE project_id=$1 AND token_hash=$2', [projectId, hash('device', secret)]);
      if (device.rowCount && device.rows[0].revoked_at) throw new SyncFault(401, 'ACCESS_DENIED');
      const credentials: DeviceGrant = device.rowCount
        ? { projectId: projectId.toLowerCase(), deviceId: device.rows[0].id, token: secret, scope: 'editor' }
        : await this.grant(db, projectId, 'Link chia sẻ', 'editor', secret);
      return { credentials, snapshot: this.snapshot(result.rows[0]) };
    });
  }
  async pull(projectId: string, bearer: string): Promise<CloudSnapshot>;
  async pull(projectId: string, bearer: string, afterRevision: number): Promise<CloudSnapshot | null>;
  async pull(projectId: string, bearer: string, afterRevision = 0): Promise<CloudSnapshot | null> {
    return this.tx(async (db) => {
      await this.authorize(db, projectId, bearer);
      // Do not fetch/decode a large TOASTed snapshot on unchanged polling ticks.
      const result = await db.query<ProjectRow>('SELECT * FROM diagramai_sync.projects WHERE id=$1 AND current_revision>$2', [projectId, afterRevision]);
      return result.rowCount ? this.snapshot(result.rows[0]) : null;
    });
  }
  async push(projectId: string, bearer: string, input: unknown) {
    const data = PushSnapshotSchema.parse(input), { payload, bytes } = this.payload(data.document, data.hash);
    await this.bucket('global:upload-bytes:day', Math.floor(Date.now() / 86400000), 128 * 1024 * 1024, 172800, bytes, 'DAILY_LIMIT');
    return this.tx(async (db) => {
      const principal = await this.authorize(db, projectId, bearer);
      const result = await db.query<ProjectRow>('SELECT * FROM diagramai_sync.projects WHERE id=$1 FOR UPDATE', [projectId]), current = result.rows[0];
      const receipt = await db.query('SELECT * FROM diagramai_sync.sync_operations WHERE project_id=$1 AND operation_id=$2', [projectId, data.operationId]);
      if (receipt.rowCount) {
        const old = receipt.rows[0];
        if (old.device_id !== principal.id || Number(old.base_revision) !== data.baseRevision || old.snapshot_hash !== data.hash) throw new SyncFault(409, 'OPERATION_REUSED');
        return { acceptedRevision: Number(old.accepted_revision), hash: old.snapshot_hash };
      }
      if (data.document.documentId.toLowerCase() !== current.document_id) throw new SyncFault(400, 'DOCUMENT_ID_MISMATCH');
      if (Number(current.current_revision) !== data.baseRevision) throw new SyncFault(409, 'REVISION_CONFLICT');
      const operations = await db.query('SELECT count(*)::int AS count FROM diagramai_sync.sync_operations WHERE project_id=$1', [projectId]);
      if (operations.rows[0].count >= 10000) throw new SyncFault(409, 'OPERATION_LIMIT');
      const next = data.baseRevision + 1;
      const pruned = await db.query('DELETE FROM diagramai_sync.project_revisions WHERE project_id=$1 AND revision <= $2 RETURNING snapshot_bytes', [projectId, next - this.limits.revisions]);
      const released = pruned.rows.reduce((total, row) => total + row.snapshot_bytes, 0);
      await this.budget(db, bytes * 2 - current.snapshot_bytes - released);
      const updated = await db.query('UPDATE diagramai_sync.projects SET title=$1,current_revision=$2,snapshot_jsonb=$3,snapshot_hash=$4,snapshot_bytes=$5,updated_at=now() WHERE id=$6 AND current_revision=$7 RETURNING id', [data.document.title, next, payload, data.hash, bytes, projectId, data.baseRevision]);
      if (updated.rowCount !== 1) throw new SyncFault(409, 'REVISION_CONFLICT');
      await db.query('INSERT INTO diagramai_sync.project_revisions(project_id,revision,snapshot_jsonb,snapshot_hash,snapshot_bytes,operation_id) VALUES ($1,$2,$3,$4,$5,$6)', [projectId, next, payload, data.hash, bytes, data.operationId]);
      await db.query('INSERT INTO diagramai_sync.sync_operations(project_id,operation_id,device_id,base_revision,accepted_revision,snapshot_hash) VALUES ($1,$2,$3,$4,$5,$6)', [projectId, data.operationId, principal.id, data.baseRevision, next, data.hash]);
      return { acceptedRevision: next, hash: data.hash };
    });
  }
  async pair(projectId: string, bearer: string) {
    return this.tx(async (db) => {
      const principal = await this.authorize(db, projectId, bearer);
      await db.query('SELECT id FROM diagramai_sync.projects WHERE id=$1 FOR UPDATE', [projectId]);
      // Only the latest code from this device stays redeemable.
      await db.query('DELETE FROM diagramai_sync.pairing_codes WHERE project_id=$1 AND (created_by=$2 OR expires_at<now() OR redeemed_at IS NOT NULL)', [projectId, principal.id]);
      const code = [...randomBytes(10)].map((byte) => alphabet[byte & 31]).join('');
      const result = await db.query('INSERT INTO diagramai_sync.pairing_codes(code_hash,project_id,created_by,expires_at) VALUES ($1,$2,$3,now()+interval \'5 minutes\') RETURNING expires_at', [hash('pairing', code), projectId, principal.id]);
      return { code, expiresAt: result.rows[0].expires_at.toISOString() };
    });
  }
  async redeem(input: unknown) {
    const data = RedeemSchema.parse(input);
    return this.tx(async (db) => {
      // Postgres is authoritative for expiry; client/function clocks can drift.
      const result = await db.query('SELECT * FROM diagramai_sync.pairing_codes WHERE code_hash=$1 AND redeemed_at IS NULL AND expires_at>now() FOR UPDATE', [hash('pairing', data.code)]), code = result.rows[0];
      if (!code) throw new SyncFault(401, 'PAIRING_INVALID');
      const source = await db.query('SELECT 1 FROM diagramai_sync.project_devices WHERE id=$1 AND revoked_at IS NULL', [code.created_by]);
      if (!source.rowCount) throw new SyncFault(401, 'PAIRING_INVALID');
      const project = await db.query<ProjectRow>('SELECT * FROM diagramai_sync.projects WHERE id=$1 FOR UPDATE', [code.project_id]);
      const credentials = await this.grant(db, code.project_id, data.deviceLabel, 'editor');
      await db.query('UPDATE diagramai_sync.pairing_codes SET redeemed_at=now(),attempts=attempts+1 WHERE code_hash=$1', [hash('pairing', data.code)]);
      return { credentials, snapshot: this.snapshot(project.rows[0]) };
    });
  }
  async devices(projectId: string, bearer: string) {
    return this.tx(async (db) => {
      await this.authorize(db, projectId, bearer);
      return (await db.query('SELECT id,device_label AS "deviceLabel",scope,created_at AS "createdAt",revoked_at AS "revokedAt" FROM diagramai_sync.project_devices WHERE project_id=$1 ORDER BY created_at', [projectId])).rows;
    });
  }
  async revoke(projectId: string, bearer: string, deviceId: string) {
    return this.tx(async (db) => {
      const principal = await this.authorize(db, projectId, bearer, true);
      if (deviceId === principal.id) throw new SyncFault(409, 'CANNOT_REVOKE_SELF');
      await db.query('UPDATE diagramai_sync.project_devices SET revoked_at=coalesce(revoked_at,now()) WHERE project_id=$1 AND id=$2', [projectId, deviceId]);
      await db.query('DELETE FROM diagramai_sync.pairing_codes WHERE project_id=$1 AND created_by=$2', [projectId, deviceId]);
    });
  }
  async recover(projectId: string, input: unknown) {
    const data = RecoverySchema.parse(input);
    return this.tx(async (db) => {
      const project = await db.query<ProjectRow>('SELECT p.* FROM diagramai_sync.projects p JOIN diagramai_sync.project_recovery r ON r.project_id=p.id WHERE p.id=$1 AND r.recovery_hash=$2 FOR UPDATE OF p', [projectId, hash('recovery', data.recoveryKey)]);
      if (!project.rowCount) throw new SyncFault(401, 'RECOVERY_INVALID');
      if (data.revokeOtherDevices) {
        await db.query('UPDATE diagramai_sync.project_devices SET revoked_at=coalesce(revoked_at,now()) WHERE project_id=$1', [projectId]);
        await db.query('DELETE FROM diagramai_sync.pairing_codes WHERE project_id=$1', [projectId]);
      }
      return { credentials: await this.grant(db, projectId, data.deviceLabel, 'owner'), snapshot: this.snapshot(project.rows[0]) };
    });
  }
  async revisions(projectId: string, bearer: string) {
    return this.tx(async (db) => {
      await this.authorize(db, projectId, bearer);
      return (await db.query('SELECT revision::double precision AS revision,snapshot_hash AS hash,created_at AS "createdAt" FROM diagramai_sync.project_revisions WHERE project_id=$1 ORDER BY revision DESC LIMIT $2', [projectId, this.limits.revisions])).rows;
    });
  }
  async deleteProject(projectId: string, bearer: string) {
    return this.tx(async (db) => {
      await this.authorize(db, projectId, bearer, true);
      const current = await db.query<ProjectRow>('SELECT * FROM diagramai_sync.projects WHERE id=$1 FOR UPDATE', [projectId]);
      const retained = await db.query('SELECT coalesce(sum(snapshot_bytes),0)::bigint AS bytes FROM diagramai_sync.project_revisions WHERE project_id=$1', [projectId]);
      await db.query('DELETE FROM diagramai_sync.projects WHERE id=$1', [projectId]);
      await db.query('UPDATE diagramai_sync.storage_budget SET used_bytes=used_bytes-$1,project_count=project_count-1 WHERE singleton=true', [Number(current.rows[0].snapshot_bytes) + Number(retained.rows[0].bytes)]);
    });
  }
}
