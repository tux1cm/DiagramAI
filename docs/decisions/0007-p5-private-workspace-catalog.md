# ADR 0007 — Một kho riêng, Dự án → Bản vẽ, link thay ghép từng bản

Ngày 2026-11-23. Điều chỉnh P5 theo yêu cầu chủ dự án, không phải P6.

## Trải nghiệm đã chốt

- Nút **Quản lý dự án** ở rail trái; danh sách **Dự án → Bản vẽ** dùng chung Web/Desktop.
- Thanh trên hiện **Tên dự án / Tên bản vẽ**, trạng thái local và cloud riêng.
- Tạo dự án/bản vẽ ở một nền tảng, nền tảng kia tự phát hiện trong cùng kho. Mở → sửa → tự lưu và đồng bộ; không bật Cloud/ghép mã từng bản.
- Không đăng nhập. Một **link riêng cấp quyền toàn kho**; không công khai quyền sửa trên URL Pages. Desktop dán link lần đầu rồi nhớ; Web mở link rồi nhớ trong trình duyệt.

## Quyền và protocol

- Workspace UUID + capability random 256 bit, hash có domain separation trong Neon. Không có endpoint liệt kê mọi workspace. Người có link có toàn quyền kho; link không chứa database credentials và không nhúng vào public bundle.
- Capability ở URL fragment, tiêu thụ và xóa bằng `history.replaceState` khi boot hoặc nhận hashchange. Không gửi key trong query/referrer/request URL, không log; API dùng bearer header, no-store, không cookies/redirect.
- Client tạo/persist ID+key trước request provisioning; server create retry cùng ID/key trả cùng kho. Drawing create có operation UUID bền vững; response mất vẫn retry cùng drawing, không cấp thêm quyền/nhân bản.
- Catalog metadata không chứa snapshot hay token. Server giữ folders và memberships riêng; ràng buộc workspace/folder/diagram IDs, không ghép theo tên. Access bằng link trả snapshot+capability cho drawing trong kho đó, không đọc diagram ngoài kho.
- Một principal drawing dùng chung cho kho, token dẫn xuất HMAC từ workspace capability + drawing UUID. Không sinh device record cho mỗi tick/lần mở. Quyền link là quyền chung, không quảng cáo thu hồi riêng từng thiết bị trong chế độ workspace; thiết bị P5 cũ giữ quyền cũ khi được đưa vào kho.
- Snapshot CAS, immutable outbox, receipt/idempotency, local conflict copies tiếp tục dùng P5 hiện có, không đổi format `.diagramai`.

## Local và chuyển tiếp

- Workspace header/generation/memberships ở settings, capability ở credential store riêng (IndexedDB) hoặc DPAPI per-user (Windows). CAS generation chống tab cũ ghi đè header; token không vào document/checkpoint/outbox.
- Mở kho ở máy khác giữ nguyên các local drawings có trước, không tự đẩy chúng hoặc gộp tên trùng. Có nút đưa bản đang mở vào dự án; bản mới/import/copy sau khi kết nối tự vào dự án đang chọn. Conflict copies giữ local, không tự đưa ngược lên cloud.
- Migration 003 chỉ thêm bảng mới, không tự sửa dữ liệu P5 cũ. Đưa diagram cũ vào kho cần owner capability, giữ snapshot/revision/credential cũ; không tự unlink hoặc bỏ pending edits.
- Remote imports dùng UUID local dẫn xuất theo workspace/diagram; kiểm tra link/collision, không đè bản local khác và không nhân bản sau crash/tab đua.
- Tạo kho/dự án/bản vẽ offline giữ header/capability/local record trước, lần online sau tiếp tục. Không báo uploaded/synced trước ACK; published chỉ là membership đã có trên server, khác trạng thái snapshot đã đồng bộ.

## Kiểm thử và phát hành

Chỉ chạy tính năng workspace và chỗ nối với P5/local persistence; regression toàn bộ để P7. Dev trước production, backup trước migration, giữ Neon project/repository và billing hiện có. Không phát hành test installer dùng loopback API cho công việc thật.
