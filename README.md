# Personal Productivity Hub

Ứng dụng cá nhân chạy local trên laptop: quản lý Goal/Task theo Contribution, thưởng XP, Level, Reward Shop đổi thưởng đời thực, Streak, cảnh báo và trừ XP khi bỏ lỡ việc (có miễn trừ).

- Yêu cầu: [`docs/requirements/`](docs/requirements/) — Proposal, PRD, 223 BDD scenarios
- Thiết kế: [`docs/design/2026-11-06-architecture.md`](docs/design/2026-11-06-architecture.md)

## Cài đặt

Yêu cầu Node.js ≥ 22.

```bash
npm install
```

## Chạy

Một lệnh chạy cả API và web:

```bash
npm run dev    # API http://127.0.0.1:4317 + Web http://localhost:5173
```

Hoặc chạy riêng từng phần:

```bash
npm run start -w @pph/server   # API: http://127.0.0.1:4317 (chỉ nhận kết nối từ chính máy)
npm run dev -w @pph/web        # Web: http://localhost:5173 (proxy /api → 4317)
```

| Biến môi trường | Mặc định | Ý nghĩa |
|---|---|---|
| `PPH_DATA_DIR` | `./data` (gốc repo) | Thư mục chứa `hub.db` và `backups/` |
| `PPH_PORT` | `4317` | Cổng API |

## Bản desktop (Windows)

Hub đóng gói thành app Electron: chạy nền ở khay hệ thống, thông báo native của Windows, tùy chọn tự khởi động cùng Windows (bật/tắt trong menu khay, mặc định **tắt**).

```bash
npm run desktop:build   # build web + bundle main process → apps/desktop/.stage
npm run desktop:start   # chạy thử (dữ liệu ở apps/desktop/.run-data, không đụng %APPDATA%)
npm run desktop:smoke   # kiểm tra tự động: API + giao diện trong cửa sổ Electron (ẩn), tự thoát
npm run desktop:dist    # tạo bộ cài apps/desktop/release/PPH-Setup-<version>.exe (chỉ tạo file, không chạy)
```

- Mọi cache/tải xuống của quá trình build nằm trong `apps/desktop/.cache/` (gitignored), không ghi vào cache chung của máy.
- Bộ cài (khi bạn tự chạy): cài cho user hiện tại vào `%LOCALAPPDATA%\Programs`, tạo shortcut Desktop/Start Menu; dữ liệu ở `%APPDATA%\Personal Productivity Hub\data`, nhật ký ở `...\logs\hub.log`. Gỡ cài đặt không xóa dữ liệu.
- Cổng mặc định `127.0.0.1:4317` (đổi bằng `PPH_PORT`). Nếu cổng bận (ví dụ `npm run dev` đang chạy), app báo lỗi và thoát.
- Electron đang ghim ở **42.x** vì `better-sqlite3` chưa có bản build sẵn cho Electron mới hơn (biên dịch từ source thất bại do thay đổi API V8). Nâng cấp khi better-sqlite3 hỗ trợ: đổi version trong `apps/desktop/package.json`.
- Chạy Electron từ terminal tích hợp/extension của VS Code: dùng `npm run desktop:start` (script tự bỏ biến `ELECTRON_RUN_AS_NODE` mà VS Code đặt).

## Dữ liệu & backup

- Database SQLite: `data/hub.db`.
- Backup tự động mỗi ngày vào `data/backups/hub-YYYY-MM-DD.db` (giữ 14 bản). Backup ngay: `POST /api/v1/system/backup`.
- Khôi phục: dừng server, copy file backup thành `data/hub.db`, khởi động lại.
- Khi khởi động, server chạy bù các việc định kỳ bị lỡ khi máy tắt (đánh giá phạt, Streak Freeze, cảnh báo).

## Kiểm thử

```bash
npm test             # toàn bộ test: server + web + E2E trên Microsoft Edge (cần Edge cài sẵn)
npx vitest run --project e2e   # chỉ E2E; ảnh chụp từng màn hình ở e2e/.shots/
npm run test:bdd     # chạy test và cập nhật passes/overallPass trong các file BDD JSON
npm run typecheck
```

## Cấu hình nghiệp vụ

Mọi tham số XP, Pool, Level, Penalty, Streak, preset Contribution, múi giờ chỉnh trong màn hình **Settings** (không cần sửa code). Danh mục Goal, lý do bỏ lỡ và phần thưởng đều do người dùng thêm/sửa/xóa.
