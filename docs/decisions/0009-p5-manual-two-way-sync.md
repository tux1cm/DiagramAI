# ADR 0009 — Đồng bộ hai chiều thủ công và Desktop thoát có kiểm soát

Ngày 2026-11-25, theo điều chỉnh của chủ dự án sau nghiệm thu Kho/chia sẻ.

- Web và Desktop đều tạo Project/bản vẽ trong cùng kho; không có nền tảng nguồn cố định.
- Bỏ cloud timer, focus/online listeners và tự gửi sau tạo Project/bản vẽ. Giữ debounce lưu local, immutable outbox, CAS, ACK durable và giữ hai nhánh xung đột. Mở link mới, tạo kho, chia sẻ là thao tác cloud chủ động; restart share đã nhớ dùng cache local.
- Nút Đồng bộ ở header, Cập nhật kho ngay và Đồng bộ ngay đều xử lý toàn kho: publish Project/bản vẽ chờ gửi, tải catalog, nhập bản mới và đồng bộ nội dung. Lỗi một tài nguyên không chặn thử những tài nguyên độc lập khác. Có lỗi/pending/conflict thì không báo hoàn tất.
- Sửa điểm nối catalog: trước đây lỗi publish một bản local làm return trước khi tải catalog, có thể thấy Project nhưng không thấy bản mới từ máy kia. Nay vẫn nhận catalog/bản độc lập, giữ lỗi và pending của bản bị chặn. Đây là lỗi tái hiện được; không khẳng định là nguyên nhân duy nhất của ảnh người dùng.
- Desktop chặn yêu cầu đóng cửa sổ, blur để kết thúc draft, khóa editor, lưu local rồi thử đồng bộ mọi scope/bản liên kết. Chỉ tự thoát sau thành công. Thất bại hỏi hủy/thoát chưa đồng bộ, không xóa hàng đợi hoặc tự giải quyết xung đột. Lỗi lưu local cảnh báo riêng.
- Web không thể bảo đảm await network trong unload hoặc đóng cửa sổ ẩn danh. Cảnh báo khi còn thay đổi chưa lưu/gửi, hướng dẫn Đồng bộ trước khi đóng; không dùng beacon thiếu bearer hoặc đánh dấu ACK giả.
- Trạng thái header là toàn kho và lần đồng bộ gần nhất; không dùng trạng thái của một bản đang mở để khẳng định toàn kho đã cập nhật. Thiết bị nhận cũng cần bấm Đồng bộ để nhận thay đổi mới.
- Không thay API/schema, quota, quyền share, dữ liệu cũ, Neon project hoặc billing; không làm P6/AI.
