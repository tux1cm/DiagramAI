-- Administrative rollback only; never executed by app startup/tests.
ALTER TABLE diagramai_sync.storage_budget DROP COLUMN project_count;
DELETE FROM diagramai_sync.schema_migrations WHERE version=2;
