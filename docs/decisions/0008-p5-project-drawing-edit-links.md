# ADR 0008 — Kho dạng thẻ và link sửa theo Project/bản vẽ

Ngày 2026-11-25. Điều chỉnh P5 theo xác nhận của chủ dự án; không làm P6.

- Kho là trang trong vùng canvas giữa, không modal: tất cả thẻ Project → thẻ bản vẽ của Project → editor. Bên trái giữ thư viện hình; thanh trên vẫn hiện Project / tên bản vẽ khi chỉnh sửa.
- Mỗi thẻ Project/bản vẽ có nút Chia sẻ riêng. Không chọn quyền: ai có link đều xem và sửa được tài nguyên trong phạm vi link đó.
- Link Project cho phép danh sách và chỉnh sửa mọi bản vẽ thuộc Project, gồm bản thêm sau; không cấp quyền sang Project khác. Link bản vẽ chỉ cấp đúng một bản, không liệt kê/mở sibling.
- Link kho riêng vẫn là quyền toàn kho để chủ dùng giữa các thiết bị; đưa vào mục Kết nối thiết bị của tôi, không dùng thay link chia sẻ theo thẻ.
- Migration additive 004 lưu scope + hash capability 256-bit. Quyền được kiểm tra ở API, không chỉ lọc UI. Share access trả editor capability riêng cho từng drawing, không trả key/ID workspace hoặc owner/recovery token. Không được đổi scope khi retry cùng share ID.
- Client persist share key riêng trước tạo link, retry cùng ID/key; lưu ngoài document/checkpoint/outbox, IndexedDB credential store hoặc DPAPI per-user. Cache catalog giới hạn và ID context để mở lại offline/native restart; token không nằm trong cache catalog.
- Link nằm trong fragment, tiêu thụ/xóa key khỏi URL trước request; chỉ share ID không bí mật được giữ trong hash để reload. Không key trong request URL/cookies/referrer.
- Mở share không ghi đè kho của người nhận, không tự upload các drawing nhận qua share vào kho riêng của họ. API scope không cấp tạo/xóa Project, quản lý thiết bị hoặc recovery; thao tác chỉnh node/edge/text/title vẫn dùng CAS/outbox/conflict P5.
- Không có tài khoản hoặc màn hình quyền xem/sửa. Không thêm realtime/CRDT hay thay dữ liệu cũ. Chỉ test tính năng mới và chỗ nối với P5 hiện có; full regression để P7.
