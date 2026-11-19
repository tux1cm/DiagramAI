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

Neon SDK/config và mọi dependency bắc cầu cần được đối chiếu LICENSE thực tế trước release. Lockfile hiện tại là `package-lock.json` và `apps/desktop/src-tauri/Cargo.lock`. Không nhúng Inter font hoặc tải font bên ngoài: dùng font fallback hệ thống theo mockup. Không dùng stencil/icon library draw.io hoặc gói Pro.
