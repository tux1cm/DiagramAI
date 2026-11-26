# P5 — Căn đầu mũi tên trên nhánh cong ngắn

Ngày 2026-11-26. **Đã triển khai Web và build installer production; kiểm tra native PASS.**

- Tái hiện ảnh người dùng bằng một hình bo góc nối hai hình chữ nhật cách nhau 46px theo chiều dọc, lệch ngang 187px. Bezier cũ chỉ có tiếp tuyến đúng ngay điểm cuối; thân cong đi vào cạnh bên của đầu tên khi nhánh quá ngắn/rộng.
- Thêm đoạn dẫn thẳng theo hướng port ở cả hai đầu đường cong, co theo khoảng trống để không chồng nhau. Đầu nhọn marker neo đúng `refX=10`; marker dùng `userSpaceOnUse` và cỡ theo nét gốc, không tự phình khi chọn/tô nổi đường nối. Màu đầu tên thống nhất với thân.
- Canvas và SVG xuất dùng cùng hình học/marker. Không đổi schema, tọa độ node, port, dữ liệu bản vẽ, cơ chế đồng bộ, API hoặc Neon. Bản vẽ cũ tự hiển thị sửa sau cập nhật, không cần vẽ lại/đổi file.
- Lint/typecheck **PASS**. `npm run test:arrows`: **37 unit/boundary PASS**, gồm 16 tổ hợp hướng đường cong, nhánh ngắn, endpoint trùng, routing vuông góc và export dùng đúng cùng path.
- Kiểm tra Web trên **1280, 1366, 1920: 3/3 PASS**: toàn bộ đầu tên nằm trên đoạn vào thẳng, tip ở giữa mép trên target, không đổi cỡ khi chọn. Đã xem screenshot nhánh giống ảnh báo lỗi.
- CI/Pages thêm riêng các bài arrow geometry/export và Web focused; không chạy full regression trước P7. Native suite mới `scripts/test-desktop.ps1 -Scope arrows` chỉ dùng profile local/installer tạm, không gọi cloud hoặc dùng kho người dùng.
- Source `7aba3a8`: CI [45725573799](https://github.com/tux1cm/DiagramAI/actions/runs/45725573799), Pages [45725593516](https://github.com/tux1cm/DiagramAI/actions/runs/45725593516) **SUCCESS**. Native installer **1/1 PASS**, 3,0 giây testcase / 4,5 giây harness; đo điểm cuối/14px tiếp cận, chọn đường, và xác nhận payload lưu native giữ nguyên, không request cloud.
- Installer của lượt này: **3.935.577 bytes**, `testBuild=false`, SHA-256 `ca39d05d4ea35765725c4f0295914a4a34dde14838947d85efb1e9266e90a80e`. Evidence/screenshot: [`evidence/p5-arrow-alignment/`](evidence/p5-arrow-alignment/). Bản tiếp theo có thể gộp thêm link gọn nhưng không thay hình học này.
