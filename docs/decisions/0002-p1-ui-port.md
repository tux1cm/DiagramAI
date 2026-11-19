# ADR 0002 — React UI P1, giữ reference và ranh giới engine

- Ngày: 2026-11-19
- Bối cảnh: chủ dự án đã xác nhận P0 PASS và yêu cầu P1.
- Trạng thái: triển khai theo yêu cầu đã chốt, không đổi kiến trúc.

## Quyết định

1. Bỏ iframe ở editor chính; dùng shared React components, icon và SVG renderers port từ mockup. Không sửa file reference hoặc biến script mockup thành engine production.
2. CSS reference trích bất biến bằng script và kiểm tra ở lint; mọi rule cho UI state/accessibility riêng ở `styles.css`.
3. P1 view-model chỉ là in-memory fixture state. Palette selection/preview color/title/zoom phục vụ nghiệm thu UI; không tự thêm history, serialization hay persistent document trước P2/P4.
4. UI chức năng tương lai không giả thành công: disabled engine controls, modal nêu phase, AI input không gửi request, saved/cloud status không dùng dữ liệu giả.
5. Visual acceptance dùng geometry assertion và pixel comparison Web/WebView2 tại 3 viewport. Chỉ mask wording trạng thái và unavailable-control states có liệt kê; canvas/palette/layout không được mask để che drift.
6. Giữ route diagnostics P0 và health backend hiện hành. P1 không đổi Neon project/branch hoặc deploy Function mới.

## Hệ quả

User có thể chọn hình mẫu, đổi màu để xem UI và kiểm tra panel, nhưng không dùng P1 lưu công việc thật. Resize/sửa label mà chủ dự án hỏi vẫn thuộc P2, không bị âm thầm coi là đã triển khai. Nút file/export hiện rõ roadmap P4 thay vì tiếp tục tải JSON/SVG demo của mockup.
