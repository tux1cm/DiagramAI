-- DESTRUCTIVE administrative rollback, never run automatically.
-- Export/verify a backup first; rollback is not a recovery mechanism for user data.
DROP TABLE diagramai_sync.pairing_codes;
DROP TABLE diagramai_sync.sync_operations;
DROP TABLE diagramai_sync.project_revisions;
DROP TABLE diagramai_sync.project_recovery;
DROP TABLE diagramai_sync.project_devices;
DROP TABLE diagramai_sync.projects;
DROP TABLE diagramai_sync.rate_limit_buckets;
DROP TABLE diagramai_sync.storage_budget;
DELETE FROM diagramai_sync.schema_migrations WHERE version=1;
-- Keep the namespace; run down migrations in reverse version order. The
-- operator must preserve the verified backup/admin audit before executing.
