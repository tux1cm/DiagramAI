# DiagramAI

P4 đã được chủ dự án chốt. P5 đã triển khai **một kho riêng chung Web/Desktop: Dự án → Bản vẽ, vào bằng link riêng, không ghép từng bản**, chờ nghiệm thu — **chưa phải v1.0; chưa làm P6/AI**. Yêu cầu: [`plan.md`](plan.md). Web: **https://tux1cm.github.io/DiagramAI/**. Tiến độ mới: [`docs/p5-workspace-status.md`](docs/p5-workspace-status.md); lịch sử per-diagram: [`docs/p5-status.md`](docs/p5-status.md). Hướng dẫn: [`docs/p5-usage.md`](docs/p5-usage.md).

## Chạy Web trên Windows

Node.js 24 + npm 11 trở lên:

```powershell
npm ci
npm run dev
```

Mở http://127.0.0.1:5173. Mặc định vào **editor React thật, không iframe, không login**. Thêm/kéo hình từ palette, kéo góc để resize, nhấp đúp hình/nhãn cạnh để sửa chữ, kéo neo để nối. Kéo hình rời lên cạnh sáng tím để chèn A→C→B, một Ctrl+Z hoàn tác cả lần chèn. Ctrl+kéo thân nhân đôi; Ctrl+kéo góc giữ tỷ lệ quanh tâm. Có snap/guideline, nhóm/căn chỉnh, clipboard và Undo/Redo.

Tự lưu thay đổi đã commit vào IndexedDB (Web) / SQLite (Desktop); chỉ **Đã lưu trên máy** sau ghi thành công. **Quản lý** chứa Dự án → Bản vẽ và đường vào File/local/checkpoint. **Ctrl+S** lưu `.diagramai`, **Ctrl+Shift+S** lưu thành file mới; hỗ trợ SVG/PNG/PDF tiếng Việt. File ngoài ổ đĩa không bị autosave ghi đè. Kho chung vào bằng **link riêng**, không ghép từng bản; tạo mới ở bên nào cũng được phát hiện bên kia. Web có PWA offline sau khi cache hoàn tất; hãy xuất `.diagramai` và giữ link kho trước khi xóa site/app data. Chỉ báo **Đã đồng bộ** sau server ACK và ghi local thành công.

Hướng dẫn lưu, dự phòng, xử lý lỗi/xung đột: [`docs/p4-usage.md`](docs/p4-usage.md).

Link **Kiểm tra nền tảng** trong footer (hoặc `/#/spike`) giữ chẩn đoán React Flow/Neon từ P0. Probe API thành công không phải đồng bộ sơ đồ. Mockup gốc chỉ phục vụ đối chiếu ở `/reference/DiagramAI_Mockup.html`.

**Ctrl+kéo nhân đôi:** giữ Ctrl trước khi kéo hình/nhóm đã chọn; bản gốc giữ nguyên, thả chuột để tạo bản sao. Một Ctrl+Z hoàn tác; Esc hủy khi đang kéo. Ctrl+click vẫn dùng để đa chọn. Thả một bản sao lên cạnh sáng tím sẽ nhân đôi và chèn trong cùng một Undo; dữ liệu vẫn chỉ nằm trong bộ nhớ.

**Ctrl+kéo góc từ tâm:** chọn hình trước, giữ Ctrl rồi kéo một nút góc để phóng to/thu nhỏ đều quanh **tâm hình cố định**; các phía đối diện cùng giãn/co, giữ tỷ lệ rộng/cao. Kéo góc không Ctrl vẫn resize tự do. Không đổi cỡ chữ hoặc nhân đôi hình; cạnh nối tiếp tục bám neo, một Ctrl+Z hoàn tác, Esc hủy trong lúc kéo.

```powershell
npm run prepare:reference
npm run check:p5
npm run build:web
npm run preview
```

## Kiểm thử trình duyệt

Theo yêu cầu chủ dự án, mặc định giai đoạn này chỉ chạy **P5 + điểm nối P4→P5** (`npm run check:p5`, `npm run test:p5:web`). Web suite cần `DIAGRAMAI_P5_TEST_PROJECT` và `DIAGRAMAI_P5_TEST_BRANCH` trỏ nhánh dev hiện có, không production; CI dùng Postgres localhost ephemeral. Các lệnh `test:e2e` bên dưới là bộ tổng thể cũ, dành cuối P7 hoặc khi được yêu cầu.

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

