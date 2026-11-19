# P2 — Domain model và engine vẽ

Ngày: 2026-11-19. P1 đã được chủ dự án xác nhận PASS. **P2 đạt kiểm thử kỹ thuật Web/Desktop, CI/Pages và live; chờ chủ dự án nghiệm thu. Chưa bắt đầu P3/P4.**

## Phần triển khai

- Domain độc lập React Flow tại `packages/diagram-core`: UUID, document/node/edge/style/group schema, tham chiếu node/port, caps, validator strict, explicit v0→v1 migration và serialize/parse JSON.
- Command batch atomic: add/update/move/resize/connect/delete/rename/group/ungroup; cả batch invalid bị từ chối, không apply từng phần.
- Session store immutable, undo/redo theo snapshot transaction có operationId/baseRevision/label/commands. Drag/resize nhiều pointer update chỉ commit một history entry.
- Clipboard fragment validate + remap IDs/edges/groups; same-document edge-only copy có kiểm tra endpoints, không tạo dangling cross-document edges. Internal clipboard không phụ thuộc browser permission; OS clipboard best-effort.
- Canvas React Flow v12 với SVG General registry + text, bốn neo hover/selected, đường nối bám ID/port, reconnect, chọn nhiều/marquee, kéo/resize, snap-grid cơ bản, pan/zoom/fit.
- Node và edge label sửa inline; Enter/Shift+Enter/Escape/blur; properties có text, fill/stroke/text color, font/size/weight, line width/dash, geometry, arrow/routing, multi-fill, arrange và logical grouping.
- Phím tắt Ctrl+A/C/V/X/D/Z/Y/Shift+Z/G/Shift+G, Delete/Backspace, arrows/Shift+arrows, Space pan. Không bắt graph shortcuts trong input/textarea/select/contenteditable hoặc modal, không cướp IME.
- Document/history được giữ khi chuyển `#/spike` rồi quay lại. Beforeunload cảnh báo trên browser khi dirty; topbar/footer vẫn ghi chưa lưu.

## Bằng chứng đang có

