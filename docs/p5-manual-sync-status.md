# P5 — Đồng bộ thủ công hai chiều

Ngày 2026-11-25. Trạng thái: source/Web kiểm tra PASS; đang build và kiểm tra installer production.

- Cả Web và Desktop tạo Project/bản vẽ, gửi/nhận qua nút Đồng bộ toàn kho. Không còn cloud timer/focus/online hoặc tự gửi khi tạo; local tự lưu như cũ.
- Sửa điểm nghẽn publish local lỗi làm chặn discovery bản mới. Vẫn hiện lỗi/chờ gửi, không báo đồng bộ hết khi chưa ACK hoặc có xung đột.
- Desktop thử lưu + đồng bộ hết trước khi đóng; thất bại hỏi và giữ hàng đợi. Web cảnh báo chưa gửi, không hứa network hoàn tất lúc đóng tab/ẩn danh.
- `npm run check:p5`: lint/typecheck và **34 unit/boundary PASS**, gồm tạo hai chiều, không gửi trước nút, nhận bản mới dù publish bản khác lỗi và bảo toàn hàng đợi khi sync/thoát thất bại.
- `npm run test:p5:web` trên Neon dev: **4/4 PASS**, 2,3 phút. Case mới kiểm tra tạo/nhận cả hai chiều, **không có request cloud trong 16 giây** qua timer cũ/focus/online, local autosave, cảnh báo beforeunload. Các case scope isolation, discovery, offline/reload và conflict vẫn PASS.
- Không đổi API/schema/quota/billing; không cần migration/deploy API. Bản production trước vẫn được giữ trong `File/Previous/` khi thu thập build mới.

Thiết kế: [ADR 0009](decisions/0009-p5-manual-two-way-sync.md). Hướng dẫn: [p5-usage.md](p5-usage.md).
