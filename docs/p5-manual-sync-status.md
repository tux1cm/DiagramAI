# P5 — Đồng bộ thủ công hai chiều

Ngày 2026-11-25. Trạng thái: đồng bộ thủ công source/Web và CI/Pages PASS; đang chốt thêm đổi kho an toàn theo lựa chọn dùng kho Web của chủ dự án và kiểm tra installer cuối.

- Cả Web và Desktop tạo Project/bản vẽ, gửi/nhận qua nút Đồng bộ toàn kho. Không còn cloud timer/focus/online hoặc tự gửi khi tạo; local tự lưu như cũ.
- Sửa điểm nghẽn publish local lỗi làm chặn discovery bản mới. Vẫn hiện lỗi/chờ gửi, không báo đồng bộ hết khi chưa ACK hoặc có xung đột.
- Desktop thử lưu + đồng bộ hết trước khi đóng; thất bại hỏi và giữ hàng đợi. Web cảnh báo chưa gửi, không hứa network hoàn tất lúc đóng tab/ẩn danh.
- `npm run check:p5`: lint/typecheck và **35 unit/boundary PASS**, gồm tạo hai chiều, không gửi trước nút, nhận bản mới dù publish bản khác lỗi, bảo toàn hàng đợi khi sync/thoát thất bại, đổi/khôi phục kho và giữ local/key/pending cũ. **3 Rust workspace/share/archive CAS/DPAPI PASS**.
- Web trên Neon dev: **5 scenario PASS qua các lượt kiểm tra tập trung**. Bốn case đồng bộ thủ công/scope/discovery/offline/conflict PASS; case đổi kho + giữ local + khôi phục kho cũ PASS riêng 25,4 giây testcase / 46,7 giây harness. Case thủ công xác nhận **không có request cloud trong 16 giây** qua timer cũ/focus/online, local autosave và cảnh báo beforeunload. Đã sửa việc handler đổi kho kết thúc muộn kéo người dùng về root sau khi họ đã chọn Project; không skip/nới timeout.
- Không đổi API/schema/quota/billing; không cần migration/deploy API. Bản production trước vẫn được giữ trong `File/Previous/` khi thu thập build mới.
- Read-only diagnostic production: có **hai workspace khác nhau** cùng chứa Project SNP, tổng cộng một bản vẽ publish. Chủ đã chọn **kho Web làm kho chung**, không xóa/gộp dữ liệu cũ. Thêm mã kho không bí mật và thao tác đổi kho có xác nhận, archive catalog cũ bằng CAS transaction, giữ DPAPI/IndexedDB credential và mọi bản local/outbox; mở lại archive khi cần.
- Bản đồng bộ thủ công `0def08a`: CI [45559703709](https://github.com/tux1cm/DiagramAI/actions/runs/45559703709) và Pages [45559729867](https://github.com/tux1cm/DiagramAI/actions/runs/45559729867) **SUCCESS**. Lượt installer production đầu dừng ở bước Web mở kho nguồn trả 401; helper chưa kiểm chứng provisioning ACK trước khi lấy link, không tính PASS. Đã thêm chờ/sync rõ ràng trước khi trả link; app không hiện link kho chưa provision ACK. Cần lượt installer cuối xác minh.

Thiết kế: [ADR 0009](decisions/0009-p5-manual-two-way-sync.md). Hướng dẫn: [p5-usage.md](p5-usage.md).
