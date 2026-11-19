# ADR 0004 — P3 atomic insertion, rendered-path hit testing và snapping

Ngày: 2026-11-19. Chủ dự án đã xác nhận P2 OK và yêu cầu P3. Không mở rộng sang persistence/AI/sync.

1. `insert_node_on_edge` là domain command có edgeId, nodeData, position, entry/exit ports và hai UUID cạnh mới. Command validate toàn bộ graph; endpoint, node đã có cạnh, node trong nhóm, dữ liệu stale, ID trùng hoặc vượt cap bị từ chối nguyên batch.
2. Kéo hình tồn tại chỉ publish draft geometry; `finishInteraction(commands, label)` validate và commit draft + split vào cùng một history entry. Undo phục hồi cả vị trí hình trước kéo lẫn cạnh cũ. Transaction log replay được, không sinh lại UUID khi Redo.
3. Mỗi cạnh mới kế thừa kind/style và hai marker của cạnh cũ (kể cả hai chiều). Nhãn giữ ở A→C, C→B rỗng; UI nhắc người dùng kiểm tra nhãn điều kiện. Endpoints/ports ngoài vẫn giữ nguyên; ports của C suy ra từ tiếp tuyến cạnh tại điểm chèn.
4. Hit-test dùng chính `SVGPathElement` đang render, sampling + projection và `getScreenCTM`, tolerance **12 CSS pixels** độc lập pan/zoom. Bỏ qua 14px đầu/cuối cạnh. Nếu hai cạnh gần ngang nhau (chênh <2px), không tự chọn thay người dùng. Không hit chỉ bằng bbox.
5. Hình đang kéo không làm router tránh chính nó, nếu không cạnh sẽ chạy trốn khỏi điểm chèn. Các cạnh liên quan vẫn bám đúng geometry. Chèn hình rời đơn; đa chọn/nhóm/hình có cạnh chỉ di chuyển, không tự rewire.
6. Snap-grid 10 world units và alignment tâm/cạnh có guideline; tolerance alignment 6 CSS pixels, ưu tiên alignment trước grid. Cả nhóm dịch cùng offset; không đổi khoảng cách tương đối. Tắt checkbox hiện có sẽ tắt cả snap/guideline, không tắt insertion. Viewport/guideline/highlight không ghi vào JSON/history.
7. Routing orthogonal giữ hướng neo, thử các lane tránh bbox có padding 8 world units. Search bounded 48 vật cản gần nhất để sinh lane, kiểm tra collision với toàn bộ node; fallback giữ route gốc và kết nối, không làm mất cạnh. Không tuyên bố router tối ưu/toàn năng, không auto-layout toàn sơ đồ, không có waypoint editing mới.
8. Zoom hỗ trợ nhập chính xác bằng nhấp đúp phần trăm hiện có (20–300%), không đổi giao diện bình thường; dùng kiểm chứng 50/100/200% thật thay vì làm tròn nút +/-.
9. Esc/pointercancel/window blur hủy draft đang kéo và xóa cues; không commit insertion sau cancel. Click không di chuyển không kích hoạt insertion.

Giới hạn: bbox avoidance không phải outline routing hoàn hảo cho mọi shape; sơ đồ quá chật vẫn cần người dùng giãn node hoặc đổi neo. Chèn chỉ căn tâm C tại điểm trên cạnh, không tự dồn toàn sơ đồ. Lưu/mở file thật và khôi phục sau đóng/reload vẫn thuộc P4.
