# P5 — Kho riêng chung Web ↔ Desktop

## Cách dùng mới: một kho, không ghép từng bản

1. Mở **Quản lý** (nút ở rail trái hoặc thanh trên). Trên máy có bản vẽ muốn dùng làm nguồn, chọn **Tạo kho riêng và đưa bản vẽ trên máy vào kho**. Các bản hiện có vào **Dự án đầu tiên**, không gộp theo tên.
2. Chọn **Hiện link riêng của kho**, sao lưu toàn bộ link vào nơi riêng tư. **Ai có link có quyền truy cập toàn bộ kho**; không gửi link vào chat hoặc đăng công khai. Link không chứa mật khẩu Neon.
3. Trên Web, mở link đó; trên Desktop, dán link vào **Quản lý → Đã có kho? Dán link riêng → Mở kho bằng link riêng**. Chỉ làm lần đầu, thiết bị/trình duyệt sẽ nhớ kho. Không ghép mã cho từng bản vẽ.
4. Trong Quản lý, chọn **Dự án → Bản vẽ → Mở**. Thanh trên hiện **Tên dự án / Tên bản vẽ**. Sửa như bình thường; local và cloud tự lưu, chỉ báo **Đã đồng bộ** sau server ACK.
5. Tạo dự án/bản vẽ mới ở bên nào cũng tự xuất hiện bên kia khi có mạng (poll khoảng 15 giây khi app đang mở; có nút **Cập nhật kho ngay**).

### Dữ liệu cũ và offline

- Khi mở một kho trên máy khác, các bản local đã có trên máy đó **giữ riêng**, không bị đè hay tự gộp vào kho. Mở chúng từ **File / Bản vẽ chỉ trên máy / Checkpoint**; muốn đưa vào kho thì mở bản đó, chọn dự án và bấm **Đưa bản đang mở vào dự án này**.
- Bản mới/import/copy sau khi đã mở kho tự vào dự án đang chọn. Nhánh xung đột giữ local riêng, không tự đẩy lại cloud.
- Offline vẫn tạo/sửa và lưu local. Có mạng thì tiếp tục gửi hàng đợi; không xóa site/app data khi còn dữ liệu chưa dự phòng.
- Link kho là quyền chung, không phải tài khoản hoặc quyền từng thiết bị. Mất link và mất mọi thiết bị còn nhớ kho thì không có email để khôi phục. Không để link trong file `.diagramai`.
- Liên kết P5 cũ chỉ có quyền editor cần được đưa vào kho từ thiết bị owner; không tự thay quyền, bỏ pending edits hay nhân bản để lách quyền.

<details>
<summary>Tham khảo liên kết P5 từng sơ đồ cũ và vận hành backup</summary>

Phần dưới giữ hướng dẫn tương thích dữ liệu P5 cũ; không phải luồng bắt đầu của kho chung mới.

## Bắt đầu

1. Trên máy nguồn, mở sơ đồ → **Cloud** → đồng ý tải nội dung lên → **Bật đồng bộ cho dự án này**.
2. Sao chép **toàn bộ mã khôi phục** vào trình quản lý mật khẩu/nơi riêng tư, rồi xác nhận đã sao lưu. Mã chỉ hiện một lần, không có trong `.diagramai`.
3. Chọn **Tạo mã liên kết**. Trên máy đích, mở Cloud, nhập mã một lần và bấm **Liên kết dự án**. Không cần tài khoản; máy đích có sơ đồ local mới, không đè sơ đồ đang mở.
4. Sửa ở Desktop, chờ **Đã lưu trên máy** và **Đã đồng bộ**; sang Web bấm **Đồng bộ ngay**. Có thể sửa tiếp và đồng bộ ngược về Desktop.

## Ý nghĩa trạng thái

- **Đã lưu trên máy**: đã ghi IndexedDB (Web) hoặc SQLite (Desktop), không có nghĩa đã lên cloud.
- **Chờ đồng bộ / Offline**: bản local và hàng đợi vẫn còn. Giữ dữ liệu ứng dụng, mở lại khi có mạng rồi đồng bộ.
- **Đã đồng bộ**: server đã xác nhận revision và acknowledgement đã được ghi local.
- **Xung đột**: không tự ghép/ghi đè. Cloud lưu remote snapshot và tạo bản local riêng trước khi báo lỗi. Có thể xuất cả hai, chọn cloud và giữ local riêng, hoặc mở nhánh local thành dự án khác.

