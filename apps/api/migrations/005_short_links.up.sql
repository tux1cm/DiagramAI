-- Random 128-bit aliases. No plaintext short code or underlying capability in DB.
CREATE TABLE diagramai_sync.short_links (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES diagramai_sync.workspaces(id) ON DELETE CASCADE,
  share_id uuid REFERENCES diagramai_sync.share_links(id) ON DELETE CASCADE,
  code_hash text NOT NULL UNIQUE CHECK (code_hash ~ '^[a-f0-9]{64}$'),
  ciphertext text NOT NULL CHECK (length(ciphertext) BETWEEN 1 AND 2048 AND ciphertext ~ '^[A-Za-z0-9_-]+$'),
  iv text NOT NULL CHECK (iv ~ '^[A-Za-z0-9_-]{16}$'),
  tag text NOT NULL CHECK (tag ~ '^[A-Za-z0-9_-]{22}$'),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX short_links_workspace ON diagramai_sync.short_links(workspace_id);
