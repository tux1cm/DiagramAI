# P0 — Neon Functions / PostgreSQL spike

## Trạng thái

Chưa liên kết/deploy vào Neon của người dùng. Không có project ID, branch, invocation URL hay credential. Đây là hướng dẫn và mã chuẩn bị, không phải kết quả live test.

Tài liệu được kiểm tra ngày 18/11/2026: https://neon.com/docs/compute/functions/get-started

- Singapore `aws-ap-southeast-1` nằm trong danh sách hỗ trợ.
- Runtime Node 24, module default export `{ fetch(request) }`.
- `neon.ts` dùng `@neon/config/v1` và `functions.<slug>.source`.
- Runtime dài hạn dùng `pg.Pool` + `attachDatabasePool`, không dùng `@neondatabase/serverless`.
- Neon tự inject `DATABASE_URL` từ branch liên kết; không hardcode chuỗi kết nối.

Thông tin Free Tier/Functions beta và khả năng trên **project cụ thể** vẫn phải xác nhận ở Console, không coi tài liệu là lời hứa miễn phí.

## Thực hiện sau khi chủ dự án xác nhận

Thực hiện từ `apps/api`, dùng Neon CLI hiện hành. Không tự tạo project mới; chọn project DiagramAI đã có, region Singapore và branch thử nghiệm được duyệt.

```powershell
npx neon@latest --version
npx neon@latest link
npx neon@latest dev
```

`link` có thể mở OAuth và ghi `.neon`/`.env`; các file này đã bị ignore. Không kéo file credentials vào `apps/web`. Đặt `CORS_ALLOWED_ORIGINS` trong environment của branch/function theo Console/CLI hiện hành. Thêm **origin** Pages `https://<chủ-repo>.github.io`, không thêm đường dẫn `/<repo>/`. Dev origin localhost và 127.0.0.1 là hai giá trị khác nhau. Không dùng `*`.

Sau khi review branch và cấu hình:

```powershell
npx neon@latest deploy
npx neon@latest functions get health -o yaml
```

Lấy `invocation_url` thật từ CLI. Slug health là cố định cho spike; không giả định API cùng origin với GitHub Pages. Không deploy bằng `build.bat`.

## Kiểm thử live

Từ root workspace, đặt URL công khai (không chứa token):

```powershell
$env:DIAGRAMAI_HEALTH_BASE_URL = 'https://<invocation-host-thật>/'
$env:DIAGRAMAI_TEST_ORIGIN = 'https://<chủ-repo>.github.io'
npm run spike:neon
```

Script kiểm tra:

1. OPTIONS trả 204 và allowlist chính xác, cho phép GET và Content-Type.
2. GET trả `{"status":"ok","apiVersion":"v1","database":"ok"}` sau `SELECT 1`.
3. Origin ngoài allowlist nhận 403, không có allow-origin.

Tiếp theo đặt `VITE_API_BASE_URL` khi build Pages, mở Chrome tại URL Pages thật và bấm **Kiểm tra API** trong `#/spike`. Lưu bằng chứng network/console đã che dữ liệu. CLI gắn Origin chỉ kiểm tra server, không thay thế kiểm thử CORS thực tế của browser.

## Các ca còn cần chạy

- DB không khả dụng → 503, không trả host/password/connection string.
- Thiếu cấu hình DB → không báo OK.
- Xác nhận secrets không nằm trong static assets/source maps/installer.
- Xác nhận quota, tính phí, region, timeout, cold start và cách disable Function trên dashboard.
- Handler health công khai không phải cơ chế auth cho API dự án; rate limit/abuse guard production sẽ làm ở P5/P6.

Không cấp production traffic/AI công khai chỉ vì health spike chạy được. Nếu Neon không đạt yêu cầu, dừng và ghi ADR sau khi người dùng duyệt phương án khác.
