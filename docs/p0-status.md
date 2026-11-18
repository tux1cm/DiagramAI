# P0 — Báo cáo triển khai và kiểm thử

Ngày: 2026-11-18. **Kết luận: IN PROGRESS / BLOCKED, chưa PASS P0. Không bắt đầu P1.**

## Checklist theo plan.md

| Hạng mục | Kết quả | Bằng chứng / phần còn thiếu |
|---|---|---|
| Git repo | Đã xác nhận repo | Chủ dự án xác nhận `https://github.com/tux1cm/DiagramAI`, public, ban đầu trống; đang chuẩn bị push và Pages |
| Monorepo React/Vite/TypeScript | Đạt local | Web build, lint, typecheck, unit test chạy thực |
| Khóa reference | Đạt local | HTML SHA-256 bên dưới, 3 ảnh baseline, `design/ui-contract.md` |
| Shell Web không login | Đạt local | Iframe reference và trang spike React; không phải UI P1 |
| React Flow v12 | Đạt smoke test local | 2 node/1 edge, thư viện 12.12.1 trong lockfile |
| GitHub Pages thật | **BLOCKED** | Chưa có repo/URL được xác nhận, chưa publish workflow |
| Neon Functions / PostgreSQL | **BLOCKED** | Có mã health, chưa liên kết project/branch, chưa có endpoint, chưa query DB thật |
| Neon CORS từ Pages | **BLOCKED** | Unit tests không thay live test, chưa kiểm tra từ Chrome trên Pages |
| Tauri / NSIS / runtime | P0 Windows smoke PASS | Cài/gỡ NSIS riêng, WebView2 render, resize 3 viewport, minimize/restore, hash navigation + reload đạt; không phải UAT editor v1 |
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
| `npm run spike:neon` | Dừng với BLOCKED do thiếu URL và origin; **không gửi request live** |
| In-app browser http://127.0.0.1:5173/ | Shell tải được, console error rỗng tại thời điểm kiểm tra |
| Full `npm audit` sau npm ci | 12 high entries trong dev toolchain, gốc advisory picomatch ReDoS; chưa có patched latest trên registry tại thời điểm kiểm tra. Open item: `docs/p0-dependency-audit.md` |
| Neon CLI auth | Session cũ invalid_grant. Chủ dự án cho phép login; lần OAuth đầu timeout 60 giây, chưa có phiên mới |

Chạy E2E local bằng Edge đã cài, không phải Chromium bundle riêng: việc tải bundle Chromium bị timeout; đã chuyển sang channel Edge minh bạch. Các project test tên `chromium-*` chỉ Chromium engine + viewport, không khẳng định Chrome đã kiểm thử.

## Bằng chứng visual

- `design/reference/DiagramAI_Preview.png` — 1366×768.
- `design/reference/DiagramAI_Preview_1920.png` — 1920×1080.
- `design/reference/DiagramAI_Preview_1280.png` — 1280×720.
- `test-results/` và `playwright-report/` — artifact local, ignored trong Git.

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
- `.github/workflows/`: CI và Pages deploy thủ công, chưa chạy trên GitHub.
- `design/`, `docs/`: reference, UI contract, kiến trúc, ADR, hướng dẫn Neon và báo cáo này.
- Không sửa `plan.md` hoặc file `DiagramAI_Mockup.html` gốc.

## Việc cần để gỡ blocker

1. Windows installed-release smoke và full build đã đạt. Còn Tauri dev smoke và review visual của chủ dự án; đây không phải UAT editor sản phẩm.
2. Repo đã xác nhận: `tux1cm/DiagramAI`. Push, cấu hình Pages và kiểm tra workflow/URL/reload thật.
3. Liên kết Neon **project DiagramAI hiện có** qua OAuth/CLI/Console, chọn dev branch được duyệt, cấu hình origin exact và secrets tại backend. Không gửi DB password/token vào chat.
4. Deploy health, chạy DB/CORS/error/secret/quota spike theo `docs/p0-neon-spike.md`; review ảnh reference.

Chỉ cập nhật P0 thành PASS sau khi đủ bằng chứng thực cho tất cả điều kiện. Không tự thay Neon bằng Worker, không tự bật billing và không hứa quota Free cố định.
