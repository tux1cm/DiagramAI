# P5 — Đồng bộ Web ↔ Desktop không đăng nhập

Trạng thái: **đang triển khai**, chưa nghiệm thu hoặc bật đồng bộ trên bản public. P4 đã được chủ dự án chốt. Không làm AI/P6 trong bước này.

## Phạm vi và cách kiểm thử đã chốt

Theo yêu cầu mới của chủ dự án (2026-11-23), trong từng P chỉ chạy **test tính năng mới và chỗ nối với P trước**; phần cũ bị sửa trực tiếp thì kiểm tra đúng phần ảnh hưởng. Bộ hồi quy toàn dự án dành cho cuối P7. CI/build đã chuyển sang tập P5 mặc định; full regression chỉ qua lựa chọn manual `full_regression`, Desktop qua `test:desktop:full`.

## Đã có trong working tree, chưa phát hành

- Protocol/client/coordinator chung trong `packages/sync-core`: snapshot hash, CAS revision, outbox bất biến khi đang gửi, backoff có giới hạn, không báo synced trước khi ghi acknowledgement local thành công.
- Backend private project, device token/recovery hash, mã ghép 10 ký tự / 5 phút / một lần, revoke, recovery, retention, global storage budget và atomic rate buckets. API mặc định `SYNC_ENABLED=false`; giữ nguyên health P0.
- Migration additive trong namespace `diagramai_sync`, kiểm thử trên `p5-sync-dev` của **project Neon hiện có** trước production. Production đã migration/deploy P5 sau backup snapshot **`snap-patient-glitter-b3fzsbss`** (source branch xác minh đúng `br-noisy-waterfall-b37wduo3`, 31.744.000 bytes). Không tạo Neon project mới hoặc đổi billing.
- **10 integration tests PASS trên Neon dev**: private/cross-project, CAS đồng thời/idempotency, pairing một lần/expiry/revoke, recovery, retention, checksum/storage cap, atomic rate limits, UUID chữ hoa từ file P4, owner cloud deletion và rollback down-migrations. Expiry dùng thời gian Postgres.
- **22 unit tests P5 + điểm nối P4→P5 PASS**: HTTP/CORS/size/secret-safe errors, browser fetch receiver, coordinator durable ACK/offline/conflict, IndexedDB upgrade v1→v2, atomic local+outbox, restart pending, cloud/local ID mapping, conflict copies, unlink và editor rehydration an toàn.
- Rust: **2 sync tests + 1 DPAPI test PASS**. SQLite startup được serialize để tránh đua WAL/schema khi local và cloud cùng đọc. Token chỉ nằm trong file DPAPI per-user; SQLite giữ reference, không có plaintext fallback.
- Web: **3/3 UI tests PASS** qua fixture API và Neon dev thật: đồng bộ hai chiều, offline/reload/outbox, giữ hai nhánh conflict, pairing một lần/revoke/recovery.
- Desktop: **1/1 test bản cài thật PASS** sau sửa startup SQLite (38,4 giây testcase; 56 giây cả harness): Desktop SQLite/DPAPI ↔ Web IndexedDB, restart với WebView profile mới nhưng giữ SQLite/outbox, tiếp tục đồng bộ và giữ conflict local. Evidence: `test-results/desktop-p5/`, `playwright-report/desktop-p5/`.
- Build cuối dùng production API **PASS**, installer **3.878.286 bytes**, SHA-256 `84850149cbbc6c20dbd1a7748119b4a3974f584445d2f569874a02f6bc258aa7`, manifest **`testBuild=false`**. Đầu ra `File/Desktop_Light/DiagramAI_Setup_x64.exe`, `File/Web/`; bản test loopback cũ được lưu trong `File/Previous/`.
- Dev managed Function đã deploy thành công tại origin hiện có `br-soft-surf-b3hws0gm-health`. Smoke API thật PASS (CORS/private create-pull/pair/CAS/idempotency/revoke/recovery, fixture đã xóa); **1/1 managed Web UI test PASS**, đồng bộ hai chiều giữa hai browser qua HTTPS Neon, gồm CSP/CORS thật.
- Production managed API smoke cũng **PASS**, fixture đã xóa. Neon vẫn `free_v3`: project usage quan sát trước deploy khoảng 2.558 compute seconds và 646.882 bytes transfer; không thay billing, không thay compute settings.
- **1/1 production native test PASS** (19,3 giây testcase; 26,5 giây harness), gồm installer cài/gỡ cách ly, Desktop ↔ Web qua HTTPS production, offline/restart/outbox và conflict. Screenshot/manifest/harness tại [`evidence/p5/`](evidence/p5/). Đã chỉnh các mô tả cũ “chỉ trong bộ nhớ/chưa đồng bộ” để không mâu thuẫn trạng thái local/Cloud; đang thu lại artifact cuối từ nguồn này.
- Export schema ứng dụng độc lập đã tạo và mở lại/giải mã xác minh SHA-256 **PASS** bằng `scripts/backup-sync-database.mjs`, ngoài repo trong thư mục backup quản trị temp được phép, mã hóa DPAPI CurrentUser. Export chụp lúc 0 project production sau cleanup; không phải dump toàn DB hay test restore Postgres. Chưa có lịch backup tự động.

## Còn trước khi bật public/chốt P5

- Xác minh bản cài cuối qua production managed API sau backup/deploy; không chạy lại toàn bộ P0–P4. Cấu hình env Neon CLI đã sửa thành chuỗi có kiểm tra bắt buộc.
- Build bản cuối production API, test đúng luồng P5 trên installer/Pages thật và xác minh CI/Pages. Backup độc lập định kỳ chưa tự động hóa (máy build không có `pg_dump`); hướng dẫn vận hành trong `p5-usage.md`.
- Cập nhật thông báo P4/P5, tài liệu và evidence; không commit tokens, mã ghép/khôi phục thật, DB URL hay snapshot cá nhân.
