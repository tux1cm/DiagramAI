-- Editable capability links, restricted to one project folder or one drawing.
CREATE TABLE diagramai_sync.share_links (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES diagramai_sync.workspaces(id),
  folder_id uuid,
  project_id uuid REFERENCES diagramai_sync.projects(id) ON DELETE CASCADE,
  key_hash text NOT NULL CHECK (key_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((folder_id IS NOT NULL)::integer + (project_id IS NOT NULL)::integer = 1),
  FOREIGN KEY(workspace_id,folder_id) REFERENCES diagramai_sync.workspace_folders(workspace_id,id) ON DELETE CASCADE
);
CREATE INDEX share_links_workspace ON diagramai_sync.share_links(workspace_id);
