# ADR 0006 — P5 capabilities, snapshot CAS và durable outbox

Ngày: 2026-11-23. Trạng thái: đang triển khai, chưa bật production.

## Quyết định

- Không tài khoản, không dự án công khai. Mỗi project có device capabilities riêng: token random 256-bit, hash có domain separation ở Postgres. Recovery key riêng cũng chỉ giữ hash, hiển thị một lần khi tạo và không lưu cùng document. Project ID không phải bằng chứng quyền truy cập.
- Mã ghép 10 ký tự (50 bit), sống 5 phút theo **thời gian Postgres**, redeem bằng transaction một lần. Rate buckets atomic/global + identity hash; chưa xác minh contract IP của Neon thì dùng bucket chung, không tin `X-Forwarded-For` do caller tự khai báo.
- Mỗi project có revision tăng, snapshot/hash và operation receipts. Push kiểm tra auth/revoke, lock project và CAS revision trong transaction. Retry cùng operation/body trả lại receipt, không sinh revision mới; reuse operation ID với nội dung khác bị từ chối. Snapshot giữ 30 bản gần nhất; receipt giữ đến hard cap 10.000 để retry bản đã prune vẫn an toàn.
- Snapshot tối đa 2 MiB, giới hạn domain 500 nodes/1.000 edges; dùng global storage accounting row và project count cùng transaction. Bản preview mặc định 20 cloud projects, 128 MiB snapshot storage; upload bytes và số request có daily hard caps, ngoài rate phút. Không giả định Neon Free vô hạn hoặc tự đổi billing.
- `LocalSyncJournal` dùng chung cho IndexedDB/SQLite. Read → validate/hash ngoài transaction → commit CAS theo **local document version + sync generation**. Document, checkpoint, link và outbox cùng commit, không có khoảng trống mất pending sau crash.
- Outbox đang gửi là bất biến: edits mới vẫn ghi document local, không đổi operation/body đang bay. Sau ACK server, commit local base/hash và tạo operation kế tiếp cho document mới hơn trong cùng transaction. Chỉ sau ACK **và ghi local thành công** mới hiển thị synced.
- Join cloud luôn tạo local document ID mới. Link lưu cloud document ID riêng; hash/push chuyển về canonical cloud ID, pull chuyển lại local ID. Không đè sơ đồ local trùng ID khi nhập/ghép từ thiết bị khác.
- Remote apply chỉ khi editor không có edits/draft/pending; host khóa tương tác rất ngắn trong transaction local và rehydrate editor. Nếu có divergent state, transaction lưu conflict copy độc lập + remote snapshot trước khi báo conflict. Chọn cloud luôn tạo bản local mới trong cùng transaction trước khi thay primary, kể cả copy đã hiển thị trước đó bị xóa ở tab khác.
- Không auto-merge. Người dùng dùng cloud/giữ local thành dự án riêng hoặc xuất cả hai. Unlink/xóa local không xóa cloud. Owner có thể xóa cloud với xác nhận riêng; local trên máy khác không bị xóa, token cũ bị từ chối.
- Web credential nằm ở IndexedDB riêng, không vào `.diagramai`, checkpoint hoặc outbox. Web production CSP chỉ cho scripts tự host và connect đúng API origin; không cache API trong PWA. XSS vẫn là rủi ro cần phòng ngừa, không hứa token Web bất khả xâm phạm.
- Windows dùng **per-user DPAPI**: SQLite chỉ lưu reference; ciphertext nằm trong app data. Không dùng machine-wide DPAPI, không fallback plain text, profile test cũng phải được bảo vệ. Ghi vault trước SQL để thất bại CAS chỉ có thể để lại orphan đã mã hóa, không thể làm mất token đã cấp quyền hoặc tạo link saved giả.
- API luôn `no-store`, bearer ở header; không token/recovery trong URL. Client cấm redirect/cookies và kiểm tra project/hash/receipt, bounded response size/timeouts. Errors không serialize database exceptions hoặc secrets. Creation secret trả một lần: nếu mất response, không tự cấp lại plaintext/retry tạo project mới âm thầm.
- Tick debounce sau local save, polling khoảng 15 giây khi visible, focus/online và nút Sync now. Một tick/operation trong flight, retry/backoff có giới hạn; nút Sync now được xếp sau tick đang chạy để không bỏ qua yêu cầu fresh pull.

## Triển khai và kiểm chứng

- Migration additive trong namespace riêng, ledger/checksum. Chỉ dev branch của Neon project hiện có được phép nhận test fixtures; script từ chối primary/default/protected/production. CI dùng Postgres localhost ephemeral, không tạo Neon project thay thế.
- `SYNC_ENABLED=false` mặc định và secret server bắt buộc. Không deploy production trước khi dev API/native/Web flow đạt và có backup.
- Theo yêu cầu chủ dự án, P5 chỉ chạy test mới + giao diện nối P4 persistence. CI/build mặc định cùng scope; full regression để cuối P7 hoặc khi có yêu cầu tường minh.
