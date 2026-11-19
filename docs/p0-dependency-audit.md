# P0 dependency audit — 2026-11-18

- `npm audit --omit=dev`: 0 advisories in runtime dependencies at initial P0 check.
- Full `npm audit` after locked install: **12 high entries**, propagated from one advisory in the build/test toolchain: picomatch ReDoS, GHSA-fc5q-39xc-vjpf (repeated extglobs).
- Affected dependency chain includes picomatch → tinyglobby/fdir → Vite, Vitest and TypeScript ESLint tooling. These are development/build dependencies, not the shipped browser diagram runtime.
- Registry `picomatch@latest` returned 4.0.7 during this check; advisory marks `<=4.0.7` affected. No patched latest was available to upgrade to at that moment.
- Do not run `npm audit fix --force`: suggested major downgrades do not establish that this vulnerability is fixed and can break the selected toolchain.

Mitigation for P0: keep dev/preview bound to loopback, accept only trusted source/config/glob inputs, do not expose build tooling as a public API, and do not treat a successful build as a clean security audit. Recheck upstream before release and upgrade/test as soon as an appropriate patched dependency is available. This remains an **open security item**, not a PASS.

## Recheck — 2026-11-19 (P1)

After adding dev-only pixelmatch/pngjs visual-test dependencies, both `npm audit --omit=dev` and full `npm audit` reported **0 vulnerabilities** with the registry/advisory data available on this date. No `audit fix --force` or major downgrade was run. This supersedes the current audit count, not the historical P0 observation; it does not prove the underlying advisory was fixed by our UI code or remove the requirement for release security review.

## Recheck — 2026-11-19 (P2)

After adding the domain/editor workspaces and runtime Zod validation, full `npm audit --json` again reports **0 vulnerabilities** (59 production, 232 development dependencies). No forced fixes or toolchain downgrades. Release security review remains separate.
