# P5 — Đồng bộ Web ↔ Desktop không đăng nhập

> **Đã chốt điều chỉnh sang một kho chung, Dự án → Bản vẽ và link riêng**, thay onboarding ghép từng sơ đồ. Tiến độ bản mới: [`p5-workspace-status.md`](p5-workspace-status.md). Nội dung dưới đây giữ bằng chứng bản P5 per-diagram trước điều chỉnh.

Trạng thái: **P5 đã triển khai, bật production/Pages và đạt kiểm thử tập trung; chờ chủ dự án nghiệm thu**. P4 đã được chốt. Không làm AI/P6 trong bước này.

## Phạm vi và cách kiểm thử đã chốt

Theo yêu cầu mới của chủ dự án (2026-11-23), trong từng P chỉ chạy **test tính năng mới và chỗ nối với P trước**; phần cũ bị sửa trực tiếp thì kiểm tra đúng phần ảnh hưởng. Bộ hồi quy toàn dự án dành cho cuối P7. CI/build đã chuyển sang tập P5 mặc định; full regression chỉ qua lựa chọn manual `full_regression`, Desktop qua `test:desktop:full`.

## Đã triển khai và kiểm chứng

- Protocol/client/coordinator chung trong `packages/sync-core`: snapshot hash, CAS revision, outbox bất biến khi đang gửi, backoff có giới hạn, không báo synced trước khi ghi acknowledgement local thành công.
- Backend private project, device token/recovery hash, mã ghép 10 ký tự / 5 phút / một lần, revoke, recovery, retention, global storage budget và atomic rate buckets. API mặc định `SYNC_ENABLED=false`; giữ nguyên health P0.
- Migration additive trong namespace `diagramai_sync`, kiểm thử trên `p5-sync-dev` của **project Neon hiện có** trước production. Production đã migration/deploy P5 sau backup snapshot **`snap-patient-glitter-b3fzsbss`** (source branch xác minh đúng `br-noisy-waterfall-b37wduo3`, 31.744.000 bytes). Không tạo Neon project mới hoặc đổi billing.
- **10 integration tests PASS trên Neon dev**: private/cross-project, CAS đồng thời/idempotency, pairing một lần/expiry/revoke, recovery, retention, checksum/storage cap, atomic rate limits, UUID chữ hoa từ file P4, owner cloud deletion và rollback down-migrations. Expiry dùng thời gian Postgres.
- **22 unit tests P5 + điểm nối P4→P5 PASS**: HTTP/CORS/size/secret-safe errors, browser fetch receiver, coordinator durable ACK/offline/conflict, IndexedDB upgrade v1→v2, atomic local+outbox, restart pending, cloud/local ID mapping, conflict copies, unlink và editor rehydration an toàn.
- Rust: **2 sync tests + 1 DPAPI test PASS**. SQLite startup được serialize để tránh đua WAL/schema khi local và cloud cùng đọc. Token chỉ nằm trong file DPAPI per-user; SQLite giữ reference, không có plaintext fallback.
- Web: **3/3 UI tests PASS** qua fixture API và Neon dev thật: đồng bộ hai chiều, offline/reload/outbox, giữ hai nhánh conflict, pairing một lần/revoke/recovery.
- Desktop: **1/1 test bản cài thật PASS** sau sửa startup SQLite (38,4 giây testcase; 56 giây cả harness): Desktop SQLite/DPAPI ↔ Web IndexedDB, restart với WebView profile mới nhưng giữ SQLite/outbox, tiếp tục đồng bộ và giữ conflict local. Evidence: `test-results/desktop-p5/`, `playwright-report/desktop-p5/`.
- Build cuối dùng production API **PASS**, installer **3.877.408 bytes**, SHA-256 `688a20ab15450190b061e5b5868ee789df56b83010ba847c3e93a580cd809b42`, manifest **`testBuild=false`**. Đầu ra `File/Desktop_Light/DiagramAI_Setup_x64.exe`, `File/Web/`; bản test loopback cũ được lưu trong `File/Previous/`.
- Dev managed Function đã deploy thành công tại origin hiện có `br-soft-surf-b3hws0gm-health`. Smoke API thật PASS (CORS/private create-pull/pair/CAS/idempotency/revoke/recovery, fixture đã xóa); **1/1 managed Web UI test PASS**, đồng bộ hai chiều giữa hai browser qua HTTPS Neon, gồm CSP/CORS thật.
- Production managed API smoke cũng **PASS**, fixture đã xóa. Neon vẫn `free_v3`: project usage quan sát trước deploy khoảng 2.558 compute seconds và 646.882 bytes transfer; không thay billing, không thay compute settings.
- **1/1 production native test PASS trên artifact cuối** (21,3 giây testcase; 29,5 giây harness), gồm installer cài/gỡ cách ly, Desktop ↔ Web qua HTTPS production, offline/restart/outbox và conflict. Screenshot/manifest/harness tại [`evidence/p5/`](evidence/p5/). Đã chỉnh các mô tả cũ “chỉ trong bộ nhớ/chưa đồng bộ” để không mâu thuẫn trạng thái local/Cloud.
- Export schema ứng dụng độc lập đã tạo và mở lại/giải mã xác minh SHA-256 **PASS** bằng `scripts/backup-sync-database.mjs`, ngoài repo trong thư mục backup quản trị temp được phép, mã hóa DPAPI CurrentUser. **Restore test PASS** bằng `scripts/verify-sync-backup.mjs`: tạo schema cách ly trên dev, apply migrations đáng tin cậy, nạp lại mọi bảng với constraints, kiểm tra counts rồi rollback toàn bộ. Export chụp lúc 0 project production sau cleanup nên không chứng minh phục hồi sơ đồ người dùng có dữ liệu; không phải dump toàn DB. Chưa có lịch backup tự động.
- Implementation đã push **`57820dd`**. CI focused [45117072302](https://github.com/tux1cm/DiagramAI/actions/runs/45117072302) và Pages [45117079005](https://github.com/tux1cm/DiagramAI/actions/runs/45117079005) **SUCCESS**, không chạy full regression P0–P4.
- **1/1 live Pages P5 test PASS** (19,5 giây testcase): hai browser dùng URL public thật, Web → Neon production → Web → sửa ngược lại; fixture đã xóa.

## Giới hạn và bước nghiệm thu

- Chủ dự án thử: Desktop bật Cloud → sao lưu mã khôi phục → ghép Web → sửa hai chiều. Không tự chuyển P6 trước nghiệm thu.
- Chưa có lịch backup độc lập tự động hoặc dump toàn DB (máy build không có `pg_dump`); đã có snapshot, export ứng dụng mã hóa và dev restore test. Backup export hiện ở thư mục temp quản trị, cần được chủ máy lưu sang kho bền vững. Hướng dẫn: [`p5-usage.md`](p5-usage.md).
- Không phải cộng tác realtime/CRDT; polling khi app visible, cần kết nối để nhận server ACK. File backup và local saving vẫn độc lập. Không hứa recovery khi mất toàn bộ token và mã khôi phục.
- Full regression toàn dự án để cuối P7 theo yêu cầu; chỉ các test mới/điểm nối P4→P5 đã chạy. Không commit secrets hoặc sơ đồ cá nhân.