App kiểm tra cloud khoảng 15 giây khi đang mở/visible, khi focus hoặc có mạng lại. Không phải cộng tác realtime; chưa có AI/P6.

## Quyền và dự phòng

- Mã ghép dùng một lần, hết hạn sau 5 phút, cấp quyền sửa. Không đưa mã hoặc mã khôi phục cho người lạ. ID dự án không cấp quyền đọc.
- Chủ dự án có thể **Xem thiết bị đã ghép → Thu hồi quyền**. Thiết bị bị thu hồi vẫn giữ bản local nhưng không đọc/đẩy cloud nữa.
- Mất máy nguồn: dán đầy đủ chuỗi khôi phục trong Cloud. Có thể chọn thu hồi tất cả thiết bị cũ nếu mất máy/token.
- Mất mọi thiết bị và mất mã khôi phục: không có email/tài khoản để lấy lại quyền.
- **Ngắt liên kết** hoặc xóa sơ đồ local không xóa cloud. **Xóa dự án trên cloud** là thao tác riêng của chủ dự án, có xác nhận, không thể khôi phục bằng mã cũ; bản local trên các máy vẫn còn.
- Nên xuất `.diagramai` định kỳ. Xóa site data/private browsing có thể mất dữ liệu và quyền chưa dự phòng. Windows giữ token bằng DPAPI theo tài khoản Windows, không chuyển quyền bằng cách chép SQLite.

## Giới hạn preview và vận hành

- Mặc định: 20 dự án cloud, 128 MiB snapshot storage, 30 snapshot gần nhất, 10 thiết bị active/100 bản ghi thiết bị, 10.000 operation receipts mỗi dự án. Có rate phút/ngày và cap upload 128 MiB/ngày; chạm giới hạn thì giữ local, không tự nâng gói.
- API `/v1/health` giữ nguyên. Đồng bộ chỉ bật khi server có secret và `SYNC_ENABLED=true`. Secrets không vào Web bundle.
- Backup trước migration production P5: Neon snapshot `snap-patient-glitter-b3fzsbss`. Không chạy down migration trên dữ liệu thật khi chưa sao lưu/xác định backend tương thích. Down migrations chạy ngược thứ tự 002 → 001, là thao tác quản trị phá hủy dữ liệu sync, không phải nút undo người dùng.
- Vận hành tiếp: kiểm tra usage Neon và storage budget định kỳ; tạo backup trước migration, đồng thời lên lịch `pg_dump --format=custom` bằng kết nối quản trị từ biến môi trường, mã hóa/lưu ngoài Neon, kiểm tra restore trên nhánh dev. Snapshot nhà cung cấp không thay thế backup độc lập định kỳ. Máy build hiện chưa có `pg_dump`; chưa cấu hình lịch backup tự động.
- Export độc lập dữ liệu schema ứng dụng bằng `node scripts/backup-sync-database.mjs blue-mode-25353507 br-noisy-waterfall-b37wduo3`. File được mã hóa **DPAPI CurrentUser** ngoài repo tại `%LOCALAPPDATA%/Temp/opencode/diagramai-backups/`, gồm dữ liệu `diagramai_sync` + up migrations; script mở lại/giải mã và xác minh SHA-256. Đây không phải dump toàn DB. Chỉ tài khoản Windows hiện tại giải mã được; cần chuyển bản dự phòng vào kho quản trị bền vững, không xóa thư mục temp trước khi làm việc đó. Không tự upload backup hoặc keys.
- Kiểm tra restore an toàn: `node scripts/verify-sync-backup.mjs <file.json.dpapi> blue-mode-25353507 br-soft-surf-b3hws0gm`. Script từ chối production; tạo schema dev ngẫu nhiên trong transaction, đối chiếu migrations với nguồn tin cậy, nạp mọi bảng theo constraints/kiểm tra counts rồi rollback, không thay dữ liệu hiện có. Không tự restore đè dữ liệu production.
- Chỉ test P5 và điểm nối P4→P5 trong giai đoạn này. Full regression để cuối P7, không tự bắt đầu P6.

</details>
