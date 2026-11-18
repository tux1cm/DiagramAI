# P0 — Báo cáo triển khai và kiểm thử

Ngày: 2026-11-18. **P0 — PASS các tiêu chí spike kỹ thuật:** Web Pages và Desktop Tauri chạy cùng shell, không login, cùng gọi được Neon Functions → PostgreSQL, NSIS/build.bat chạy thật. **Chưa triển khai P1 và chưa phải sản phẩm v1.0.** Các giới hạn và open security item được ghi rõ bên dưới.

## Checklist theo plan.md

| Hạng mục | Kết quả | Bằng chứng / phần còn thiếu |
|---|---|---|
| Git repo | PASS | `https://github.com/tux1cm/DiagramAI`, initial commit `7eef417` đã push lên main; không commit credentials |
| Monorepo React/Vite/TypeScript | Đạt local | Web build, lint, typecheck, unit test chạy thực |
| Khóa reference | Đạt local | HTML SHA-256 bên dưới, 3 ảnh baseline, `design/ui-contract.md` |
| Shell Web không login | Đạt local | Iframe reference và trang spike React; không phải UI P1 |
| React Flow v12 | Đạt smoke test local | 2 node/1 edge, thư viện 12.12.1 trong lockfile |
| GitHub Pages thật | PASS | `https://tux1cm.github.io/DiagramAI/`, Pages workflow và CI GitHub thành công |
| Neon Functions / PostgreSQL | PASS | Project DiagramAI `blue-mode-25353507`, Singapore, existing branch production; health deployment 1 completed, SELECT 1 thành công; không migration/sửa dữ liệu |
| Neon CORS từ Pages | PASS | In-app browser kiểm tra OK, 3 live Playwright Edge tests đạt gồm browser-forced preflight và hash reload; CLI origin lạ bị từ chối |
| Tauri / NSIS / runtime | P0 Windows smoke PASS | Cài/gỡ NSIS riêng, WebView2 render, resize 3 viewport, minimize/restore, hash navigation + reload, gọi Neon/DB từ origin Tauri đạt; không phải UAT editor v1 |
| Naming/schema/version/ADR | Đạt tài liệu P0 | `docs/architecture.md`, `docs/decisions/0001-p0-bootstrap.md`; domain schema code thuộc P2 |
| Lockfile | JS + Rust đã có | `package-lock.json` và `apps/desktop/src-tauri/Cargo.lock` |
| Review visual | Có baseline và ảnh WebView2 | Đã xem ảnh WebView2 1366×768; chưa phải pixel-diff parity assertion P1 |

## Kết quả đã chạy thật

