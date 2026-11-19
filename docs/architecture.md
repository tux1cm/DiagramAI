# Kiến trúc — P0

Nguồn yêu cầu: `plan.md` v2.0. Không đổi các quyết định D01–D18.

## Kiến trúc đích

```text
React UI + editor adapter → diagram-core (model / commands / history)
           ├─ Web: GitHub Pages + IndexedDB adapter
           └─ Windows: Tauri 2 + SQLite / OS file adapter
                      ↓ HTTPS capability (sau P0)
              Neon Functions → PostgreSQL
                      └─ Gemini router (P6)
```

`diagram-core` không phụ thuộc React Flow, React hay Tauri. Command chung cho người dùng và AI. Credential không nằm trong document. Local saved và cloud synced là hai trạng thái độc lập. CORS không thay thế xác thực.

## Phần đã dựng tại P0

- npm workspaces, TypeScript strict, ESLint, Vitest, Playwright, lockfile.
- Web entry và Tauri trỏ cùng frontend; không sao chép một bản UI cho Desktop.
- Shell React hiển thị **mockup nguyên bản trong iframe sandbox**. Đây chỉ là bootstrap P0, không phải hiện thực UI P1 hay engine production. Không cấp quyền IPC/native cho reference.
- Hash route `#/spike`: smoke test React Flow 12.12.1 và kiểm tra health có chủ đích.
- Function `/v1/health`: GET kiểm tra `SELECT 1`, OPTIONS không query DB; allowlist origin chính xác, no-store, response không chứa DB error/secret.
- Không tạo tài khoản, bảng dữ liệu, dự án cloud, API AI, migrations hoặc dịch vụ có phí.

## Ranh giới chưa kiểm chứng

Unit test dùng database dependency giả chỉ chứng minh handler; ngoài ra đã có **live test Pages → Neon → SELECT 1** trên project có sẵn. E2E Web local/live dùng Edge, CI dùng Chromium; riêng `test:desktop` cài/gỡ NSIS và kết nối WebView2 qua CDP loopback với profile riêng để kiểm tra viewport/minimize/navigation. GitHub CI và Pages workflow đã có bằng chứng SUCCESS. Đây là smoke P0, không phải bảo đảm production security, offline persistence hay engine v1.

## Quy ước để triển khai P2 trở đi

- TypeScript camelCase; React component PascalCase; file module kebab-case (component có thể PascalCase).
- Tài liệu `.diagramai`: `format: "diagramai"`, `formatVersion: 1`, `documentId`, node/edge IDs UUID qua `crypto.randomUUID()`; không dùng counter của mockup.
- Port ID `top/right/bottom/left`; edge tham chiếu ID node và port, không lưu tọa độ màn hình.
- World-space coordinates; selection, zoom và pan là UI state, không trộn vào graph payload.
- Thời gian ISO-8601 UTC; API `/v1`; API/schema migration phải tương thích có version.
- Zod schema trung tâm và command transaction triển khai ở P2, không coi ví dụ schema trong plan là code sẵn có.
- `VITE_*` chỉ có URL/base path công khai. Neon `.env`, `.neon` và token không commit.

## Quản lý thay đổi

### Cập nhật P1 — 19/11/2026

P0 đã được chủ dự án xác nhận PASS. Trang chính hiện dùng `AppShell` → `EditorShell` và các component React, không còn reference iframe. `packages/ui/src/editor/fixture.ts` là in-memory view-model để nghiệm thu layout/selection/tô màu, không phải domain schema production. CSS/icon/SVG port từ reference bất biến; có visual comparison Web và WebView2. Diagnostics `#/spike` và health backend được giữ nguyên. Xem `docs/p1-status.md` và ADR 0002; chưa triển khai P2/P4/P5/P6.

P0 chỉ được PASS sau khi đủ Web thật + EXE thật + Neon/DB thật + review baseline. Nếu Neon beta không đạt yêu cầu, ghi blocker và xin quyết định; không tự chuyển sang Worker/backend khác. Chưa bắt đầu P1 khi P0 còn blocking.
