# Bằng chứng P3

Ngày 2026-11-19. Chi tiết và giới hạn: [`../../p3-status.md`](../../p3-status.md).

- `web-insert-*.png`: chèn diamond vào 4 loại cạnh, nhãn “Có” chỉ giữ một lần, marker hai chiều trên các hop, Undo/Redo giữ UUID.
- `web-guideline.png`: live snap tâm/cạnh, highlight và điểm chèn khi chuột còn giữ; không phải trạng thái lưu.
- `web-routing-blocker.png`: orthogonal detour quanh một blocker, giữ edge ID.
- `web-1366/1920/1280.png`, `web-*-visual-metrics.json`: hồi quy trực tiếp với mockup gốc cùng viewport, không sửa reference hoặc thêm masks mới.
- `webview2-p3-preview.png`, `webview2-p3-insert.png`: thao tác chèn thật trong app đã cài. Test còn chèn hình tồn tại rồi Undo về vị trí trước kéo.
- `webview2-*.png`, `webview2-*-metrics.json`: native visual 3 viewport sau fit cùng camera. Các ảnh P2 controls/API giữ phần hồi quy.
- `build.txt`, `release-manifest.json`: log Windows build thành công và hash bộ cài P3; không commit EXE hoặc secrets.
- `live-*-pages-p3-insertion.png`: chèn khối trên Pages thật sau deploy `1aa9544`, 3 viewport; test kiểm tra highlight và Undo phục hồi cạnh UUID cũ. `live-*-pages-neon-health.png` giữ probe PostgreSQL/CORS thật.
- `ctrl-drag-preview.png`: Ctrl+kéo trước pointer-up; bản gốc/cạnh vẫn ở chỗ cũ, bản sao mờ chưa được tính vào document/history. Ca kiểm thử còn xác nhận Ctrl+click, hủy, nhóm/clipboard, thả lên cạnh và pan/zoom 50/200%.
- `webview2-ctrl-drag.png`: bản sao sau Ctrl+kéo trong bản cài thật ngày 2026-11-20; test kiểm tra bản gốc không đổi, không copy cạnh ra ngoài và một Undo xóa bản sao. Build log/manifest được cập nhật cho bản bổ sung này.
- `live-*-pages-ctrl-drag.png`: Ctrl+kéo trên Pages thật sau deploy `b53d950`, cả 3 viewport; test kiểm tra số node/cạnh, vị trí nguồn và một Undo.
- `ctrl-corner-resize.png`: Ctrl+kéo nút góc giữ tỷ lệ, không nhân đôi, cạnh vẫn bám hình; assertions kiểm tra trước pointer-up, góc đối diện, font, Undo/Redo. Bộ bổ sung chạy cả bốn góc, giới hạn min và zoom 50/200% trên 3 viewport.
- `webview2-ctrl-corner.png`: resize tỷ lệ thật trong bản cài Windows, không tăng node count và một Undo trả đúng geometry ban đầu. Log/manifest hiện trỏ đến bộ cài có đủ hai cử chỉ Ctrl.
- `live-*-pages-ctrl-corner.png`: Ctrl-corner resize trên Pages thật sau deploy `1c7b24c`, cả 3 viewport; kiểm tra tỷ lệ, không thêm node/cạnh và Undo đúng geometry.
- `ctrl-corner-centered.png`: bản sửa theo phản hồi — thu/phóng **từ tâm cố định**, không khóa góc đối diện như ảnh/bản Ctrl-corner trước đó. Tests mới kiểm tra chính center và hai phía cùng co/giãn.
- `webview2-ctrl-corner-centered.png`: native proof cho cùng bản sửa từ tâm; log/manifest hiện trỏ bộ cài này, ảnh Ctrl-corner cũ giữ làm lịch sử.
- `live-*-pages-ctrl-corner-centered.png`: site thật sau deploy `8f07cfe`, cả 3 viewport, với assertions center trước/sau và Undo. Không dùng ảnh bản góc đối diện cũ làm bằng chứng cho yêu cầu tâm cố định.

Ảnh chỉ là bằng chứng giao diện; assertions trong `tests/e2e/p3.spec.ts` kiểm tra graph/UUID/endpoints/label/history và cả trước pointer-up. Không có lưu file, sync hoặc AI ở P3.
