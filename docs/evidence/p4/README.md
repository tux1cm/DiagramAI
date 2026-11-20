# P4 evidence

- `autosave-restored.png`: editor sau reload với nội dung tiếng Việt đã autosave.
- `portable.diagramai`: JSON mẫu do test tải xuống, không chứa selection/history/view hoặc credentials.
- `native-restarted.png`: bản cài Windows mở lại cùng SQLite nhưng WebView profile mới; `installer-manifest.json` ghi byte size và SHA-256 bộ cài đã smoke test.
- `export.svg`, `export.png`, `export.pdf`: cùng một sơ đồ seed sáu hình/năm cạnh, dựng từ domain. PNG 2×; PDF A4 một trang, có FontFile2/ToUnicode. Đã đọc text PDF tiếng Việt và xem PNG trực tiếp.
- Suite Web: `PLAYWRIGHT_CHANNEL=msedge`, `VITE_BASE_PATH=/p0-subpath/`, **154 PASS + 2 skip stress lặp** trên 1366×768, 1920×1080, 1280×720.
- Kết quả native/live cuối và SHA bộ cài được ghi tại [`../../p4-status.md`](../../p4-status.md).

Mọi dữ liệu trong thư mục này là fixture kiểm thử, không phải dự án cá nhân.
