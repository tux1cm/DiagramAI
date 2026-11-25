# P5 — Kho riêng chung Web ↔ Desktop

## Chỉ dùng một link kho chính

- **Bạn:** dùng cùng **link kho chính** trên Web/Desktop. App nhớ quyền sau lần mở đầu; không cần tài khoản, mã quản trị, ghép từng bản vẽ hoặc tạo kho riêng trên từng máy.
- Web có dữ liệu: **Kho → Link kho chính của tôi → Hiện link kho chính**. Mở link này trên Web khác hoặc dán vào **Mở kho chính** trên Desktop. Nếu Desktop đang nhớ kho khác, dán trong **Link kho chính của tôi → Mở link kho chính khác**, xác nhận giữ kho cũ → **Dùng link kho chính này**.
- Mở link trực tiếp trên Web đang nhớ kho khác sẽ hiện xác nhận dùng link vừa mở; không tự thay kho hoặc yêu cầu dán lại. Mã kho cho biết hai bên có đang dùng đúng cùng kho hay không.
- **Người nhận:** chỉ gửi link từ **Chia sẻ** trên thẻ Project/bản vẽ. Họ mở trực tiếp và chỉ quản lý nội dung trong phạm vi link. Không gửi link kho chính cho người nhận; ai có link kho chính sẽ có quyền toàn kho.
- App không còn nút tạo kho riêng trên mỗi thiết bị. Chưa có link thì vẫn giữ/sửa local; không tự đọc dữ liệu toàn kho từ Neon.

## Đồng bộ thủ công hai chiều (điều chỉnh 2026-11-25)

- Cả Web và Desktop tạo được Project/bản vẽ trong cùng kho. Tạo/sửa ở máy A → **Đồng bộ** để gửi → máy B bấm **Đồng bộ** để nhận. Nút này xử lý danh sách Project, bản vẽ mới và nội dung toàn kho, không chỉ bản đang mở. **Cập nhật kho ngay** và **Đồng bộ ngay** dùng cùng luồng.
- Tự lưu local vẫn bật. Không tự gửi/nhận cloud theo từng lần sửa, bộ hẹn giờ 15 giây, focus hay online. Project/bản vẽ mới giữ cờ chờ gửi cho đến khi có ACK; một lần gửi lỗi không chặn nhận các bản khác.
- Desktop: bấm đóng cửa sổ sẽ lưu local, thử đồng bộ hết rồi thoát. Nếu mất mạng/thiếu quyền/xung đột, app hỏi có thoát khi chưa đồng bộ hay không; không xóa hàng đợi. Nếu local chưa lưu được có cảnh báo riêng.
- Web: bấm Đồng bộ trước khi đóng tab. Trình duyệt không bảo đảm chờ request async lúc đóng; app cảnh báo khi còn thay đổi chưa gửi. Không tuyên bố đã đồng bộ chỉ vì tab đóng. Dữ liệu của cửa sổ ẩn danh có thể mất khi đóng toàn bộ cửa sổ ẩn danh, kể cả bản local đã lưu.
- Mở link mới và Chia sẻ là thao tác cloud chủ động. Mở lại kho/share đã nhớ chỉ đọc cache local; muốn cập nhật cloud bấm Đồng bộ. Không đổi phạm vi quyền link.

## Web có bản vẽ nhưng Desktop chỉ thấy Project trùng tên

Tên Project không phải mã kho. Trong Kho có **Mã kho đang mở**: Web/Desktop phải cùng mã, không chỉ cùng tên “SNP”. Nếu đã tạo hai kho riêng:

1. Trên **Web có bản vẽ**, bấm Đồng bộ; vào **Kho → Link kho chính của tôi → Hiện link kho chính**, sao chép link.
2. Trên **Desktop**, vào **Kho → Link kho chính của tôi**, dán vào **Mở link kho chính khác**.
3. Tích xác nhận giữ kho cũ và mọi bản local → **Dùng link kho chính này**. Chỉ đổi sau khi xác minh được quyền kho đích; catalog cũ được lưu cùng transaction trước khi thay kho đang mở. Không xóa bản vẽ, liên kết, hàng đợi hay key cũ.
4. Kiểm tra mã kho hai bên giống nhau. Kho cũ nằm ở **Kho cũ được giữ**; có thể xác nhận và mở lại. Nội dung/hàng đợi kho cũ không tự gửi sang kho Web, không tự gộp theo tên; muốn đưa bản cũ vào kho khác cần xử lý quyền riêng, không lách editor thành owner.

**Không gửi link riêng vào chat hoặc ảnh. Không xóa dữ liệu ứng dụng để đổi kho.**

## Kho và chia sẻ Project/bản vẽ

- Bấm **Kho** ở rail trái hoặc thanh trên: vùng giữa hiện các thẻ Project, không popup. Mở Project để thấy các thẻ bản vẽ; mở bản vẽ để vào editor. Thanh trên hiện **Project / Tên bản vẽ**.
- Bấm **Chia sẻ** trên thẻ Project để tạo link xem/sửa mọi bản vẽ thuộc Project đó (kể cả bản thêm sau), không thấy Project khác.
- Bấm **Chia sẻ** trên thẻ bản vẽ để tạo link chỉ xem/sửa bản đó, không thấy bản khác. Không chọn quyền và không đăng nhập. Ai có link đều chỉnh sửa được trong phạm vi link.
- Web: mở link trực tiếp. Desktop: **Kho → Mở link Project / bản vẽ**, dán link và mở. App nhớ context/capability sau reload/restart; có cache local khi offline.
- Link giới hạn không thay kho riêng của người nhận và không tự đưa nội dung nhận qua share vào kho của họ. Link không cấp quản trị kho/thiết bị hoặc recovery.
- **Link kho chính của tôi → Hiện link kho chính** là quyền toàn kho dành cho chủ. Không dùng link này để thay link Chia sẻ trên thẻ.

