# DiagramAI

P2 đã được chủ dự án xác nhận OK; P3 Smart Connector đạt kiểm thử Web/Desktop, CI/Pages và live, chờ nghiệm thu — **chưa phải editor sản phẩm v1.0**. Yêu cầu gốc: [`plan.md`](plan.md). Web: **https://tux1cm.github.io/DiagramAI/**. Tiến độ/bằng chứng: [`docs/p3-status.md`](docs/p3-status.md); lịch sử: [`docs/p2-status.md`](docs/p2-status.md), [`docs/p1-status.md`](docs/p1-status.md), [`docs/p0-status.md`](docs/p0-status.md).

## Chạy Web trên Windows

Node.js 24 + npm 11 trở lên:

```powershell
npm ci
npm run dev
```

Mở http://127.0.0.1:5173. Mặc định vào **editor React thật, không iframe, không login**. Thêm/kéo hình từ palette, kéo góc để resize, nhấp đúp hình/nhãn cạnh để sửa chữ, kéo neo để nối. Kéo hình rời lên cạnh sáng tím để chèn A→C→B, một Ctrl+Z hoàn tác cả lần chèn. Có snap tâm/cạnh và guideline; nhấp đúp % zoom để nhập mức chính xác. Tab Thuộc tính chỉnh style/kích thước; hỗ trợ đa chọn, clipboard, nhóm/căn chỉnh và Undo/Redo. Mọi thay đổi chỉ trong bộ nhớ, **mất khi reload/đóng app**. File/lưu/xuất ảnh thuộc P4. Không dùng bản này lưu công việc thật.

Link **Kiểm tra nền tảng** trong footer (hoặc `/#/spike`) giữ chẩn đoán React Flow/Neon từ P0. Probe API thành công không phải đồng bộ sơ đồ. Mockup gốc chỉ phục vụ đối chiếu ở `/reference/DiagramAI_Mockup.html`.

**Ctrl+kéo nhân đôi:** giữ Ctrl trước khi kéo hình/nhóm đã chọn; bản gốc giữ nguyên, thả chuột để tạo bản sao. Một Ctrl+Z hoàn tác; Esc hủy khi đang kéo. Ctrl+click vẫn dùng để đa chọn. Thả một bản sao lên cạnh sáng tím sẽ nhân đôi và chèn trong cùng một Undo; dữ liệu vẫn chỉ nằm trong bộ nhớ.

**Ctrl+kéo góc từ tâm:** chọn hình trước, giữ Ctrl rồi kéo một nút góc để phóng to/thu nhỏ đều quanh **tâm hình cố định**; các phía đối diện cùng giãn/co, giữ tỷ lệ rộng/cao. Kéo góc không Ctrl vẫn resize tự do. Không đổi cỡ chữ hoặc nhân đôi hình; cạnh nối tiếp tục bám neo, một Ctrl+Z hoàn tác, Esc hủy trong lúc kéo.

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

Ảnh/metrics/pixel diff nằm trong `test-results/web/`, báo cáo ở `playwright-report/`. Test so sánh trực tiếp với mockup gốc tại cùng viewport; chỉ mask các vùng wording trạng thái/controls chưa có engine được liệt kê trong `docs/p1-status.md`, không mask canvas/palette/layout.

## Desktop

Cần Rust stable **MSVC x64**, Visual Studio C++ Build Tools + Windows SDK và WebView2. Trên máy hiện tại, Rust/Cargo 1.100.0 đã được cài theo chấp thuận của chủ dự án. Mở terminal mới để nhận PATH Rustup (`%USERPROFILE%\.cargo\bin`).

```powershell
npm run check:environment
npm run desktop:dev
npm run desktop:build
```

`build.bat` kiểm tra môi trường và Vite server đang giữ dependency, dùng `npm ci`, kiểm tra mã, build NSIS/Web, copy vào `File/Desktop_Light` và `File/Web`, ghi `logs/build.log`. Không deploy, không migration, không ZIP. Output cũ được chuyển nguyên vẹn vào `File/Previous/<timestamp>/`, không xóa hay trộn file. Desktop dùng cùng build Web nhưng ép base `/`; bản Web dùng base đã cấu hình. Dùng `build.bat --no-pause` cho kiểm thử tự động.