| Lệnh / kiểm tra | Kết quả |
|---|---|
| `npm install --no-fund --no-audit` | Đã cài dependency và sinh lockfile |
| `npm run prepare:reference` | Bản sao byte-identical |
| `npm run check` | ESLint PASS, TypeScript PASS, **20 unit tests PASS / 2 files** |
| `npm run build:web` | Vite production build PASS |
| `PLAYWRIGHT_CHANNEL=msedge npm run test:e2e` | **9/9 PASS**, base `/` |
| Cùng E2E với `VITE_BASE_PATH=/p0-subpath/` | **9/9 PASS**, project-site subpath |
| `npm audit --omit=dev` | 0 vulnerabilities theo advisory tại thời điểm chạy; không thay security review |
| `npm run check:environment` sau cài Rust | PASS: Node/npm/Git/Rust/Cargo/MSVC có; thư mục WebView2 tìm thấy |
| `npx tauri info` tại `apps/desktop` trước cài Rust | CLI 2.12.5; WebView2 157.0.4341.60; MSVC Visual Studio Community 2026; ban đầu thiếu Rust |
| Rustup chính thức + `rustc --version` / `cargo --version` | PASS: stable `x86_64-pc-windows-msvc`, rustc 1.100.0, cargo 1.100.0; tải lần đầu timeout, tiếp tục bằng Rustup thành công |
| `npm run desktop:build` sau sửa icon | PASS: Tauri 2.12.6, binary release và NSIS x64 1.92 MiB. Lần trước dừng vì thiếu Cargo, rồi thiếu icon.ico; đã xử lý |
| Mở `target/release/diagramai.exe` | Startup smoke PASS: cửa sổ “DiagramAI - P0”, Responding=True; UI Automation thấy document mockup, logo và các nút palette. Chưa có pixel review hay UAT tương tác |
| `build.bat --no-pause` | PASS toàn bộ precheck → npm ci → lint/type/unit → Web/Tauri NSIS → collect, log `logs/build.log`. Đã sửa lỗi dependency bị Vite dev server giữ và mã thoát âm Windows |
| `scripts/collect-build.ps1` | PASS: archive nguyên output cũ vào `File/Previous/<timestamp>`, copy EXE/Web mới, sinh manifest SHA-256 và hướng dẫn cài; không ZIP/deploy |
| `npm run test:desktop` | PASS trên bộ cài trước và sau full build: install=0, 1 Playwright WebView2 test đạt, uninstall=0, app/registry cài thử được gỡ. Ảnh 1366×768, 1920×1080, 1280×720 trong `test-results/desktop/` |
| Bản Desktop có API sau full build lần cuối | PASS: kiểm thử health thật từ WebView2, ảnh `docs/evidence/p0/webview2-neon-health.png`; install/test/uninstall đều 0 |
| `npm run spike:neon` với URL/origin thật | PASS: health + PostgreSQL + OPTIONS exact-origin + disallowed origin 403 |
| `npm run test:live` | **3/3 PASS** trên Pages thật, viewport 1366/1920/1280; shell không login, hash reload, React Flow, health + browser preflight |
| GitHub CI | SUCCESS: https://github.com/tux1cm/DiagramAI/actions/runs/44277168747 — npm ci/check, Chromium install, E2E, artifact |
| GitHub Pages deployment | SUCCESS: https://github.com/tux1cm/DiagramAI/actions/runs/44277289591 |
| In-app browser http://127.0.0.1:5173/ | Shell tải được, console error rỗng tại thời điểm kiểm tra |
| Full `npm audit` sau npm ci | 12 high entries trong dev toolchain, gốc advisory picomatch ReDoS; chưa có patched latest trên registry tại thời điểm kiểm tra. Open item: `docs/p0-dependency-audit.md` |
| Neon CLI auth | PASS: chủ dự án đăng nhập lại qua Cốc Cốc; không dùng Chrome, token nằm trong credential store CLI, không trong project |
| Neon Free | `neon orgs list` xác nhận org Tu có `plan: free`; không đổi billing hoặc bật dịch vụ ngoài Postgres/Functions. Giới hạn cụ thể của Functions vẫn phải theo dashboard/điều khoản hiện hành, không cam kết miễn phí vô hạn |
| Quét static JS theo pattern phổ biến | Không thấy PostgreSQL connection URL, Gemini key hoặc GitHub token pattern; không thay secret/security audit hoàn chỉnh |

Chạy E2E local/live bằng Edge đã cài, không mở Chrome. CI trên GitHub đã tải và chạy Chromium bundle thành công. Cốc Cốc chỉ dùng cho đăng nhập Neon. Trình duyệt tích hợp đã xác nhận health từ Pages; do native click tool lỗi UnknownVizError, thao tác nút API được kích hoạt qua DOM và sau đó được kiểm chứng thêm bằng click thật trong Playwright live.

## Bằng chứng visual

- `design/reference/DiagramAI_Preview.png` — 1366×768.
- `design/reference/DiagramAI_Preview_1920.png` — 1920×1080.
- `design/reference/DiagramAI_Preview_1280.png` — 1280×720.
- `test-results/` và `playwright-report/` — artifact local, ignored trong Git.
- `test-results/live/` — ảnh Pages reference và API OK ở 3 viewport.
- `test-results/desktop/` — ảnh WebView2 thực và kết quả native smoke; report cài/gỡ `test-results/desktop-installer.json`.
- Bằng chứng giữ trong repo: `docs/evidence/p0/pages-neon-health-1366.png` và `docs/evidence/p0/webview2-neon-health.png`.

## Deployment hiện hành (chỉ public identifiers/URLs)