## Cách dùng mới: một kho, không ghép từng bản

1. Mở **Kho** (nút ở rail trái hoặc thanh trên). Dùng link kho chính đã có, không tạo kho khác theo từng thiết bị.
2. Chọn **Link kho chính của tôi → Hiện link kho chính**, sao lưu toàn bộ link vào nơi riêng tư. **Ai có link có quyền truy cập toàn bộ kho**; không gửi link vào chat hoặc đăng công khai. Link không chứa mật khẩu Neon.
3. Trên Web, mở link đó; trên Desktop chưa có kho, dán vào **Kho → Mở kho chính**. Chỉ làm lần đầu, thiết bị/trình duyệt sẽ nhớ kho. Không ghép mã cho từng bản vẽ.
4. Trong Kho, chọn **Project → Bản vẽ → Mở**. Thanh trên hiện **Tên Project / Tên bản vẽ**. Sửa như bình thường; local tự lưu, cloud chỉ gửi/nhận khi bấm **Đồng bộ** hoặc Desktop thoát có kiểm soát.
5. Tạo Project/bản vẽ mới ở bên nào cũng được: bấm **Đồng bộ** bên nguồn để gửi, rồi bên nhận để cập nhật. Không còn poll tự động.

### Dữ liệu cũ và offline

- Khi mở một kho trên máy khác, các bản local đã có trên máy đó **giữ riêng**, không bị đè hay tự gộp vào kho. Mở chúng từ **File / Bản vẽ chỉ trên máy / Checkpoint**; muốn đưa vào kho thì mở bản đó, chọn dự án và bấm **Đưa bản đang mở vào dự án này**.
- Bản mới/import/copy sau khi đã mở kho tự vào dự án đang chọn. Nhánh xung đột giữ local riêng, không tự đẩy lại cloud.
- Offline vẫn tạo/sửa và lưu local. Có mạng thì bấm Đồng bộ để tiếp tục gửi hàng đợi; không xóa site/app data khi còn dữ liệu chưa dự phòng.
- Link kho là quyền chung, không phải tài khoản hoặc quyền từng thiết bị. Mất link và mất mọi thiết bị còn nhớ kho thì không có email để khôi phục. Không để link trong file `.diagramai`.
- Liên kết P5 cũ chỉ có quyền editor cần được đưa vào kho từ thiết bị owner; không tự thay quyền, bỏ pending edits hay nhân bản để lách quyền.

### Backup quản trị

Migration kho chung đã giữ nguyên sơ đồ P5 cũ. Neon Free đầy snapshot nên không xóa snapshot cũ hoặc nâng gói: bản export ứng dụng được mã hóa DPAPI, kiểm tra phục hồi trên schema dev (rollback), kiểm tra độ mới và đối chiếu dữ liệu production trước khi chấp nhận làm backup cho migration. Đây không phải cơ chế bỏ qua backup.

Mặc định script deploy vẫn yêu cầu snapshot. Phương án export phải chọn rõ `--production --verified-export <file.json.dpapi>`; sai branch, quá một giờ, không giải mã được, restore không đạt hoặc dữ liệu đã đổi thì dừng trước migration. Backup hiện ở `%LOCALAPPDATA%/Temp/opencode/diagramai-backups/`, cần lưu sang kho bền vững; chưa có lịch backup tự động.

<details>
<summary>Tham khảo liên kết P5 từng sơ đồ cũ và vận hành backup</summary>

Phần dưới giữ hướng dẫn tương thích dữ liệu P5 cũ; không phải luồng bắt đầu của kho chung mới.

## Bắt đầu

1. Trên máy nguồn, mở sơ đồ → **Cloud** → đồng ý tải nội dung lên → **Bật đồng bộ cho dự án này**.
2. Sao chép **toàn bộ mã khôi phục** vào trình quản lý mật khẩu/nơi riêng tư, rồi xác nhận đã sao lưu. Mã chỉ hiện một lần, không có trong `.diagramai`.
3. Chọn **Tạo mã liên kết**. Trên máy đích, mở Cloud, nhập mã một lần và bấm **Liên kết dự án**. Không cần tài khoản; máy đích có sơ đồ local mới, không đè sơ đồ đang mở.
4. Sửa ở Desktop, chờ **Đã lưu trên máy** rồi bấm **Đồng bộ**; sang Web bấm **Đồng bộ** để nhận. Có thể sửa tiếp và đồng bộ ngược về Desktop.

## Ý nghĩa trạng thái

- **Đã lưu trên máy**: đã ghi IndexedDB (Web) hoặc SQLite (Desktop), không có nghĩa đã lên cloud.
- **Chờ đồng bộ / Offline**: bản local và hàng đợi vẫn còn. Giữ dữ liệu ứng dụng, mở lại khi có mạng rồi đồng bộ.
- **Đã đồng bộ**: server đã xác nhận revision và acknowledgement đã được ghi local.
- **Xung đột**: không tự ghép/ghi đè. Cloud lưu remote snapshot và tạo bản local riêng trước khi báo lỗi. Có thể xuất cả hai, chọn cloud và giữ local riêng, hoặc mở nhánh local thành dự án khác.

App không kiểm tra cloud theo timer/focus/online. Trạng thái lần đồng bộ gần nhất không có nghĩa đã nhận những chỉnh sửa mới trên thiết bị khác; bấm Đồng bộ để cập nhật. Không phải cộng tác realtime; chưa có AI/P6.

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
