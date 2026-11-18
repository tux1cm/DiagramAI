# UI contract v1.0 — trích từ reference

Nguồn: `design/reference/DiagramAI_Mockup.html`, bản sao byte-identical với file gốc ở root. Không sửa hai file reference để hợp thức hóa một thiết kế mới.

## Token và kích thước gốc

| Token / vùng | Giá trị |
|---|---|
| bg / panel | `#f5f7fb` / `#fff` |
| ink / muted | `#18233c` / `#7b869c` |
| line | `#e8edf4` |
| blue / blue-light | `#4867f4` / `#eef1ff` |
| green / red | `#199b7b` / `#df6265` |
| Topbar / toolbar / footer | 64 / 55 / 29 px |
| Rail / palette / inspector | 56 / 225 / 324 px |
| Font | Inter, Segoe UI, Arial, sans-serif; base 13px |
| Grid | 18px, chấm `#d8deeb` |
| Breakpoint | 1180 / 930 / 650px |

Topbar: logo, tên dự án, trạng thái lưu, Cloud, Mở/Lưu/Xuất. Rail trái, palette trái, canvas giữa, tab AI/Thuộc tính phải, footer dưới. P0 chỉ thêm nhãn công nghệ tạm; P1 không tự thay layout/spacing/icon/màu.

## Registry thực tế (21 mục, không suy đoán thêm)

- **basic (12):** `rect`, `round`, `ellipse`, `diamond`, `parallelogram`, `hexagon`, `triangle`, `cylinder`, `document`, `cloud`, `note`, `speech`.
- **process (6):** `folder`, `chevron`, `database`, `actor`, `table`, `card`.
- **line (3):** `arrow`, `line`, `bidirectional`.

Ba mục line là công cụ đường nối, không phải ba node shape mới. `cylinder` và `database` dùng chung renderer trong mockup nhưng là hai mục palette khác nhau. Nút text nằm trên toolbar, không thuộc SHAPES registry.

## Baseline

- `reference/DiagramAI_Preview.png`: capture gốc 1366×768.
- `reference/DiagramAI_Preview_1920.png`: capture gốc 1920×1080.
- `reference/DiagramAI_Preview_1280.png`: capture gốc 1280×720.

Chụp bằng Playwright trên Edge Windows; viewport CSS pixels, không phải ảnh vẽ lại. Đây là baseline để chủ dự án review, chưa phải xác nhận visual parity UI React P1. Test P0 chỉ kiểm tra tải reference, cấu trúc mẫu và chụp ảnh; chưa có pixel-diff regression cho editor sản phẩm.
