# P3 — Smart Connector, chèn hình và snap

## Bổ sung Ctrl+kéo — 2026-11-20

Theo yêu cầu chốt P3: giữ Ctrl ở pointer-down rồi kéo để tạo bản sao. Đã PASS local Web/Desktop; đang chuẩn bị CI/deploy.

- Preview tách khỏi domain: bản gốc/cạnh cũ giữ nguyên, footer/history không đếm preview như dữ liệu đã thêm.
- Đa chọn/nhóm giữ offset, remap UUID và cạnh nội bộ; không copy cạnh ra ngoài hoặc thay clipboard cá nhân/nội bộ.
- Thả vào canvas commit một transaction; nếu một bản sao được thả lên cạnh sáng tím thì copy + InsertNodeOnEdge cũng là một Undo.
- Ctrl+click vẫn thêm/bỏ selection và không tạo history. Esc/Ctrl+Z khi đang kéo hủy bản sao, không Undo nhầm chỉnh sửa trước đó. Blur/pointercancel/thả ngoài canvas cũng hủy.
- Preview dùng RF-only ID khác bản sao thật để tránh cache handle bounds rỗng khiến cạnh của bản sao không render. IDs domain giữ ổn định cho Undo/Redo.
- Web: **18/18 ca Ctrl+kéo PASS** trên 3 viewport; full hồi quy subpath **112 PASS + 2 skip stress lặp có chủ đích**, visual vẫn **30/0/22 pixels**. Unit mới kiểm tra copy plan, nhóm/cạnh nội bộ, clipboard không đổi, stale/cap và atomic copy + insert; tổng **123 tests**.
- `build.bat --no-pause` **PASS**, gồm lint/typecheck và 123/123 tests sau npm ci. Bản cài WebView2 **PASS** Ctrl+kéo/Undo, chèn cạnh và toàn bộ native smoke; visual vẫn **392/316/378 pixels** trên 3 viewport.

Ngày: 2026-11-19. **P2 đã được chủ dự án xác nhận OK; P3 đạt kiểm thử kỹ thuật Web/Desktop, CI/Pages và live, chờ chủ dự án nghiệm thu. Chưa chuyển P4.**

## Phần triển khai

- Kéo hình mới từ palette hoặc hình rời đang có lên nét vẽ thật → highlight tím + điểm chèn + hướng dẫn → thả để đổi A→B thành A→C→B.
- Một domain command atomic; hai cạnh UUID mới, không giữ cạnh gốc ẩn. Giữ direction, kind, style và markers; nhãn cũ chỉ giữ trên A→C, có nhắc nếu là nhãn điều kiện.
- Với hình đang kéo, một Ctrl+Z khôi phục cả vị trí trước kéo lẫn cạnh A→B. Redo giữ UUID ổn định; operation log replay được.
- Hit-test tolerance pixel màn hình với SVG CTM, không dùng bbox làm điều kiện đủ. Hỗ trợ đường thẳng/gấp khúc/bo góc/cong, pan và zoom.
- Chỉ tự chèn một hình rời. Không tự chèn node đã nối/thuộc nhóm/đầu cạnh, nhiều node cùng kéo, cạnh chồng nhau hoặc gần endpoint. Drop trượt chỉ thêm/di chuyển bình thường. Escape/pointercancel/blur không commit split.
- Snap lưới 10px world và tâm/cạnh node khác, guideline khi kéo, tắt bằng checkbox hiện có. Nhấp đúp phần trăm zoom để nhập chính xác 20–300%.
- Orthogonal routing tránh blocker ở mức bounded lane search, giữ hướng source/target ports. Fallback giữ cạnh cũ về mặt kết nối; có `data-route-fallback` cho kiểm thử/chẩn đoán.

ADR: [`decisions/0004-p3-insertion-and-snapping.md`](decisions/0004-p3-insertion-and-snapping.md).

## Bằng chứng hiện có

