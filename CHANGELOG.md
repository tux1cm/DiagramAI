# Changelog

## 0.0.0 — 2026-11-18 — P0 in progress

- Khởi tạo npm workspaces React/Vite/TypeScript, shared P0 shell và React Flow v12 smoke test.
- Bảo toàn reference HTML, trích UI contract và chụp baseline bằng browser.
- Thêm Tauri 2 shell, kiểm tra toolchain và build.bat có log; sau chấp thuận đã cài Rust/Cargo 1.100.0 stable MSVC x64, sinh Cargo.lock, build NSIS và mở EXE smoke test thành công.
- Bổ sung icon Windows từ logo mockup (`design/app-icon.svg`); copy installer P0 và Web static vào `File/`. Chưa nghiệm thu installer/visual đầy đủ.
- Chuẩn bị Neon health Function có SELECT 1, exact-origin CORS và response không lộ DB error; chưa liên kết/deploy Neon.
- Thêm lint/typecheck/unit/E2E và workflow CI/Pages chạy thủ công.
- Không triển khai P1–P7, không sửa mockup gốc, không tạo dịch vụ hoặc deploy production.
- Kiểm thử NSIS cài/gỡ cách ly và WebView2 thật qua Playwright CDP loopback, resize 3 viewport, minimize/restore, hash navigation/reload.
- Full `build.bat --no-pause` PASS; thêm preflight phát hiện Vite giữ file, bắt mã lỗi âm, archive output cũ không xóa và sinh manifest/hướng dẫn cài.
- Ghi nhận advisory picomatch trong dev toolchain, chưa có patched latest tại thời điểm audit; không tự force downgrade.
