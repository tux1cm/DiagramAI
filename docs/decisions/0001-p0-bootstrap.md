# ADR 0001 — Bootstrap P0, không triển khai trước P1–P7

- Ngày: 2026-11-18
- Trạng thái: quyết định triển khai nội bộ P0, không thay kiến trúc đã chốt.

## Bối cảnh

Ban đầu workspace chỉ có `plan.md` và `DiagramAI_Mockup.html`, chưa có mã sản phẩm. P0 cần một shell chạy được trên Web/Tauri trước khi chuyển UI và viết engine.

## Quyết định

1. Dùng npm workspaces; Web React/Vite và Tauri chia sẻ cùng frontend.
2. Pin `@xyflow/react` 12.12.1; các phiên bản JS thực tế được giữ trong `package-lock.json`.
3. Hiển thị reference HTML bất biến trong iframe sandbox ở P0, có nhãn P0 tách biệt. P1 sẽ thay bằng React components; không chuyển logic mockup thành domain engine.
4. Thử React Flow tại `#/spike`, không giả định canvas mockup chứng minh thư viện đã hoạt động.
5. Backend spike là Neon Functions fetch handler + `pg` pool theo tài liệu Neon truy cập ngày 18/11/2026, không dùng DB connection từ frontend.
6. Chưa cài Rust, tạo GitHub repo, liên kết Neon hoặc deploy khi chưa có cấu hình/chấp thuận phù hợp.

## Hệ quả

Không coi tương tác demo, trạng thái lưu demo hoặc AI demo là chức năng sản phẩm. Iframe có opaque origin, không có quyền lưu dữ liệu browser sản phẩm. Chưa có SQLite/IndexedDB. Cargo.lock chỉ có thể sinh sau khi có Rust; chưa thể tuyên bố reproducible Desktop build.

## Cần kiểm chứng

- Runtime Tauri/WebView2, CSP và NSIS.
- Region Singapore, secrets, Postgres, CORS từ Pages thật, quota Functions trên dashboard.
- Review baseline trước P1. Không tự đổi layout hoặc backend.

## Cập nhật sau chấp thuận cài Rust

Chủ dự án đã đồng ý cài Rust ngày 18/11/2026. Đã cài Rust/Cargo stable 1.100.0 MSVC x64 bằng Rustup chính thức, sinh Cargo.lock, bổ sung icon.ico từ logo mockup và build NSIS thành công. Binary release mở được, có cửa sổ phản hồi và document mockup trong UI Automation. Đây là startup smoke test, chưa nghiệm thu toàn bộ Desktop. Các ghi chú thiếu Rust ở phần bối cảnh trên là trạng thái ban đầu, không còn là blocker hiện tại.
