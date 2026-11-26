# P5 — Link gọn, giữ nguyên phạm vi và khóa

Ngày 2026-11-26. Source lint/typecheck và **42 unit/boundary P5 PASS**, cộng **37 arrow/export tests PASS**. Đang chốt Web/native và phát hành chung với bản sửa mũi tên.

- Main/share URL trên Pages còn **104 ký tự**, thay vì 144/136; một mã 65 ký tự trong fragment, không UUID/prefix dài hiển thị riêng. Textarea kết quả gọn một dòng.
- Không bỏ bit khóa, không đổi capability hoặc scope; main chỉ dành cho chủ, link Project/bản vẽ chỉ cấp đúng scope. Không dùng dịch vụ rút gọn ngoài hoặc thêm lookup request.
- Link dài cũ vẫn mở được, cache/context và quyền đã nhớ không đổi. Unit test round-trip key ngẫu nhiên 256-bit, legacy non-canonical tail, canonical UUID, sai route/độ dài/alphabet/trailing data và URL query.
- Web cases kiểm tra main link và Project link gọn, đồng thời mở bookmark main/drawing dạng cũ. Không đổi Neon/schema/billing hoặc làm P6.
- Web dev **5/5 PASS**, 2,9 phút: mở main/Project link gọn, bookmark dài cũ, đổi kho có xác nhận, nhớ sau restart, giới hạn scope, offline và conflict. Không thêm request để tra link.

Thiết kế: [ADR 0011](decisions/0011-p5-compact-capability-links.md).
