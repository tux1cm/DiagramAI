-- Add a private workspace catalog around existing P5 diagram projects.
-- No existing diagram is moved, renamed, merged or deleted by this migration.
CREATE TABLE diagramai_sync.workspaces (
  id uuid PRIMARY KEY,
  key_hash text NOT NULL CHECK (key_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE diagramai_sync.workspace_folders (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES diagramai_sync.workspaces(id),
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 100),
  UNIQUE(workspace_id,id)
);
CREATE TABLE diagramai_sync.workspace_drawings (
  project_id uuid PRIMARY KEY REFERENCES diagramai_sync.projects(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES diagramai_sync.workspaces(id),
  folder_id uuid NOT NULL,
  device_id uuid NOT NULL REFERENCES diagramai_sync.project_devices(id),
  FOREIGN KEY(workspace_id,folder_id) REFERENCES diagramai_sync.workspace_folders(workspace_id,id)
);
CREATE INDEX workspace_drawings_workspace ON diagramai_sync.workspace_drawings(workspace_id);