**Đã build và kiểm thử NSIS cài/gỡ, WebView2 render, resize/minimize/restore và hash route/reload**. P2 kiểm tra thêm sửa chữ/nhãn cạnh, kéo/resize, nối, clipboard và Undo; chưa nghiệm thu editor sản phẩm hoàn chỉnh. Chạy lại bằng `npm run test:desktop`: dùng thư mục cài riêng, không tạo shortcut, từ chối ghi đè app người dùng đã cài, profile WebView2 riêng và debug loopback chỉ trong test; so pixel với reference ở 3 viewport sau khi fit cùng camera.

- Bộ cài: `File/Desktop_Light/DiagramAI_Setup_x64.exe`.
- Chạy thử **không cần setup**: `apps/desktop/src-tauri/target/release/diagramai.exe`.
- Identifier `local.diagramai.app` chỉ cho thử nghiệm; identifier phát hành và metadata phải được duyệt sau. Icon từ logo mockup, nguồn `design/app-icon.svg`.

Dependency audit mới nhất ngày 19/11/2026 trả 0 advisories; lịch sử cảnh báo và giới hạn tại `docs/p0-dependency-audit.md`. Build/audit đạt không đồng nghĩa toàn bộ sản phẩm đã qua security review.

## Neon P0

Xem [`docs/p0-neon-spike.md`](docs/p0-neon-spike.md) và bằng chứng deploy [`docs/p0-status.md`](docs/p0-status.md). Health đã deploy vào project DiagramAI hiện có tại Singapore; Pages gọi DB thật thành công. Chỉ có `/v1/health`; chưa có API dự án, đồng bộ hay AI. Không cần Gemini key cho P0. Không gửi credentials vào chat hoặc commit `.env`.

`npm run test:live` kiểm tra Pages + Neon thật trên 3 viewport bằng Edge Windows (Chromium trên Linux), có browser preflight, chỉ query health. Không tự deploy hoặc thay dữ liệu. Ảnh trong `test-results/live/`.

## GitHub Pages

Repo đã được chủ dự án xác nhận: https://github.com/tux1cm/DiagramAI. Pages dùng GitHub Actions và đã deploy thành công. Cấu hình để deploy lại:

1. Đặt repository variable `VITE_BASE_PATH`: `/<tên-repo-đã-chốt>/` cho project site, `/` cho user site/custom domain.
2. `VITE_API_BASE_URL`: URL HTTPS công khai của Neon Function, không chứa token; có thể để trống khi chưa liên kết Neon.
3. Chạy workflow **Deploy Pages (manual P0 spike)**. Không tự publish từ build local.
4. Kiểm tra URL thật, refresh `/#/spike`, CORS trong trình duyệt. Tôn trọng lựa chọn Cốc Cốc của chủ dự án; không tự mở Chrome.

`node scripts/p0-github-pages.mjs status` đọc trạng thái qua Git Credential Manager mà không in/lưu token. Mode `setup`/`dispatch` sửa config hoặc deploy repo đã chốt, chỉ chạy khi có ý định publish; không được gọi tự động từ build local. Không mặc định workflow file hoặc dispatch đồng nghĩa deploy thành công.

## Cấu trúc hiện có

- `apps/web`: React/Vite entry.
- `apps/desktop`: Tauri 2, dùng cùng frontend.
- `apps/api`: Neon health handler và cấu hình deploy spike.
- `packages/ui`: AppShell, components React và properties/shortcuts; diagnostics P0 vẫn giữ riêng.
- `packages/diagram-core`: schema/registry, commands atomic, clipboard, nhóm/căn chỉnh và history độc lập React Flow.
- `packages/editor`: adapter React Flow, SVG nodes/edges, inline labels, kéo/resize/connect và viewport.
- `packages/shared`: hợp đồng health công khai và client validation.
- `design/reference`: bản HTML nguyên vẹn và ảnh baseline.
- `docs`: kiến trúc, quyết định và báo cáo P0/P1/P2.

SQLite/IndexedDB, file import/export, sync và AI thuộc các phase sau, **chưa triển khai**.
