-- Count accepted projects in the same transaction as creation. Invalid requests
-- and rolled-back writes cannot consume the lifetime project quota.
ALTER TABLE diagramai_sync.storage_budget ADD COLUMN project_count integer NOT NULL DEFAULT 0 CHECK (project_count >= 0);
UPDATE diagramai_sync.storage_budget SET project_count=(SELECT count(*) FROM diagramai_sync.projects) WHERE singleton=true;
