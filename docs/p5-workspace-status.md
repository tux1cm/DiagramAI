# P5 điều chỉnh — Kho riêng chung Web/Desktop

Ngày 2026-11-23. Theo xác nhận chủ dự án: **một kho, Dự án → Bản vẽ, link riêng thay ghép từng bản**. Chưa làm P6/AI.

Trạng thái: API production đã cập nhật, đang chốt installer/Pages mới thay bản P5 per-diagram. Không tạo lại Neon project hoặc đổi billing.

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

## Còn trước khi chốt

- Build cuối production API và xác minh bản cài qua managed API thật.
- CI focused, Pages/live P5 workspace, thu evidence và hướng dẫn mới; không chạy full P0–P4.

Thiết kế/quyền và chuyển tiếp: [ADR 0007](decisions/0007-p5-private-workspace-catalog.md). Bằng chứng P5 per-diagram trước điều chỉnh: [p5-status.md](p5-status.md).
