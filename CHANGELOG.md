# Changelog

## Unreleased — P2 drawing engine

- P1 đã được chủ dự án xác nhận PASS; triển khai P2, chưa chuyển P3/P4.
- Domain Zod/UUID, registry, validation/migration, atomic commands và immutable history độc lập React Flow.
- Canvas thật: thêm/kéo/resize hình, sửa chữ/nhãn cạnh inline, bốn neo, nối/reconnect và style/arrow/routing cơ bản.
- Clipboard nội bộ + OS best-effort, đa chọn, nhóm/căn chỉnh, properties và keyboard shortcuts; Undo/Redo cho từng gesture.
- Giữ document khi đi/đến diagnostics; dữ liệu vẫn trong bộ nhớ, không giả lưu/sync/AI. Bằng chứng ở `docs/p2-status.md`.
- Local PASS: lint/typecheck, 75 unit tests, 57 E2E executions/subpath, 3 kiểm tra neo live bổ sung, Windows NSIS build và cài/gỡ + thao tác WebView2 thật. Audit 0 advisories; còn warning bundle/toolchain được ghi rõ.

## 0.0.0 — 2026-11-19 — P1 React UI technical PASS

- Chuyển trang chính từ iframe reference sang shared React components; giữ CSS tokens/layout/icon/SVG geometry của mockup, không sửa reference.
- View state thực trong bộ nhớ cho chọn hình/cạnh, màu preset, title, search/collapse/zoom; Thuộc tính lấy từ selection.
- Trạng thái lưu/cloud/AI trung thực; engine controls chưa có bị disable, file/AI/shape actions nêu phase, không fake thành công hay gửi sơ đồ lên cloud.
- Giữ diagnostics P0/Neon; thêm tab keyboard navigation và modal focus trap/Escape/focus restoration.
- Thêm 11 unit tests cho P1 state/geometry/registry và E2E/visual comparison Web/WebView2; báo cáo `docs/p1-status.md`.
- Bổ sung dev-only pixelmatch/pngjs; full audit ngày 19/11 trả 0 advisories, không force downgrade.
- Đạt 31 unit tests, 30 E2E executions ở subpath, 3 visual viewport Web/native, NSIS cài/gỡ và 3 live tests. CI/Pages deploy commit b692203 SUCCESS; P1 đã lên site thật. Chờ chủ dự án review trước P2.

## 0.0.0 — 2026-11-18 — P0 technical spike PASS

- Khởi tạo npm workspaces React/Vite/TypeScript, shared P0 shell và React Flow v12 smoke test.
- Bảo toàn reference HTML, trích UI contract và chụp baseline bằng browser.
- Thêm Tauri 2 shell, kiểm tra toolchain và build.bat có log; sau chấp thuận đã cài Rust/Cargo 1.100.0 stable MSVC x64, sinh Cargo.lock, build NSIS và mở EXE smoke test thành công.
- Bổ sung icon Windows từ logo mockup (`design/app-icon.svg`); copy installer P0 và Web static vào `File/`. Chưa nghiệm thu installer/visual đầy đủ.
- Chuẩn bị Neon health Function có SELECT 1, exact-origin CORS và response không lộ DB error; chưa liên kết/deploy Neon.
- Thêm lint/typecheck/unit/E2E và workflow CI/Pages chạy thủ công.
- Không triển khai P1–P7, không sửa mockup gốc, không tạo project mới hoặc deploy API sản phẩm; chỉ health spike trên branch có sẵn.
- Kiểm thử NSIS cài/gỡ cách ly và WebView2 thật qua Playwright CDP loopback, resize 3 viewport, minimize/restore, hash navigation/reload.
- Full `build.bat --no-pause` PASS; thêm preflight phát hiện Vite giữ file, bắt mã lỗi âm, archive output cũ không xóa và sinh manifest/hướng dẫn cài.
- Ghi nhận advisory picomatch trong dev toolchain, chưa có patched latest tại thời điểm audit; không tự force downgrade.
- Theo xác nhận của chủ dự án: push repo `tux1cm/DiagramAI`, CI và Pages deploy SUCCESS; Web public không login, gọi Neon health thật qua browser CORS/preflight.
- Dùng Neon project DiagramAI hiện có tại Singapore, branch production, Function health deployment 1; chỉ SELECT 1, không migrations, không tạo project hoặc bật billing. Đăng nhập OAuth qua Cốc Cốc theo yêu cầu.
- Bổ sung live E2E trên Pages thật (3 viewport), cấu hình URL API công khai cho local build; không đưa token hoặc DATABASE_URL vào frontend.
- Full build cuối phiên và bộ cài có URL API đều đạt cài/gỡ + WebView2/live Neon health; lưu ảnh bằng chứng trong `docs/evidence/p0/`. P1 chưa triển khai, advisory dev toolchain vẫn OPEN.
