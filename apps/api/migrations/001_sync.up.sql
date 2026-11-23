-- P5 additive migration. Run on the isolated development branch before production.
CREATE SCHEMA IF NOT EXISTS diagramai_sync;

CREATE TABLE diagramai_sync.projects (
  id uuid PRIMARY KEY,
  create_operation_id uuid UNIQUE NOT NULL,
  document_id uuid NOT NULL,
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 100),
  current_revision bigint NOT NULL CHECK (current_revision > 0),
  snapshot_jsonb jsonb NOT NULL,
  snapshot_hash text NOT NULL CHECK (snapshot_hash ~ '^[a-f0-9]{64}$'),
  snapshot_bytes integer NOT NULL CHECK (snapshot_bytes BETWEEN 1 AND 2097152),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE diagramai_sync.project_devices (
  id uuid PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES diagramai_sync.projects(id) ON DELETE CASCADE,
  token_hash text UNIQUE NOT NULL CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  device_label text NOT NULL CHECK (length(device_label) BETWEEN 1 AND 80),
  scope text NOT NULL CHECK (scope IN ('owner', 'editor')),
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);
CREATE INDEX project_devices_project ON diagramai_sync.project_devices(project_id);
CREATE TABLE diagramai_sync.project_recovery (
  project_id uuid PRIMARY KEY REFERENCES diagramai_sync.projects(id) ON DELETE CASCADE,
  recovery_hash text NOT NULL CHECK (recovery_hash ~ '^[a-f0-9]{64}$'),
  rotated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE diagramai_sync.project_revisions (
  project_id uuid NOT NULL REFERENCES diagramai_sync.projects(id) ON DELETE CASCADE,
  revision bigint NOT NULL CHECK (revision > 0),
  snapshot_jsonb jsonb NOT NULL,
  snapshot_hash text NOT NULL,
  snapshot_bytes integer NOT NULL CHECK (snapshot_bytes BETWEEN 1 AND 2097152),
  operation_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(project_id, revision),
  UNIQUE(project_id, operation_id)
);
-- Retain idempotency receipts even when an old snapshot is pruned.
CREATE TABLE diagramai_sync.sync_operations (
  project_id uuid NOT NULL REFERENCES diagramai_sync.projects(id) ON DELETE CASCADE,
  operation_id uuid NOT NULL,
  device_id uuid NOT NULL REFERENCES diagramai_sync.project_devices(id),
  base_revision bigint NOT NULL,
  accepted_revision bigint NOT NULL,
  snapshot_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(project_id, operation_id)
);
CREATE TABLE diagramai_sync.pairing_codes (
  code_hash text PRIMARY KEY CHECK (code_hash ~ '^[a-f0-9]{64}$'),
  project_id uuid NOT NULL REFERENCES diagramai_sync.projects(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES diagramai_sync.project_devices(id),
  expires_at timestamptz NOT NULL,
  redeemed_at timestamptz,
  attempts integer NOT NULL DEFAULT 0
);
CREATE INDEX pairing_codes_project ON diagramai_sync.pairing_codes(project_id);
CREATE TABLE diagramai_sync.rate_limit_buckets (
  bucket_id text NOT NULL,
  window_start bigint NOT NULL,
  counter bigint NOT NULL CHECK (counter >= 0),
  expires_at timestamptz NOT NULL,
  PRIMARY KEY(bucket_id, window_start)
);
-- A single locked accounting row enforces a global storage hard cap atomically.
CREATE TABLE diagramai_sync.storage_budget (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  used_bytes bigint NOT NULL DEFAULT 0 CHECK (used_bytes >= 0)
);
INSERT INTO diagramai_sync.storage_budget(singleton, used_bytes) VALUES (true, 0);
