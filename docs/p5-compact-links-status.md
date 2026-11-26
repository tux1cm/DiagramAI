# P5 — Link gọn, giữ nguyên phạm vi và khóa

Ngày 2026-11-26. **Đã phát hành chung link gọn và sửa đầu mũi tên trên Web/Desktop.** Source lint/typecheck và **42 unit/boundary P5 PASS**, cộng **37 arrow/export tests PASS**.

- Main/share URL trên Pages còn **104 ký tự**, thay vì 144/136; một mã 65 ký tự trong fragment, không UUID/prefix dài hiển thị riêng. Textarea kết quả gọn một dòng.
- Không bỏ bit khóa, không đổi capability hoặc scope; main chỉ dành cho chủ, link Project/bản vẽ chỉ cấp đúng scope. Không dùng dịch vụ rút gọn ngoài hoặc thêm lookup request.
- Link dài cũ vẫn mở được, cache/context và quyền đã nhớ không đổi. Unit test round-trip key ngẫu nhiên 256-bit, legacy non-canonical tail, canonical UUID, sai route/độ dài/alphabet/trailing data và URL query.
- Web cases kiểm tra main link và Project link gọn, đồng thời mở bookmark main/drawing dạng cũ. Không đổi Neon/schema/billing hoặc làm P6.
- Web dev **5/5 PASS**, 2,9 phút: mở main/Project link gọn, bookmark dài cũ, đổi kho có xác nhận, nhớ sau restart, giới hạn scope, offline và conflict. Không thêm request để tra link.
- Source `1db2ef9`: CI [45726964438](https://github.com/tux1cm/DiagramAI/actions/runs/45726964438) và Pages [45726975886](https://github.com/tux1cm/DiagramAI/actions/runs/45726975886) **SUCCESS**, gồm test scope/API và arrow Web 3 kích thước. Installer cuối gộp cả sửa mũi tên và link gọn: **3.935.160 bytes**, `testBuild=false`, SHA-256 `03671de1c74eac3d0804073bb7d4be6a327bc55236873a7aa4f9bbf5986031c7`; receipt trong `evidence/p5-compact-links/`.
- **Native production sync/share 1/1 PASS**, 40,3 giây testcase / 47,8 giây harness: main/share link gọn, Desktop ↔ Web/API thật, giới hạn scope, DPAPI/restart, offline/conflict và gửi khi thoát; chỉ fixture của test được xóa.
- **Native arrows 1/1 PASS trên cùng installer cuối**, 3,9 giây testcase / 5,0 giây harness. Payload bản vẽ giữ nguyên sau chọn đường nối, đầu tên bám mép và có 14px thẳng trước tip, không request cloud.
- **Live public arrows 3/3 PASS** ở 1280/1366/1920px trên Pages mới, tổng 4,531 giây: nhập fixture local, đo điểm cuối/marker/selection, không gọi cloud và không sử dụng kho của chủ. Lượt CLI đầu không chạy được picker vì Unicode qua pipe PowerShell; dùng escape Unicode trong selector rồi kiểm tra đầy đủ, không thay app hoặc điều kiện assert.
- Đầu ra: `File/Desktop_Light/DiagramAI_Setup_x64.exe`, `File/Web/`; bản trước giữ trong `File/Previous/`. Không rotate hoặc tự thay key/link của chủ; link dài cũ và dữ liệu cũ tiếp tục dùng.

Thiết kế: [ADR 0011](decisions/0011-p5-compact-capability-links.md).
