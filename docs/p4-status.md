# P4 — Lưu local, file và Desktop Light

Ngày: 2026-11-20. **P4 đạt kiểm thử kỹ thuật Web/Desktop, CI/Pages và live; chờ chủ dự án nghiệm thu.** P3 được chốt trước khi bắt đầu; không chuyển P5.

## Đã triển khai

- SQLite Desktop / IndexedDB Web, autosave debounce, restore, nhiều sơ đồ, tạo/đổi tên/nhân đôi/xóa có xác nhận.
- CAS chống tab cũ ghi đè, checksum, transaction nguyên tử, 20 checkpoint, retry/fork/reload có cảnh báo; giữ bản trong bộ nhớ khi lỗi.
- Import/export `.diagramai` validate/migrate; native dialog + atomic file replace và Web File System Access/download fallback trung thực.
- SVG domain, PNG 1×/2×/3×, PDF vector A4 với Noto Sans tiếng Việt nhúng; nền trắng/trong suốt, giới hạn xuất lớn.
- PWA static shell cache theo base path, không cache graph/API hoặc force reload; native close/browser unload protection.

ADR: [0005](decisions/0005-p4-local-persistence-and-portable-files.md).

## Bằng chứng hiện có

- `npm run check`: lint/typecheck và **150 unit tests PASS**, gồm khôi phục primary lỗi từ checkpoint mà không ghi đè bản hỏng.
- Rust: **3 tests PASS** (SQLite CAS/idempotency/checkpoints/delete/checksum và atomic UTF-8 file replace).
- Full Web trên `/p0-subpath/`: **154 PASS, 2 skip stress lặp có chủ đích**, không fail. P4 **18/18 PASS** trên 3 viewport: reload/multi-project, JSON/SVG/PNG/PDF (FontFile2 nhúng), offline reload, invalid import/ID collision, storage không khả dụng và hai tab xung đột/fork.
- Visual ngoài mask có sẵn **30/0/22 pixels**, không sửa mockup. P3 centered ratio resize, Ctrl-drag, insertion/snap và stress 101 gestures vẫn PASS.
- Đã đọc trực tiếp PNG xuất và text PDF: tiếng Việt đầy đủ (“Tiếp nhận vật tư”, “Đạt yêu cầu?”, “Trả nhà cung cấp”…), một trang A4 không cắt sơ đồ. Mẫu tại [`evidence/p4/`](evidence/p4/).
- `build.bat --no-pause` cuối **PASS**, gồm npm ci/check, Web, Tauri và NSIS; bộ cài **3,817,761 bytes**, SHA-256 `8093ecab1c98f12e6a8cbb66acfef6d35ea397e6f056b81e254c8ee07fd78b1f`. Đầu ra `File/Desktop_Light/DiagramAI_Setup_x64.exe` và `File/Web/`; manifest có trong evidence.
- Native cài/gỡ cách ly **PASS**: visual **392/316/378 pixels**, toàn bộ thao tác P2/P3, reload/restart SQLite bằng WebView profile mới, native save/open `.diagramai`, import collision thành bản sao, xuất SVG/PNG/PDF có font nhúng và đóng bằng close handler thật. Đã xác nhận autosave local **không thay file ngoài ổ đĩa**, Save lần hai mới ghi file đã cấp quyền. Không mở/đổi clipboard OS; data/profile/file test nằm trong thư mục temp cách ly.
- CSP Desktop chỉ thêm `blob:` cho ảnh xuất; không mở quyền đọc/ghi đường dẫn tùy ý. Automation dialog dùng HWND đã kiểm tra đúng process và xác nhận full test path trước Save/Open, không phụ thuộc focus/clipboard toàn hệ thống.
- Commit triển khai `913df11`: [CI 44686223811](https://github.com/tux1cm/DiagramAI/actions/runs/44686223811) và [Pages 44686238528](https://github.com/tux1cm/DiagramAI/actions/runs/44686238528) **SUCCESS**.
- Live **6/6 PASS** trên site thật `https://tux1cm.github.io/DiagramAI/`, đủ 3 viewport: P2/P3 và centered Ctrl-resize, health Neon với browser CORS/preflight; P4 autosave tiếng Việt/reload, PDF font nhúng và **offline reload sau service worker ready**. Evidence `pages-offline.png`, `pages-export.pdf`.

## Nghiệm thu và giới hạn

- Hướng dẫn thử: [`p4-usage.md`](p4-usage.md). Chủ dự án cần thử luồng công việc của mình và chốt P4 trước khi chuyển P5.
- Local không thay backup: xóa browser/app data, private session hoặc lỗi ổ đĩa vẫn có thể mất dữ liệu. Offline chỉ bảo đảm khi cache đã tải thành công và còn trên máy; không hứa cứu pointer/text draft chưa commit khi OS kill/mất điện.
- File handle chỉ giữ trong editor đang mở; SVG dùng font hệ thống/fallback, PNG/PDF dùng Noto Sans. PDF một trang fit có thể nhỏ chữ ở sơ đồ lớn. Chưa có cloud sync, AI hay cam kết import draw.io/Visio.