- Web: https://tux1cm.github.io/DiagramAI/
- API base: https://br-noisy-waterfall-b37wduo3-health.compute.c-4.ap-southeast-1.aws.neon.tech/
- Route: `GET /v1/health` → `{"status":"ok","apiVersion":"v1","database":"ok"}`.
- Function: `health`, deployment 1, Node.js 24, memory mặc định 2048 MiB; existing branch `production` / `br-noisy-waterfall-b37wduo3`.
- CORS exact allowlist: Pages origin, localhost/127.0.0.1 dev/preview, Tauri localhost origins; không có `*`.
- `.neon` tại apps/api đã link với `--no-env-pull`; không kéo connection string về frontend. `.env.local` root chỉ có URL API công khai, ignored bởi Git.
- Chỉ có health spike; **không có API đồng bộ/AI/dự án và không có dữ liệu người dùng được upload**.

## Artifact Desktop P0 cuối phiên

- Installer: `File/Desktop_Light/DiagramAI_Setup_x64.exe` — 2.009.705 bytes.
- SHA-256: `d358de99d98652fb014b4037f58ddb589496da8afd27e869af28b7536c17646c`.
- Manifest và hướng dẫn cài trong cùng thư mục; Web static tại `File/Web/`.
- Output phiên bản trước được archive nguyên vẹn tại `File/Previous/`, không xóa.

Mockup gốc giữ nguyên SHA-256:

```text
39e37f0f4dded9c31da9bbf9131ab23acc5283c9d7c7063b7492b87dc3212928
```

## File/nhóm thay đổi

- Root: `package.json`, `package-lock.json`, `tsconfig.json`, ESLint/Vitest/Playwright config, `.gitignore`, `.env.example`, `README.md`, `CHANGELOG.md`, `build.bat`.
- `apps/web/`: Vite entry/config và mount shared UI.
- `apps/desktop/`: Tauri Cargo/config/main/build, Cargo.lock và icon.ico lấy từ logo mockup; đã build EXE/NSIS.
- `apps/api/`: Neon config, health runtime, handler CORS và env example.
- `packages/ui/`, `packages/shared/`: shell/spike và health contract/client.
- `scripts/`: bảo toàn reference, kiểm tra môi trường/Neon và build/copy artifact.
- `tests/`: unit health/reference và E2E shell/route/baseline.
- `.github/workflows/`: CI và Pages deploy thủ công đã chạy thành công trên GitHub.
- `design/`, `docs/`: reference, UI contract, kiến trúc, ADR, hướng dẫn Neon và báo cáo này.
- Không sửa `plan.md` hoặc file `DiagramAI_Mockup.html` gốc.

## Việc còn lại / giới hạn

1. Bản Desktop có URL API đã đạt full build/cài/gỡ/WebView2/live health. Tauri dev/HMR chưa được nghiệm thu riêng; không coi release smoke thay cho toàn bộ quy trình phát triển.
2. Chủ dự án review visual; baseline không phải UI React P1. Chưa chạy UAT editor vì engine chưa triển khai.
3. Open advisory dev toolchain picomatch; xem `docs/p0-dependency-audit.md`. Không coi build đạt là security audit sạch.
4. Free plan đã xác nhận, không đổi billing; không hứa quota Functions cố định. Tách branch thử nghiệm trước các migration/data tests P5; hiện P0 chỉ query SELECT 1 trên branch có sẵn.
5. Lỗi DB/timeout được unit test bằng dependency injection; không làm hỏng hoặc dừng DB production để thử lỗi. Chưa benchmark cold start hoặc kiểm chứng hết quota thật.

Đánh giá PASS ở đây chỉ cho nền móng P0, dựa trên các bằng chứng thực đã liệt kê; không phải PASS bảo mật/hiệu năng/UAT v1.0. Advisory dev toolchain vẫn OPEN: đầu vào glob/config chỉ do đội phát triển kiểm soát, dev server loopback, không có API build công khai. Không tự thay Neon bằng Worker, không tự bật billing và không hứa quota Free cố định. Giai đoạn tiếp theo: P1 chuyển reference sang React components, không mang logic mockup thành engine production.
