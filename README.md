# DiagramAI

P0 đang triển khai — **chưa phải sản phẩm v1.0**. Yêu cầu gốc: [`plan.md`](plan.md).

## Chạy Web trên Windows

Node.js 24 + npm 11 trở lên:

```powershell
npm ci
npm run dev
```

Mở http://127.0.0.1:5173. Mặc định vào **mockup tham chiếu**, không login. Bấm nhãn P0 hoặc mở `/#/spike` để kiểm tra React Flow và API. Mockup chạy trong iframe sandbox riêng; thao tác chỉ để thử giao diện, **không có lưu local sản phẩm**. Không dùng nó để lưu công việc thật.

```powershell
npm run prepare:reference
npm run check
npm run build:web
npm run preview
```

## Kiểm thử trình duyệt

```powershell
npx playwright install chromium
npm run test:e2e
```

Hoặc dùng Edge đã cài (không cần tải Chromium):

```powershell
$env:PLAYWRIGHT_CHANNEL = 'msedge'
npm run test:e2e
```

Kiểm tra project site dưới subpath:

```powershell
$env:VITE_BASE_PATH = '/p0-subpath/'
npm run test:e2e
Remove-Item Env:VITE_BASE_PATH
```

Ảnh và trace test nằm trong `test-results/`, báo cáo ở `playwright-report/`. Ảnh reference được chụp từ mockup gốc, không phải thiết kế mới.

## Desktop P0

Cần Rust stable **MSVC x64**, Visual Studio C++ Build Tools + Windows SDK và WebView2. Trên máy hiện tại, Rust/Cargo 1.100.0 đã được cài theo chấp thuận của chủ dự án. Mở terminal mới để nhận PATH Rustup (`%USERPROFILE%\.cargo\bin`).

```powershell
npm run check:environment
npm run desktop:dev
npm run desktop:build
```

`build.bat` kiểm tra môi trường và Vite server đang giữ dependency, dùng `npm ci`, kiểm tra mã, build NSIS/Web, copy vào `File/Desktop_Light` và `File/Web`, ghi `logs/build.log`. Không deploy, không migration, không ZIP. Output cũ được chuyển nguyên vẹn vào `File/Previous/<timestamp>/`, không xóa hay trộn file. Desktop dùng cùng build Web nhưng ép base `/`; bản Web dùng base đã cấu hình. Dùng `build.bat --no-pause` cho kiểm thử tự động.

**Đã build và kiểm thử NSIS cài/gỡ, WebView2 render, resize/minimize/restore và hash route/reload**. Đây chỉ là P0 smoke, chưa nghiệm thu editor sản phẩm. Chạy lại bằng `npm run test:desktop`: dùng thư mục cài riêng, không tạo shortcut, từ chối ghi đè app người dùng đã cài, profile WebView2 riêng và debug loopback chỉ trong test. Bộ cài P0: `File/Desktop_Light/DiagramAI_Setup_x64.exe`. Identifier `local.diagramai.app` chỉ cho spike; identifier phát hành và metadata phải được duyệt sau. Icon P0 lấy từ logo mockup, nguồn tại `design/app-icon.svg`.

Full dependency audit còn cảnh báo dev-toolchain picomatch; xem `docs/p0-dependency-audit.md`. Build đạt không đồng nghĩa security audit sạch.

## Neon P0

Xem [`docs/p0-neon-spike.md`](docs/p0-neon-spike.md). Chỉ có `/v1/health`; chưa có API dự án, đồng bộ hay AI. Không cần Gemini key cho P0. Không gửi credentials vào chat hoặc commit `.env`.

## GitHub Pages

Sau khi chủ dự án xác nhận repo và cấu hình Pages dùng GitHub Actions:

1. Đặt repository variable `VITE_BASE_PATH`: `/<tên-repo-đã-chốt>/` cho project site, `/` cho user site/custom domain.
2. `VITE_API_BASE_URL`: URL HTTPS công khai của Neon Function, không chứa token; có thể để trống khi chưa liên kết Neon.
3. Chạy workflow **Deploy Pages (manual P0 spike)**. Không tự publish từ build local.
4. Kiểm tra URL thật, refresh `/#/spike`, CORS trong Chrome.

Chưa có repo/URL thực, workflow chưa chạy trên GitHub. Không mặc định workflow file đồng nghĩa đã deploy thành công.

## Cấu trúc hiện có

- `apps/web`: React/Vite entry.
- `apps/desktop`: Tauri 2, dùng cùng frontend.
- `apps/api`: Neon health handler và cấu hình deploy spike.
- `packages/ui`: P0 shell tham chiếu + React Flow smoke test; chưa chuyển UI P1.
- `packages/shared`: hợp đồng health công khai và client validation.
- `design/reference`: bản HTML nguyên vẹn và ảnh baseline.
- `docs`: kiến trúc, quyết định và báo cáo nghiệm thu P0.

Engine/domain, SQLite/IndexedDB, sync và AI thuộc các phase sau, **chưa triển khai**.
