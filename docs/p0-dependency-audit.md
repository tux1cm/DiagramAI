# P0 dependency audit — 2026-11-18

- `npm audit --omit=dev`: 0 advisories in runtime dependencies at initial P0 check.
- Full `npm audit` after locked install: **12 high entries**, propagated from one advisory in the build/test toolchain: picomatch ReDoS, GHSA-fc5q-39xc-vjpf (repeated extglobs).
- Affected dependency chain includes picomatch → tinyglobby/fdir → Vite, Vitest and TypeScript ESLint tooling. These are development/build dependencies, not the shipped browser diagram runtime.
- Registry `picomatch@latest` returned 4.0.7 during this check; advisory marks `<=4.0.7` affected. No patched latest was available to upgrade to at that moment.
- Do not run `npm audit fix --force`: suggested major downgrades do not establish that this vulnerability is fixed and can break the selected toolchain.

Mitigation for P0: keep dev/preview bound to loopback, accept only trusted source/config/glob inputs, do not expose build tooling as a public API, and do not treat a successful build as a clean security audit. Recheck upstream before release and upgrade/test as soon as an appropriate patched dependency is available. This remains an **open security item**, not a PASS.
