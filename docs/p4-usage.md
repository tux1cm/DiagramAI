# Dùng P4: lưu local và file

## Lưu và mở lại

Mở Web hoặc Desktop vào canvas, không cần đăng nhập. Sau mỗi chỉnh sửa đã kết thúc, đợi trạng thái **Đã lưu trên máy**. Kéo/sửa chữ chưa xác nhận vẫn là bản nháp; Enter xác nhận, Esc hủy. Web lưu theo browser profile; Desktop lưu SQLite riêng trong app data. Hai kho **không tự đồng bộ**.

Nút **Sơ đồ** mở danh sách để tạo, mở, đổi tên, nhân đôi hoặc xóa. Xóa có xác nhận và xóa cả checkpoint của sơ đồ; file đã xuất ngoài ổ đĩa không bị xóa. Undo/Redo chỉ tồn tại trong phiên editor, không phục hồi lịch sử sau restart.

## Dự phòng và chuyển máy

- **Lưu file / Ctrl+S**: chọn nơi lưu `.diagramai`; lần sau trong cùng editor ghi lại file đã cấp quyền.
- **Ctrl+Shift+S / Lưu thành file mới**: chọn một file khác.
- **Mở file**: validate rồi nhập thành dự án local. Nếu ID đã tồn tại, tạo bản nhập mới, không ghi đè sơ đồ cũ hoặc file nguồn.
- **Tải xuống .diagramai** trong bảng Sơ đồ: fallback trình duyệt. Thông báo bắt đầu tải **không chứng minh file đã ghi xong**; kiểm tra Downloads/thư mục tải xuống.

Autosave chỉ ghi kho local, không tự ghi lại file ngoài ổ đĩa. Nên giữ `.diagramai` dự phòng trước khi xóa site data, đổi browser profile, dùng private mode hoặc gỡ dữ liệu ứng dụng. SVG/PNG/PDF là bản xem/in, không thay `.diagramai` để sửa tiếp.

## Khi có lỗi hoặc xung đột

Không đóng trang/app vội. Bản đang vẽ vẫn nằm trong bộ nhớ:

1. Xuất `.diagramai` dự phòng bằng Lưu file hoặc Tải xuống.
2. Có thể **Thử lưu local lại** sau khi sửa quyền/dung lượng, hoặc **Lưu thành sơ đồ mới** để giữ nhánh hiện tại.
3. Nếu tab khác đã ghi bản mới, không cố ghi đè. Chỉ chọn **Tải lại bản trên máy** sau khi đã dự phòng và xác nhận bỏ thay đổi trong bộ nhớ.

Bảng Sơ đồ giữ tối đa 20 checkpoint. Khôi phục tạo bản lưu mới; không chỉnh file ngoài ổ đĩa. Nếu primary lỗi, app thử mở checkpoint trong bộ nhớ và hiện cảnh báo, không tự thay bản hỏng.

## Xuất và offline

Nút **Xuất SVG** mở chọn SVG/PNG/PDF. Xuất cả sơ đồ, không phụ thuộc pan/zoom/selection. PNG có tỷ lệ 1×/2×/3× và giới hạn kích thước; SVG/PNG có nền trong suốt. PDF fit một trang A4, nhúng Noto Sans tiếng Việt; sơ đồ lớn có thể nhỏ chữ.

Web production tự cài static shell cache khi trình duyệt hỗ trợ service worker. Cần truy cập online và đợi tải assets hoàn tất trước khi thử offline; offline không được bảo đảm ở lần truy cập đầu hoặc sau khi cache bị thu hồi. Bản mới không force reload giữa phiên vẽ. Cloud/AI chưa bật ở P4.
