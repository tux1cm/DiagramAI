# ADR 0012 — Neon-backed short aliases and explicit owner deletion

Status: accepted and released; production API, native installer and public Pages verified (2026-11-26).

## Context

ADR 0011 preserves full capabilities in a 65-character compact payload. The owner requested genuinely short links and missing Project/drawing deletion actions, without accounts or per-device workspace provisioning.

## Decision

Use new random 16-byte base64url aliases (22 canonical characters) under owner/share-specific fragment routes. Do not shorten, rotate or replace existing workspace/share keys. The authenticated owner creates aliases; resolving an alias returns exactly the original capability so immutable local credentials and deterministic device grants remain compatible.

Store only the alias hash plus AES-256-GCM wrapped access. Derive the wrapping key from the random alias with domain separation. Bind alias ID, workspace ID, share ID and hash as authenticated metadata. Do not depend on the deployment rate-secret, which rotates. Lookup uses Authorization headers, no query credentials, no-store responses and conservative rate limits (60 global/20 identity per minute). Share lookup never returns workspace access. Maximum 200 aliases per workspace; other quotas unchanged.

Persist alias UUID/code before publication; retain unpublished state across errors and retry identically. Mark published only after server ACK and a durable local commit. Keep alias secrets in IndexedDB credentials / Windows per-user DPAPI. Hash-indexed resolution cache contains only IDs/kind, and reuse also checks the stored alias credential. Unknown links require network; remembered links can reopen offline. Old link formats remain accepted.

Published owner Project/drawing cards expose deletion, never scoped recipient cards. Retrieve a fresh catalog preview without automatically synchronizing pending edits. Confirmation describes affected count, invalidated shares and retained local copies. Server deletion checks current membership/revisions under workspace/project locks. Reject changed previews rather than silently expanding deletion. Idempotent retry is keyed by the permanently retired target ID.

Store tombstones for each deleted drawing/folder in additive migration 006. Expose them separately through authenticated `/changes`, preserving the strict legacy catalog shape. Refuse recreation/adoption with retired IDs. Clients apply tombstones before pending creation, preserve local records, materialize any conflict cloud branch atomically with unlinking, and persist ignored-copy IDs before the unlink. Check all matching local links, including records outside current mappings. Never recreate a default folder merely because a joined workspace is empty.

## Consequences

New short links need the Neon resolver on first opening; existing self-contained links remain valid. Short URLs are bearer capabilities and must stay private to their intended scope. Deletion is explicit cloud deletion, not secure erasure of local backups: recipients/devices may retain downloaded copies. Pending-only cards require synchronization before cloud deletion. History is bounded at 2,000 entries per workspace; exceeding it fails closed rather than pruning anti-resurrection protection. Backup/restore/current-data verification includes both additive tables before production deployment.