| Kiểm tra | Kết quả |
|---|---|
| Lint/typecheck + unit | **119/119 PASS**; atomic split, stale/cap/rollback, 16 kind/marker cases, replay, 120 gestures core, snapping 0.5/1/2, obstacle fallback |
| Web tương tác | Full subpath 3 viewport **94 PASS**, **2 skip có chủ đích** (chỉ lặp lại ca stress ở viewport khác); có 4 kiểu cạnh, nhãn/mũi tên hai chiều, new/existing insertion, 50/100/200% + pan, miss/bbox/endpoints, Escape, connected/overlapping-edge guards, guidelines, blocker |
| Stress cạnh sống | **101 gestures bằng pointer thật PASS ở 1366**, không mất/đổi ID cạnh; 120 interactions core có Undo/Redo PASS. Các ca tương tác khác chạy đủ 3 viewport |
| Visual regression | **PASS**, ngoài masks có sẵn: **30 / 0 / 22 pixels** ở 1366 / 1920 / 1280; geometry layout giữ nguyên, không thêm mask để che P3 |
| Đường cong/bo góc lệch trục | **6/6 PASS** bổ sung trên 3 viewport; không chỉ thử Bézier thẳng cùng trục |
| Windows build/native | **PASS** full build NSIS/Web, cài/gỡ cách ly, 3 viewport, P2 regressions, chèn palette/hình tồn tại, highlight/Undo/Redo, live Neon health. Visual **392/316/378 pixels**, tối đa **0.0410%** (<0.3%) |
| Dependency audit | Full `npm audit --json` **0 vulnerabilities**, không thêm dependency |
| CI/Pages | **SUCCESS** commit `1aa9544`: [CI 44475258468](https://github.com/tux1cm/DiagramAI/actions/runs/44475258468), [Pages 44475269083](https://github.com/tux1cm/DiagramAI/actions/runs/44475269083) |
| Live Pages/Neon | **3/3 PASS**: site thật 1366/1920/1280, tạo cạnh/đổi kiểu, chèn hình với highlight, Undo phục hồi cạnh UUID cũ, beforeunload/reload, browser CORS/preflight và PostgreSQL health thật |

## Lỗi phát hiện trong kiểm thử

- RF khởi đầu drag sau threshold nên pointer update bước lớn gây lệch tâm kéo/guideline và miss tại zoom 200%. Adapter bắt đầu interaction ở pointer-down (`nodeDragThreshold=0`); click không đổi geometry không được split.
- Zero threshold gọi drag-stop cả khi chỉ click; đã chặn snap/geometry/history cho click không di chuyển. Hồi quy P2 bắt lỗi lệch 1–5px và đã PASS lại cả resize/Undo lẫn grouping/alignment trên 3 viewport.
- SVG orthogonal cùng trục có thể chỉ có hai điểm; router bổ sung outward stubs để vẫn tránh được blocker, thay vì bỏ qua tuyến thẳng đứng/ngang.
- Test fixture dùng `.last()` bị đổi target sau khi thêm C: thay bằng locator UUID ổn định. Redo assertions chờ RF render cạnh thay vì đọc DOM ngay sau key event.
- Không chạy build Desktop đồng thời E2E vì cùng ghi `apps/web/dist`.

## Phạm vi/giới hạn

- Không auto-layout/dồn cả sơ đồ. Nếu đoạn quá ngắn hoặc shape quá lớn, C có thể cần được người dùng kéo giãn vị trí; ưu tiên graph đúng, không mất cạnh. Routing tránh bbox cơ bản có fallback, không tuyên bố tương đương draw.io.
- Không thêm waypoint editing, không có dữ liệu waypoint thủ công cũ để reset.
- Không gửi graph lên Neon; backend chỉ health đã có. Không lưu giả: mọi thay đổi còn ở bộ nhớ, reload/đóng app mất nội dung. File/SQLite/IndexedDB/export thuộc **P4**.
- Không benchmark FPS/500-node. Warning chunk >500kB/toolchain từ P2 vẫn phải ghi nhận.

## Artifact local

- Bộ cài mới có Ctrl+kéo `File/Desktop_Light/DiagramAI_Setup_x64.exe`: **2,062,149 bytes**, SHA-256 `5efe24ae174d6cb8d097cf61d479c71089b3ceea59d0bab3823068668e080462`.
- Chạy không setup: `apps/desktop/src-tauri/target/release/diagramai.exe`. Static Web: `File/Web/`. Output trước đã archive nguyên vẹn trong `File/Previous/`.
- Log/manifest và ảnh: [`evidence/p3/`](evidence/p3/). Main JS sau Ctrl+kéo **579.66 kB** (gzip 179.63 kB); warning vẫn giữ, không tăng ngưỡng để che. ESLint 9 deprecated và identifier thử nghiệm `.app` chưa đổi trong phase này.

## Test nhanh

1. Kéo hình từ thư viện lên giữa cạnh, chờ cạnh sáng tím rồi thả; phải có A→C→B. Ctrl+Z một lần quay lại trước khi thêm.
2. Thêm một hình rời ở vùng trống; kéo tâm hình lên cạnh rồi thả. Undo phải trả hình về chỗ cũ và phục hồi cạnh gốc.
3. Thử cạnh Có/Không và mũi tên đôi; nhãn chỉ trên đoạn trước C. Thuộc tính vẫn sửa được hai cạnh mới.
4. Nhấp đúp % zoom → nhập 50/100/200; Space-pan rồi thử chèn lại. Drop lệch khỏi nét hoặc sát đầu nối không tự nối.
5. Kéo gần tâm/cạnh hình khác để thấy guideline; tắt snap ở Thuộc tính để di chuyển tự do. Escape giữa lúc kéo không chèn.
6. **Không refresh/đóng nếu muốn giữ bản vẽ** — lưu thật là P4.
