# ADR 0010 — Một link kho chính, các link chia sẻ giới hạn phạm vi

Ngày 2026-11-25. Chủ dự án đã chọn **link kho chính**, không thêm tài khoản hoặc mã quản trị.

- Chủ dùng cùng một link kho chính trên Web và Desktop. Quyền được lưu IndexedDB/DPAPI sau lần mở đầu; mở lại dùng kho đã nhớ, không tạo kho riêng theo thiết bị.
- Gỡ nút tạo kho riêng khỏi giao diện ứng dụng. Root chưa có quyền chỉ mời mở link kho chính hoặc dùng local. API tạo workspace vẫn là primitive có capability để provision/fixture, không tự cấp quyền vào kho đã tồn tại.
- Link kho chính là bearer capability toàn kho, dành riêng cho chủ. Không nhúng link/key vào bundle Web, không lấy khóa từ DB, không đưa vào Git/chat và không biến kho chủ thành public global.
- Mở link kho chính khi máy đang nhớ kho khác: xóa secret khỏi URL ngay, giữ quyền pending trong memory, yêu cầu xác nhận rõ ràng trước khi archive/switch bằng CAS. Không buộc dán lại link vừa mở. Mọi bản local/credential/queue cũ được giữ và có thể quay lại.
- Người nhận chỉ được cấp link Project hoặc bản vẽ từ thẻ. Mở trực tiếp không login/mã; API chỉ cấp editor grant cho các bản trong scope, không cấp quyền kho chính hoặc các Project khác. Đi về trang chính không có owner capability thì không thể liệt kê kho chủ.
- Giữ đồng bộ thủ công hai chiều và thoát Desktop có kiểm soát của ADR 0009. Không đổi API/schema/quota/billing hoặc bắt đầu P6.