`npm run test:desktop` hiện chỉ chạy P5 trên **test build** (`DIAGRAMAI_TEST_BUILD=1`, API loopback): SQLite/DPAPI ↔ Web, offline/restart/outbox và conflict. Harness cài/gỡ riêng, không shortcut, không thay app người dùng đã cài; dùng profile riêng. Bộ Desktop tổng thể cũ là `npm run test:desktop:full`, dành cuối P7. Kiểm tra bản production qua managed API bằng `scripts/test-desktop.ps1 -Scope managed` và `DIAGRAMAI_NATIVE_MANAGED_API` trỏ đúng production origin.

- Bộ cài: `File/Desktop_Light/DiagramAI_Setup_x64.exe`.
- Chạy thử **không cần setup**: `apps/desktop/src-tauri/target/release/diagramai.exe`.
- Identifier `local.diagramai.app` chỉ cho thử nghiệm; identifier phát hành và metadata phải được duyệt sau. Icon từ logo mockup, nguồn `design/app-icon.svg`.

Dependency audit mới nhất ngày 19/11/2026 trả 0 advisories; lịch sử cảnh báo và giới hạn tại `docs/p0-dependency-audit.md`. Build/audit đạt không đồng nghĩa toàn bộ sản phẩm đã qua security review.

## Neon P5 (giữ health P0)

Project DiagramAI hiện có tại Singapore; giữ `/v1/health`, thêm API dự án private, CAS/outbox, pairing/revoke/recovery. Migration dev được kiểm thử trước production, production có snapshot backup. Xem [`docs/p5-usage.md`](docs/p5-usage.md) và ADR 0006. API mặc định tắt sync nếu thiếu cấu hình; không gửi secrets vào chat hoặc commit `.env`.

Test live tập trung P5: `npx playwright test --config playwright.live-p5.config.ts` kiểm tra hai browser trên Pages ↔ Neon production, chỉ tạo fixture riêng và xóa sau test. `npm run test:live` là bộ live cũ P0–P4 (3 viewport), không chạy mặc định trong P5.

## GitHub Pages

Repo đã được chủ dự án xác nhận: https://github.com/tux1cm/DiagramAI. Pages dùng GitHub Actions và đã deploy thành công. Cấu hình để deploy lại:

1. Đặt repository variable `VITE_BASE_PATH`: `/<tên-repo-đã-chốt>/` cho project site, `/` cho user site/custom domain.
2. `VITE_API_BASE_URL`: URL HTTPS công khai của Neon Function, không chứa token; có thể để trống khi chưa liên kết Neon.
3. Chạy workflow **Deploy Pages (manual P5 preview)**. Không tự publish từ build local.
4. Kiểm tra URL thật, refresh `/#/spike`, CORS trong trình duyệt. Tôn trọng lựa chọn Cốc Cốc của chủ dự án; không tự mở Chrome.

`node scripts/p0-github-pages.mjs status` đọc trạng thái qua Git Credential Manager mà không in/lưu token. Mode `setup`/`dispatch` sửa config hoặc deploy repo đã chốt, chỉ chạy khi có ý định publish; không được gọi tự động từ build local. Không mặc định workflow file hoặc dispatch đồng nghĩa deploy thành công.

## Cấu trúc hiện có

- `apps/web`: React/Vite entry.
- `apps/desktop`: Tauri 2, dùng cùng frontend.
- `apps/api`: Neon health/private sync API, migrations và cấu hình deploy.
- `packages/ui`: AppShell, components React và properties/shortcuts; diagnostics P0 vẫn giữ riêng.
- `packages/diagram-core`: schema/registry, commands atomic, clipboard, nhóm/căn chỉnh và history độc lập React Flow.
- `packages/editor`: adapter React Flow, SVG nodes/edges, inline labels, kéo/resize/connect và viewport.
- `packages/shared`: hợp đồng health công khai và client validation.
- `design/reference`: bản HTML nguyên vẹn và ảnh baseline.
- `docs`: kiến trúc, quyết định và báo cáo P0/P1/P2.

`packages/local-storage` chứa SQLite/IndexedDB và durable sync journal; `packages/sync-core` chứa protocol/client/coordinator. AI thuộc P6, **chưa triển khai**.
