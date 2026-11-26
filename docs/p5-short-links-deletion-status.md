# P5 — True short links and owner card deletion

Work in progress (2026-11-26). **Production API updated; final Web/Desktop release verification pending.** The previous 65-character compact-link release remains documented in `p5-compact-links-status.md`.

## New behavior

- New owner/share links use a canonical random 128-bit, 22-character base64url alias in the fragment (`#/w/…`, `#/s/…`). Legacy long and 65-character links still work.
- Neon stores the alias hash and AES-256-GCM wrapped original capability, with metadata-bound AAD. The wrapping key derives from the alias, not a rotating deployment secret. Resolution is header-only, rate-limited and no-store; a share never resolves to owner credentials.
- Local credentials and alias identity are durable before publication. Lost creation ACKs retry the same identity; links are displayed only after cloud ACK and local publication persistence. Known links can reopen offline.
- Owner Project/drawing cards have delete actions for published items. A fresh cloud preview lists the affected count, requires explicit confirmation and uses membership/revision CAS. Unsynchronized items must be synchronized first.
- Deletion retains local records and both conflict branches, revokes related shares, and records durable tombstones. Synchronization processes tombstones before local creates/adoption; deleted folders are not automatically recreated on an empty joined workspace.
- Additive migrations 005/006; backup/export verification includes both new tables. No existing migration, credential, billing setting or Neon project is replaced.

## Verification so far

- Lint/typecheck and 51 focused P5 unit/HTTP/boundary tests passed, including alias lost-ACK/restart reuse, deletion conflict-backup retention and cross-device tombstone application.
- 23 real Postgres integration tests passed on the explicitly guarded existing dev branch, including encrypted aliases/restart, scope denial, deletion CAS, lost-ACK retry and tombstone resurrection guards.
- Four Windows native credential/workspace tests passed, including DPAPI-only short credentials and non-secret resolution metadata.
- Dev API deployed; remote HTTP smoke passed exact original-capability resolution, wrong-kind denial, delete/tombstone/idempotency. Only disposable fixtures used and removed.
- Web: five existing short-link/scope/manual-sync/offline scenarios passed; new confirmed-deletion/cross-device/local-backup scenario passed separately after narrowing an ambiguous test selector. Browser channel Edge (bundled Playwright browser unavailable). Final suite rerun pending.
- 37 arrow/export boundary tests passed.
- Production additive migrations/API deployed only after fresh DPAPI export, constrained restore verification on dev and current-production comparison. Receipt: `verified-export-sha256:6cd547cdf6465db5b1c173a19c55f6da47ce5252eaa37cc88863d7d3acae3eeb`; four existing projects backed up. No owner capability was changed.
- Final production installer built: `File/Desktop_Light/DiagramAI_Setup_x64.exe`, 3,957,178 bytes, `testBuild=false`, SHA-256 `49f3eac098065dc1818da7a71aede9f3f6a4ceb5dab659417d0b936379687cb5`. Previous Web/Desktop output archived intact under `File/Previous/20261126-122420-950/`.
- Isolated installed Desktop against production API: 1/1 PASS (52.2s testcase, 1.1m harness), including 22-code main/share links, scope, DPAPI/restart, both conflict branches, confirmed Project deletion, retained local backup, cross-device propagation and guarded close sync. Only disposable fixture workspace removed.
- Same final installer: native arrow alignment 1/1 PASS (5.1s testcase, 7.1s harness), no cloud requests.
- Web publication and public verification continue; final focused Web rerun in progress. Evidence in `evidence/p5-short-links-deletion/`.
