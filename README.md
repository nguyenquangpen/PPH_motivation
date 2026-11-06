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
