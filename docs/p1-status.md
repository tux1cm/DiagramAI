# P1 — Chuyển giao diện mockup sang React

Ngày: 2026-11-19. P0 đã được chủ dự án xác nhận PASS. **P1 đang kiểm thử — chưa bắt đầu P2.**

## Phạm vi và hiện thực

- Trang chính render React components thật, **không iframe, không chèn nguyên HTML mockup hoặc chạy script mockup**.
- Giữ token/CSS/layout/icon/shape geometry của reference; `reference.css` được trích từ bản đã duyệt, có kiểm tra chống diverge.
- Tách `Topbar`, `Palette`, `Toolbar`, `CanvasPreview`, `Inspector`, `Modal`, `Icon`, `Shape` và `EditorShell`; Web/Tauri dùng cùng `AppShell`.
- 21 mục palette đúng registry gốc; tìm kiếm, panel collapse và overlay tại breakpoint cũ.
- `useReducer` quản lý view-model trong bộ nhớ: title, fixture node/edge, selection, màu preset; counts/label/Thuộc tính lấy từ state. Không giả định đây là schema/domain/history production.
- Chọn node/edge, xem Thuộc tính; đổi màu mẫu chỉ tác động node được chọn; zoom/fit preview; đổi tên dự án mẫu.
- Tab keyboard arrows, modal focus trap/Escape/focus restoration; React text escaping cho prompt và title.
- Không có tự lưu hoặc đồng bộ: topbar ghi **Bản thử · Chưa lưu**, cloud **Chưa bật**, footer nêu P1. Reload sẽ reset bản mẫu.
- File/shape/AI buttons thông báo phase tương ứng, không giả lập success; engine tools/Undo/Redo bị disable. Không dùng `window.prompt()` trong UI React.
- `#/spike` giữ kiểm tra P0/Neon, truy cập từ footer hoặc Help. Reference HTML vẫn là file đối chiếu riêng, không phải editor chính.

## Checklist nghiệm thu P1

| Tiêu chí | Trạng thái / bằng chứng |
|---|---|
| React shell thay iframe | Đạt local; test assert iframe count = 0 |
| Bám layout/màu/shape mockup | Đạt Web local: geometry sai lệch ≤1px, pixel comparison 3 viewport đạt (chi tiết masks bên dưới) |
| Tab Thuộc tính và tô màu | Đạt E2E: chọn n2 → xanh, n1 không đổi; chọn edge hiển thị nhãn readonly; reload reset |
| Không login, không fake saved/cloud | Đạt E2E; state P1 rõ trên topbar/footer |
| Search/collapse/zoom/keyboard/modal | Đạt E2E: cả test viewport 900 overlay sidebar và focus trap |
| Desktop/WebView2 | Đạt full build, NSIS cài/gỡ cách ly, chọn/tô màu, 3 viewport/minimize/restore/navigation/live health và pixel comparison |
| GitHub CI/Pages/live | Chưa deploy P1; Web public còn P0 cho tới khi kiểm thử local đạt |

## Các lệnh đã chạy

- `npm run prepare:reference`: CSS được trích, reference SHA-256 giữ nguyên.
- `npm run check`: ESLint + strict typecheck + **31 unit tests PASS / 3 files**.
- `PLAYWRIGHT_CHANNEL=msedge npm run test:e2e`: **24/24 PASS** ở bộ test ban đầu gồm 3 visual comparison.
- Chạy bộ mở rộng với `VITE_BASE_PATH=/p0-subpath/`: **30/30 PASS**, gồm viewport 900 overlay sidebar/focus trap và 3 visual comparison; root-base đã đạt ở lượt trước.
- `build.bat --no-pause`: PASS toàn bộ npm ci/check/Web + Tauri NSIS + collect. Bản trước archive nguyên vẹn.
- `npm run test:desktop`: PASS, installer=0/test=0/uninstaller=0; thực sự chạy WebView2, có chọn/tô màu và gọi Neon health; không dùng Chromium thường thay cho native test.
- Lượt E2E đầu bắt lỗi accessible name nút zoom (`+`/`−` chỉ có title); đã sửa bằng `aria-label`, không nới test để bỏ lỗi.
- `npm audit --omit=dev` và `npm audit`: **0 advisories theo registry ngày 19/11/2026**. Báo cáo P0 ngày 18/11 vẫn là lịch sử, không tự tuyên bố advisory cũ đã được khắc phục bằng thay đổi code.

## So sánh visual minh bạch

Reference được mở ở cùng browser/viewport với P1. So sánh geometry 8 vùng: topbar, rail, palette, toolbar, canvas, inspector, tabbar, footer. So sánh pixel bằng pixelmatch (threshold 0.1, tỷ lệ mismatch tối đa 0.3% toàn ảnh), **không sửa baseline gốc**.

Các vùng có thay đổi chủ đích được mask ở cả hai ảnh: title/save state, cloud chip, controls chưa có engine, rail pan/link, nhãn trạng thái AI, chat text, model tag/send, hint P1, footer. Đây là thay đổi ngữ nghĩa cần thiết để không báo tính năng/lưu thành công giả, không phải đổi thiết kế.

Kết quả Web local ban đầu: **0 pixel mismatch ở phần không mask** tại 1366×768, 1920×1080, 1280×720; không có nghĩa toàn bộ ảnh giống nhau hoặc P1 đã có engine vẽ. Fixture canvas, palette thumbnails, nền grid và panel geometry vẫn nằm trong vùng so sánh.

WebView2: **316 pixel mismatch** cho mỗi viewport (0.0301% / 0.0152% / 0.0343%, dưới ngưỡng 0.3%). Đã xem diff: tập trung logo stroke, chữ AI và palette-header icon. Metrics computed-style xác nhận trang reference tĩnh dưới Tauri CSP không áp dụng 3 inline style này (1.85px/ink/ink), còn React đúng thiết kế (2.2px/#596bf1/#a1adbf). Không sửa reference, không nới CSP hoặc mask thêm các vùng đó để ép số 0; test còn assert token của React đúng theo thiết kế.

Ảnh/metrics/diff tự động ở `test-results/web/`, WebView2 ở `test-results/desktop/`; ảnh nghiệm thu 3 viewport Web/native, metrics và diff native đã lưu `docs/evidence/p1/`, gồm `webview2-properties.png` chứng minh selection/tô màu.

## Artifact Windows hiện tại

- Không cần setup: `apps/desktop/src-tauri/target/release/diagramai.exe`.
- Installer: `File/Desktop_Light/DiagramAI_Setup_x64.exe` — 2.022.281 bytes.
- SHA-256: `b37b1ee957c5e109af769d2eb1dee6cd507d29725fbfa78ecc85b10ba5548f11`.
- Manifest/README cài và Web static trong `File/`; log build `logs/build.log`.

## Còn nằm ngoài P1

- P2: domain schema/commands/history, tạo/kéo/resize/sửa chữ node/edge, phím tắt và kết nối thực.
- P3: smart connector/chèn node/snap/routing.
- P4: nhiều dự án, local SQLite/IndexedDB, lưu/mở và xuất SVG/PNG/PDF.
- P5/P6: đồng bộ capability/recovery/conflict và AI thật có proposal/preview/quota guard.

Không coi thao tác thay màu bản mẫu hoặc probe health là persistence, cloud sync hay AI production.
