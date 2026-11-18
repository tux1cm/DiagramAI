# Changelog

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