| Kiểm tra | Kết quả |
|---|---|
| Lint/typecheck | PASS local |
| Unit tests | **75/75 PASS**, gồm schema/ports/shapes, atomic rollback, freeze state/history, draft drag 100 updates/1 Undo, clipboard, migration, group/arrange |
| Hồi quy giao diện 3 viewport | **PASS**; mismatch ngoài masks: 1366×768 **30 pixels (0.0029%)**, 1920×1080 **0**, 1280×720 **22 (0.0024%)**; trong ngưỡng 0.3%, geometry không lệch layout |
| Thao tác P2 1366×768 | **8/8 PASS** lượt đầu: 20 nodes, inline labels, drag/resize, connect/reconnect/markers, clipboard/delete, group/align, transformed drop/pan/zoom/marquee, input guards/diagnostics |
| Bộ mở rộng 3 viewport/subpath | **57/57 PASS**, gồm 27 executions thao tác P2; thêm font/stroke/arrow keys và assertion path cạnh sau resize/Undo |
| Neo cạnh trong lúc kéo/resize | **3/3 PASS** lượt kiểm tra bổ sung: endpoint khớp geometry hiện tại trước pointer-up, sai số <0.11 world unit, không toast lỗi |
| Dependency audit P2 | Full `npm audit --json`: **0 advisories** |
| Windows build | **PASS** `build.bat --no-pause`, Rust release + NSIS + Web, output cũ archive nguyên vẹn |
| Desktop/WebView2 | **PASS** cài/gỡ cách ly, 3 viewport, minimize/restore, inline node/edge label, drag/resize, connect, clipboard, Undo và live Neon health. Pixel mismatch: **346/316/338** ở 1366/1920/1280, tối đa **0.0367%**, ngưỡng 0.3% |
| CI/Pages P2 | **SUCCESS** commit `de6a3eb`: [CI 44466668532](https://github.com/tux1cm/DiagramAI/actions/runs/44466668532), [Pages 44466683426](https://github.com/tux1cm/DiagramAI/actions/runs/44466683426) |
| Live Pages/Neon | **3/3 PASS** ở 1366/1920/1280: editor P2, inline text, resize/Undo, properties, beforeunload/reload, diagnostics và health PostgreSQL thật qua browser CORS/preflight |

## Lỗi đã phát hiện và sửa

- Controlled RF nodes bị mất trạng thái đo do adapter bỏ qua dimension measurements: đã cung cấp `measured` từ kích thước SVG có thẩm quyền trong adapter, không lưu RF internals vào domain hoặc tạo history lúc khởi tạo.
- Lint bắt ternary expression dùng như statement và hook dependency capture: đã sửa, không tắt lint.
- Sai số float sau resize/Undo sinh điểm trùng trong SVG path: làm tròn tọa độ trước dedup, giữ assertion path bằng nhau; test đạt cả 3 viewport.
- React Flow gắn cạnh vào mép ngoài handle 12px thay vì tâm neo trên biên node: bù nửa kích thước handle cho cả nguồn/đích và mọi routing. Initial path được assertion đúng tọa độ biên; visual mismatch giảm về 0–30 pixels.
- Resize callback mang thêm `direction` của RF, bị strict command validator từ chối trong lúc kéo dù commit cuối thành công: adapter chỉ truyền x/y/width/height. E2E kiểm tra live draft/cạnh trước pointer-up và không có toast lỗi; không chỉ dựa vào kích thước cuối.
- Build Desktop và Playwright preview cùng ghi `apps/web/dist` làm Rust mất asset đang embed ở lượt đầu. Chạy tuần tự E2E rồi build Desktop; không chạy hai pipeline cùng output song song.
- Native window resize giữ camera người dùng, mockup lại tự fit. Test visual bấm “Vừa màn hình” tại mỗi viewport trước so sánh, giống khung nhìn fit ở Web test; không đổi app để reset pan/zoom khi resize, không thêm mask canvas hoặc tăng tolerance.

## Ranh giới nghiệm thu

- Node mới dùng UUID; ví dụ nhập kho chỉ là seed editable ban đầu, không phải engine hardcode theo một sơ đồ.
- Chỉ format JSON/schema/migration round-trip được kiểm chứng ở P2. **Nút Mở/Lưu/Xuất và nhiều dự án vẫn P4**, đúng quyết định đã giải thích với chủ dự án; chưa có OS file dialog, SQLite/IndexedDB, autosave hay khôi phục khi đóng app.
- Chưa auto insert C vào A→B, chưa avoidance routing/guideline/snap-edge P3; chỉ live handles và routing cơ bản.
- Chưa AI/sync thật; probe Neon giữ nguyên từ P0, không gửi graph lên backend khi vẽ.
- Không tuyên bố FPS/500-node benchmark. Vite có cảnh báo main chunk >500 kB; chưa tối ưu bundle/performance P7 và không tăng ngưỡng warning để che cảnh báo.
- Tests clipboard chặn OS clipboard cố ý: chứng minh internal fallback hoạt động, không khẳng định mọi quyền clipboard/cross-app trên mọi browser đã nghiệm thu.
- Giữ file mockup/reference và CSS tokens bất biến. Pixel comparison chỉ mask wording trạng thái/controls/tip phase đã ghi rõ, không mask canvas/palette thumbnails để che drift.

## Artifact local

- Chạy nhanh không setup: `apps/desktop/src-tauri/target/release/diagramai.exe`.
- Bộ cài sau sửa connector: `File/Desktop_Light/DiagramAI_Setup_x64.exe`, **2,058,305 bytes**, SHA-256 `778940edf549a7d666c527ed34e625294ab155b3b05a421555d0f83266ff6b51`.
- Manifest: `File/Desktop_Light/release-manifest.json`; static Web: `File/Web/`.
- Build còn warning chunk JS 561 kB, ESLint 9 hết hỗ trợ và identifier thử nghiệm `.app`; không che warning, không tự nâng stack/đổi identifier phát hành trong P2.

## Test nhanh dự kiến

1. Thêm/kéo hình từ palette; chọn → kéo góc resize hoặc nhập Rộng/Cao ở Thuộc tính.
2. Nhấp đúp hình hoặc chữ Có/Không → sửa → Enter; Esc hủy, Shift+Enter xuống dòng trong hình.
3. Hover hình → kéo neo sang hình khác; kéo node/resize phải giữ đúng cạnh. Nhãn, màu, arrow và kiểu line ở Thuộc tính.
4. Shift+Click/marquee đa chọn; Ctrl+C/V/X/D, Delete, một Ctrl+Z khôi phục cả gesture và các cạnh liên quan.
5. Space kéo canvas, zoom rồi kéo shape từ palette; thử nhóm/căn chỉnh trong Thuộc tính.
6. **Không đóng/refresh để giữ sơ đồ**: vẫn chỉ có bộ nhớ phiên, lưu thật ở P4. Ctrl+S phải báo rõ P4, không giả saved.

## Phản hồi connector sau triển khai P2

- Chủ dự án phát hiện nối từ neo hình thoi bị đường gấp khúc quay vào hình, và preview cong nhưng cạnh cuối lại gấp khúc.
- Router gấp khúc hiện tôn trọng cả sourcePosition/targetPosition, giữ endpoint trên đúng neo. Đây là sửa hướng thoát/tiếp cận neo, **không phải routing tránh mọi vật cản hoặc neo tự do P3**.
- Mặc định kéo nối là Cong, preview dùng cùng kind với cạnh tạo ra. Preset Mũi tên/Đường thẳng/Hai chiều khi đang chọn cạnh sẽ đổi chính cạnh đó; khi không chọn cạnh sẽ đặt kiểu cho đường mới.
- Giữ nguyên ID, endpoint/port, nhãn, màu khi đổi preset. Undo/Redo khôi phục kiểu/markers; Thuộc tính → Kiểu đường → Cong để đổi lại.
- Unit router: 16 tổ hợp hướng neo + normalization float. Kiểm tra thêm E2E neo trái hình thoi → neo trái Nhập kho, preview cong, đổi preset/Undo/Redo.
- Lượt sửa này: `npm run check` **92/92 unit PASS**, full E2E subpath **60/60 PASS** trên 3 viewport, visual mismatch vẫn **30/0/22 pixels**; không sửa reference hoặc thêm mask.
- Commit sửa `c8cd93f`: [CI 44468826593](https://github.com/tux1cm/DiagramAI/actions/runs/44468826593) và [Pages 44468838095](https://github.com/tux1cm/DiagramAI/actions/runs/44468838095) **SUCCESS**. Live **3/3 PASS**, có tạo cạnh cong/đổi preset Mũi tên/Undo trên site thật. `build.bat --no-pause` và test bản cài Desktop mới cũng **PASS**, gồm cùng thao tác đổi kiểu cạnh.
