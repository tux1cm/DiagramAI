-- Administrative rollback only; preserve backups and roll back frontend first.
DROP TABLE diagramai_sync.workspace_drawings;
DROP TABLE diagramai_sync.workspace_folders;
DROP TABLE diagramai_sync.workspaces;
DELETE FROM diagramai_sync.schema_migrations WHERE version=3;
