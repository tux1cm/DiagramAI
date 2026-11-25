# P5 — Kho dạng thẻ, chia sẻ sửa theo Project/bản vẽ

Ngày 2026-11-25. Điều chỉnh theo xác nhận của chủ dự án, không phải P6.

Trạng thái: source/dev đã kiểm tra; đang chốt Desktop và phát hành.

- Kho nằm trong vùng giữa, không popup. Thẻ Project → thẻ bản vẽ → editor; nút Chia sẻ trên từng thẻ. Không tách quyền xem/sửa hoặc yêu cầu login.
- Link Project được danh sách/chỉnh sửa các bản của Project, kể cả bản thêm sau. Link bản vẽ chỉ mở/sửa một bản. API kiểm tra scope, không trả workspace key/ID hoặc owner/recovery token. Drawing grants là editor, không quyền quản trị.
- Link kho riêng giữ ở mục Kết nối thiết bị của tôi, không thay link chia sẻ. Capability random 256-bit ở fragment, dùng bearer/no-store khi gọi API, key lưu riêng IndexedDB/DPAPI; không vào document/checkpoint/outbox.
- Catalog cache + context ID cho offline/reload/native restart. Kho riêng của người nhận không bị đổi hoặc tự nhận bản vẽ chia sẻ vào kho đó.
- Migration additive 004, không sửa dữ liệu cũ. Retry tạo share cùng ID/key không đổi scope hoặc tạo thêm principal cho mỗi lần mở.
- **31 unit/boundary PASS**, **19 integration PASS trên Neon dev**, gồm sửa qua link, chặn sibling/cross-Project, chặn nâng lên workspace/admin, retry và giữ dữ liệu cũ.
- **3 Web cases PASS** qua các lượt kiểm tra tập trung: thẻ không modal và scoped editing/offline; discovery/nhớ kho; offline/reload/outbox/conflict. Đã sửa race khi một lần connect muộn kéo người dùng về trang Project sau khi họ đã chọn Project.
- Dev managed API smoke **PASS**: create/catalog/access/edit, Project/drawing shares và từ chối sibling; đã xóa fixture của test.
- **2 Rust workspace/share CAS/DPAPI tests PASS**; test installer **1/1 PASS** (41,9 giây testcase), có dán link Project trên Desktop, giới hạn danh sách, restart bằng WebView profile mới và kiểm tra không plaintext key trong SQLite/file vault.
- API production migration 004/deploy và smoke **PASS**, fixture đã xóa. Backup encrypted export đã kiểm tra restore và so dữ liệu hiện tại: `verified-export-sha256:915c17da83f947953ce58fb022ed8a42f940c43d260f75aa6b10e1167baac75c`. Không xóa snapshot cũ hoặc đổi billing.
- Đã sửa bug bộ đếm tạo kho/sơ đồ: cùng một daily bucket trước đó bị charge hai lần với hai limit khác nhau. Nay một request/retry = một charge; creation budget rõ ràng **20 request/ngày, 5/phút**, giữ nguyên storage/project/workspace caps và không reset counter đã tiêu. Catalog/share polling dùng cap 30.000/ngày như pull. Có integration test kiểm tra số charge, limit và counter không bị reset.

Chưa tính build hoặc testcase bị ngắt là PASS. Full regression để P7; không thay Neon project/repository/billing. Thiết kế: [ADR 0008](decisions/0008-p5-project-drawing-edit-links.md).
