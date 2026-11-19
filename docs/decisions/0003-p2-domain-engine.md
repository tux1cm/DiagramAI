# ADR 0003 — Domain/commands độc lập React Flow, canvas adapter P2

- Ngày: 2026-11-19.
- Bối cảnh: chủ dự án đã xác nhận P1 PASS và yêu cầu P2.
- Trạng thái: triển khai theo plan; không đổi stack hoặc phạm vi cloud/file.

## Quyết định

1. `packages/diagram-core` chứa registry, Zod schema/validators, migration, commands, clipboard, arrange/group và history store; không import React, React Flow, DOM hoặc Tauri.
2. Document JSON v1 chỉ chứa graph/style/groups/metadata, dùng UUID và world coordinates. Selection, viewport, draft text, clipboard và history là session state, không nhét vào document JSON.
3. `groups` là nhóm logic các node (optional khi parse v1, mặc định rỗng), không tạo node nhóm giả hoặc cộng node count. Chọn một thành viên sẽ chọn nhóm; kéo dựa trên multi-selection của adapter. Chưa làm container/group scaling.
4. Mọi sửa graph qua command batch được validate toàn bộ trước publish. Snapshot/document/history được freeze. Drag/resize là transient geometry interaction, commit thành một transaction; Undo/Redo không phụ thuộc React Flow.
5. `packages/editor` ánh xạ domain sang controlled React Flow v12 custom node/edge, renderer SVG, bốn handles, NodeResizer và inline editor. `measured` của RF nằm trong adapter; khởi tạo/đo DOM không được tạo history.
6. Node/edge label Enter xác nhận, Shift+Enter xuống dòng ở node, Esc hủy, blur commit. Không dùng window.prompt hoặc HTML người dùng.
7. Copy/cut/paste dùng fragment schema với ID remap, luôn có clipboard nội bộ; OS clipboard best-effort khi người dùng chủ động yêu cầu. Automation cố ý chặn OS clipboard để không đọc/ghi clipboard cá nhân.
8. P2 giữ mọi dữ liệu trong bộ nhớ, cảnh báo beforeunload khi có sửa; hash diagnostics không làm mất document/history. Không claim bảo vệ đóng cửa sổ native ở mức P4.
9. File UI/import/export/persistence vẫn P4 như chủ dự án đã chốt. P2 kiểm thử serialization/migration JSON và dùng cùng schema trên Web/Desktop, không giả rằng đã nghiệm thu mở file native/IndexedDB/SQLite.
10. P3 mới làm insert-on-edge, hit-test/guideline/smart routing. P2 chỉ orthogonal/straight/curve cơ bản; không tự chèn hoặc tự xóa cạnh khi thả node lên đường nối.

## Hệ quả

Resize/sửa label người dùng đã hỏi trở thành thao tác thật có Undo ở P2. Ctrl+S không giả lưu: mở thông báo P4 và giữ dữ liệu trong bộ nhớ. Backend Neon health/AI/sync không bị đổi hoặc được gọi tự động bởi thao tác vẽ.
