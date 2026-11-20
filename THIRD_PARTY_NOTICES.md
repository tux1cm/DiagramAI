# Third-party dependencies — P0 inventory

Đây là inventory ban đầu, chưa phải bộ notice/license hoàn chỉnh để phân phối v1.0. Giữ license gốc của dependency trong mọi gói phát hành theo điều khoản tương ứng.

| Dependency | Vai trò | License khai báo bởi dự án upstream |
|---|---|---|
| React / React DOM | UI runtime | MIT |
| React Flow (`@xyflow/react`, core; không dùng Pro) | Canvas spike | MIT |
| Vite | Web build | MIT |
| Tauri / tauri-build | Desktop shell | MIT OR Apache-2.0 |
| node-postgres (`pg`) | Neon Postgres pool | MIT |
| TypeScript | Type checking | Apache-2.0 |
| ESLint | Lint | MIT |
| Vitest | Unit tests | MIT |
| Playwright | Browser tests | Apache-2.0 |
| pixelmatch | Dev-only visual comparison | ISC |
| pngjs | Dev-only PNG read/write for visual tests | MIT |
| Zod | Runtime document/command validation | MIT |
| jsPDF / svg2pdf.js | PDF vector export | MIT |
| rusqlite / bundled SQLite | Desktop local storage | MIT / public domain (SQLite) |
| tauri-plugin-dialog | Native file dialogs | MIT OR Apache-2.0 |
| Noto Sans Regular/Bold | Vietnamese PNG/PDF export | SIL OFL 1.1 |

Neon SDK/config và mọi dependency bắc cầu cần được đối chiếu LICENSE thực tế trước release. Lockfile hiện tại là `package-lock.json` và `apps/desktop/src-tauri/Cargo.lock`. UI không nhúng Inter: dùng font fallback hệ thống theo mockup. Xuất PNG/PDF dùng Noto Sans, copyright 2018 The Noto Project Authors; toàn văn license được phân phối tại `apps/web/public/fonts/OFL.txt`. Không dùng stencil/icon library draw.io hoặc gói Pro.
