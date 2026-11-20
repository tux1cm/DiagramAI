# ADR 0005 — P4 local-first và file độc lập

Ngày: 2026-11-20. Trạng thái: triển khai, đang kiểm chứng release.

## Quyết định

- `packages/local-storage` định nghĩa repository chung; IndexedDB Web, SQLite bundled Desktop. `ProjectSession` điều phối autosave 350 ms, nhiều sơ đồ và checkpoint; domain không phụ thuộc React Flow/Tauri.
- SQLite dùng WAL/FULL và transaction IMMEDIATE; IndexedDB dùng transaction readwrite durability strict. Document và checkpoint ghi cùng transaction, giữ 20 checkpoint. Chỉ transaction hoàn tất mới báo đã lưu local.
- Mỗi ghi có expected version (CAS), operation ID idempotent và SHA-256 payload. Tab cũ không được ghi đè; cho xuất file/fork hoặc xác nhận bỏ thay đổi trước tải lại. Không giả lập sync; bảng outbox/credentials chỉ được dự trữ, chưa chứa token hay pending upload.
- Chỉ persist schema domain. Selection, viewport, Undo/Redo, clipboard và pointer draft không vào JSON. Undo/Redo đã commit vẫn autosave. Khi ghi lỗi, giữ nguyên store trong bộ nhớ; lỗi luôn hiện đến khi xử lý.
- Đọc primary lỗi: thử checkpoint hợp lệ trong bộ nhớ, không ghi đè bản lỗi tự động. Mở/nhập mới phải validate trước khi thay editor; ID đụng nhau thành bản sao mới.
- `.diagramai` UTF-8, giới hạn 2 MB, v1 và migration v0 tường minh. Reject toàn bộ nếu schema/graph sai; không cố sửa một phần hoặc chạy HTML/script từ nội dung.
- File ngoài ổ đĩa không phải autosave target. Desktop mở native dialog ở backend và cấp opaque token theo loại file; không nhận đường dẫn tự do từ frontend. Ghi file tạm cùng thư mục, sync rồi atomic replace. Web ưu tiên File System Access; fallback Blob download chỉ báo bắt đầu tải, không khẳng định đã ghi ổ đĩa.
- SVG dựng từ domain bằng shape/routing chung, không chụp DOM đang zoom/chọn. PNG rasterize SVG với Noto Sans nhúng; PDF vector một trang A4 fit, font Noto Sans nhúng (SIL OFL tại `public/fonts/OFL.txt`). PNG giới hạn 16 triệu pixel để tránh cạn bộ nhớ.
- PWA cache danh sách static shell/chunks/fonts theo hash build và base path. Không runtime-cache API, sơ đồ hoặc credentials; không sửa/xóa IndexedDB. Không skipWaiting/force reload giữa phiên chỉnh sửa. Chỉ hoạt động offline sau khi tải/cài cache thành công; cache trình duyệt vẫn có thể bị thu hồi.
- Desktop chặn close, blur/commit text rồi chờ flush; lỗi phải xác nhận bỏ dữ liệu. Web cảnh báo beforeunload khi pending write, pointer/text draft. Không cam kết cứu mọi thao tác chưa commit khi OS kill/mất điện.

## Hệ quả / giới hạn

- Local Web/Desktop là hai kho riêng. Chuyển dữ liệu bằng `.diagramai`; cloud/AI vẫn P5/P6.
- SQLite triển khai qua custom Tauri commands, không dùng plugin SQL chung để tránh frontend tự thực thi SQL. Rust tối thiểu 1.90 theo plugin-dialog đang khóa phiên bản.
- Autosave local không thay backup file. Xóa browser data, private session, gỡ dữ liệu ứng dụng hoặc lỗi ổ đĩa có thể mất kho local.
- Web file handle chỉ giữ trong editor đang mở, không persist quyền qua restart; Save lần đầu sau chuyển dự án hỏi nơi lưu lại. Import không tự ghi đè file nguồn.
- SVG giữ tên font hệ thống; PNG/PDF dùng Noto Sans bảo đảm tiếng Việt, không cam kết font xuất giống mọi font UI. Sơ đồ lớn fit A4 có thể nhỏ chữ.
