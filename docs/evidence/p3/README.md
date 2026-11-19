# Bằng chứng P3

Ngày 2026-11-19. Chi tiết và giới hạn: [`../../p3-status.md`](../../p3-status.md).

- `web-insert-*.png`: chèn diamond vào 4 loại cạnh, nhãn “Có” chỉ giữ một lần, marker hai chiều trên các hop, Undo/Redo giữ UUID.
- `web-guideline.png`: live snap tâm/cạnh, highlight và điểm chèn khi chuột còn giữ; không phải trạng thái lưu.
- `web-routing-blocker.png`: orthogonal detour quanh một blocker, giữ edge ID.
- `web-1366/1920/1280.png`, `web-*-visual-metrics.json`: hồi quy trực tiếp với mockup gốc cùng viewport, không sửa reference hoặc thêm masks mới.
- `webview2-p3-preview.png`, `webview2-p3-insert.png`: thao tác chèn thật trong app đã cài. Test còn chèn hình tồn tại rồi Undo về vị trí trước kéo.
- `webview2-*.png`, `webview2-*-metrics.json`: native visual 3 viewport sau fit cùng camera. Các ảnh P2 controls/API giữ phần hồi quy.
- `build.txt`, `release-manifest.json`: log Windows build thành công và hash bộ cài P3; không commit EXE hoặc secrets.

Ảnh chỉ là bằng chứng giao diện; assertions trong `tests/e2e/p3.spec.ts` kiểm tra graph/UUID/endpoints/label/history và cả trước pointer-up. Không có lưu file, sync hoặc AI ở P3.
