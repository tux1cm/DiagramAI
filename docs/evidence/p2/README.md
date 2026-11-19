# Bằng chứng P2

Ngày kiểm tra: 2026-11-19. Báo cáo và giới hạn: [`../../p2-status.md`](../../p2-status.md).

- `web-1366.png`, `web-1920.png`, `web-1280.png`: editor so với mockup cùng viewport; `web-*-visual-metrics.json` ghi geometry và pixel comparison ngoài masks công khai trong test helper.
- `web-twenty-nodes.png`: thêm đủ registry General + text, 20 UUID nodes, Undo/Redo.
- `web-inline-labels.png`: chữ Việt nhiều dòng và sửa nhãn cạnh.
- `web-resize-live-connector.png`: resize rồi Redo, cạnh giữ ID/port. Test còn kiểm tra live geometry trước pointer-up và Undo về đúng SVG path ban đầu.
- `webview2-*.png`, `webview2-*-metrics.json`: bản cài Desktop thật, 3 viewport sau khi fit camera; inline label/properties và Neon health có ảnh riêng.
- `build.txt`, `release-manifest.json`: log build thành công và hash bộ cài local; không đưa EXE hoặc credentials vào Git.
- `live-*-pages-p2.png`, `live-*-pages-properties.png`, `live-*-pages-neon-health.png`: site Pages thật sau deployment commit `de6a3eb`, cả 3 viewport, gồm probe PostgreSQL/CORS.

Ảnh là bằng chứng giao diện, không tự chứng minh lưu file, AI hoặc sync. Trạng thái chưa lưu được giữ rõ; file/persistence thuộc P4.
