# P5 điều chỉnh — Kho riêng chung Web/Desktop

Ngày 2026-11-23. Theo xác nhận chủ dự án: **một kho, Dự án → Bản vẽ, link riêng thay ghép từng bản**. Chưa làm P6/AI.

Trạng thái: **kho chung đã triển khai trên API production, Pages và installer cuối; chờ chủ dự án nghiệm thu**. Hoàn tất phát hành 2026-11-25 sau lần server restart. Không tạo lại Neon project hoặc đổi billing.

## Đã có

- Quản lý ở rail trái; tạo/chọn dự án, tạo/mở bản vẽ; thanh trên hiển thị **Tên dự án / Tên bản vẽ**.
- Workspace capability 256-bit ở fragment; xóa khỏi URL khi mở/nhận hashchange; API bearer/no-store, hash key server, không nhúng secret vào public build.
- Header/catalog/membership lưu bền vững với generation CAS. Web credential store riêng; Windows DPAPI, không plaintext fallback. Persist capability trước khi provision kho, retry create giữ nguyên IDs.
- Migration additive `003_workspaces`, không đổi/xóa dữ liệu cũ; adoption có kiểm tra owner, giữ nguyên revision/credentials cũ. Các bản trùng tên không gộp.
- Auto-discovery dự án/bản vẽ mới ở bên kia, dùng lại journal/CAS/outbox/conflict P5. Remote imports deduplicate theo UUID, không thay local record trùng ID. Local có trước ở máy mới giữ riêng; imports/copies mới tự vào dự án đang chọn, conflict copies không tự upload lại.
- **29 unit/boundary tests PASS**, **15 real-Neon integration tests PASS**. Bao gồm private catalog, cross-workspace denial, retry không nhân bản/cấp thêm devices, adoption không đổi snapshot, quota cleanup, offline provisioning và create ACK mất rồi có edit mới.
- **2/2 Web workspace tests PASS**: cùng kho không pairing, tạo project/drawing thấy bên kia, sửa hai chiều, giữ local có trước, nhớ link sau reload, không key trong request URLs, offline/reload/new drawing/resume, giữ cả hai nhánh conflict.
- **1 Rust workspace CAS/DPAPI test PASS**. Dev managed API smoke PASS; fixture workspace/drawing đã xóa.
- **1/1 Desktop workspace test PASS**: catalog discovery hai chiều, DPAPI, restart dùng profile WebView mới, offline/outbox và conflict; 46,9 giây testcase. Bài bị ngắt do server restart không được tính PASS; chỉ chạy lại bài bị ngắt, không chạy regression tổng thể.
- Production migration 003 và managed API smoke **PASS**. Neon Free đã đầy snapshot nên không xóa snapshot cũ/đổi billing. Dùng export DPAPI mới của production (1 project), mở lại/kiểm tra SHA-256, restore có constraints trên schema dev rồi rollback, đối chiếu dữ liệu quan trọng hiện tại với export trước migration. Backup receipt: `verified-export-sha256:59a1219c69dc7b277f6e190bdd69d4482927839c6f91162652d005ad071ad2ef`.
- Build cuối **PASS**, installer **3.893.738 bytes**, SHA-256 `b3833636681229339e75d7de3d20b9d19dcadf0780ce10c46a8f3082b34fbb3a`, **testBuild=false**, dùng HTTPS production. Đầu ra: `File/Desktop_Light/DiagramAI_Setup_x64.exe`; `File/Web/`. Bản cũ được giữ nguyên ở `File/Previous/`.
- **1/1 native production workspace test PASS trên installer cuối** (22,1 giây testcase; 29,1 giây harness), gồm cài/gỡ riêng, Desktop ↔ Web, tự thấy project/drawing mới, DPAPI/restart, offline/outbox và giữ conflict. Evidence: [`evidence/p5-workspace/`](evidence/p5-workspace/).
- Implementation **`985adb3`** đã push. CI focused [45517829988](https://github.com/tux1cm/DiagramAI/actions/runs/45517829988) và Pages [45517841201](https://github.com/tux1cm/DiagramAI/actions/runs/45517841201) **SUCCESS**; không chạy regression toàn P0–P4.
- **1/1 live Pages workspace test PASS** (14,4 giây testcase), chạy URL public thật qua Neon production: link riêng, catalog discovery, sửa hai chiều, dự án/bản vẽ mới từ bên kia; chỉ xóa fixture của test, không sửa dữ liệu người dùng.

## Nghiệm thu và giới hạn

- Chủ dự án dùng Quản lý tạo kho từ máy nguồn, sao lưu link riêng rồi mở cùng kho trên Web/Desktop. Không gửi link riêng vào chat.
- Link là quyền chung toàn kho, không phải tài khoản; chưa có thu hồi riêng từng máy trong chế độ workspace. Không tự đổi kho đã nhớ hoặc bỏ hàng đợi chưa gửi. Các sơ đồ P5 cũ giữ liên kết và dữ liệu cũ.
- Không cộng tác realtime/CRDT; cập nhật khi app visible, focus/online hoặc thao tác thủ công, vẫn có quota preview. Không pull snapshot cho bản nền không đổi chỉ để lặp poll.
- Backup độc lập đang ở thư mục temp quản trị DPAPI, chưa có lịch tự động; cần chủ máy lưu sang kho bền vững. Full regression để cuối P7; không bắt đầu P6.

Thiết kế/quyền và chuyển tiếp: [ADR 0007](decisions/0007-p5-private-workspace-catalog.md). Bằng chứng P5 per-diagram trước điều chỉnh: [p5-status.md](p5-status.md).
