-- Retain deletion identity so lost create ACKs/offline clients cannot resurrect it.
CREATE TABLE diagramai_sync.workspace_deletions (
  workspace_id uuid NOT NULL REFERENCES diagramai_sync.workspaces(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('project','drawing')),
  target_id uuid NOT NULL,
  deleted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(workspace_id,kind,target_id)
);
