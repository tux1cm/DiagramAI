# ADR 0011 — Gom metadata link, không rút bớt khóa bí mật

Ngày 2026-11-26. Theo yêu cầu rút gọn link kho chính và Project/bản vẽ.

- Link mới `#/w/<mã>` dành cho kho chính; `#/s/<mã>` cho scope Project/bản vẽ. Mã gồm UUID mã hóa base64url 22 ký tự và nguyên 43 ký tự khóa, tổng 65, không có separator/tiền tố kỹ thuật dài.
- Trên URL GitHub Pages hiện tại: main link 144 → 104 ký tự; share link 136 → 104. Không hứa link 5–6 ký tự hoặc làm yếu khóa 256-bit để ngắn hơn. Không dùng URL shortener bên ngoài, không đưa quyền chỉnh sửa vào query/path hoặc gửi tới bên thứ ba.
- Codec chạy local/offline. Giữ nguyên từng ký tự key, kể cả khóa legacy có base64 tail không canonical; decode/re-encode khóa có thể đổi hash credential nên không làm vậy. UUID phải canonical và qua schema trước khi dùng; sai loại link/độ dài/alphabet/trailing data bị từ chối.
- Link dài đã gửi và context `#/share/<id>` không có secret vẫn tương thích. Tạo/copy mới ra dạng gọn. Cần app Web/Desktop mới để mở dạng mới; không rotate hoặc đổi quyền link cũ.
- Hooks nhận cả route cũ/mới, xóa secret khỏi URL trước request. API bearer, hash credential, cache/DPAPI/outbox và scope enforcement không đổi. Không migration/API deploy hoặc tra cứu link qua server.
