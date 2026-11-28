# Tóm tắt thay đổi — nhánh `calendar` (2026-11-26 → 2026-11-28)

## Giao diện (web + desktop)
- **Công việc**: bảng Kanban 4 cột (Cần làm / Đang làm / Hoàn thành / Đã hủy), kéo thả đổi trạng thái và sắp xếp thủ công; mặc định hiện **Hôm nay**, có lọc theo ngày, tìm kiếm, lọc Goal. Có chế độ danh sách (kéo task sang "Ngày mai" để dời hạn). Bấm một thẻ mở ngăn chi tiết bên phải. Thẻ hiện phiên làm việc gần nhất (📅).
- **Mục tiêu / Tổng quan**: thanh tiến độ được thay bằng thẻ lưới có vòng tròn phần trăm (`GoalCard`).
- **Hoạt động**: timeline theo ngày, lọc nhanh theo khoảng thời gian và nhóm; bộ lọc nâng cao thu gọn.
- **Sửa lỗi bố cục**: sidebar bị cắt khi cuộn, hàng form lệch ở trang Tích hợp.
- **Bộ chọn ngày giờ mới** (`DateTimePicker`): lịch tháng + giờ/phút, dùng cho phiên làm việc, deadline, deadline mới khi review. Đổi giờ bắt đầu thì giờ kết thúc dời theo.
- **Kéo đổi độ rộng** sidebar và ngăn chi tiết (lưu localStorage, nhấp đúp để đặt lại); dưới 768px sidebar thành menu trượt.

## Google Calendar
- Mỗi **phiên làm việc** đồng bộ thành một event trên Google (tên = tên task, "✓ " khi hoàn thành). Google thắng khi xung đột; hủy/xóa task thì gỡ event. Chi tiết thiết kế: `docs/requirements/` và README.
- Hướng dẫn thiết lập: `docs/guides/2026-11-27-google-calendar-setup.md`.
- Đã kiểm tra luồng Google thật với tài khoản phụ (kết nối, đẩy phiên lên lịch).
- Chế độ OAuth **Testing**: phải bấm **Kết nối** lại mỗi 7 ngày (theo tài liệu Google).

## Build / dữ liệu
- Desktop 0.2.5: gồm Kanban, Hoạt động, thẻ Goal, chip lịch, bộ chọn giờ và layout kéo rộng.
- Bản dev dùng dữ liệu riêng `data/hub.db` (đã copy từ dữ liệu thật để thử). Không đồng bộ cùng một tài khoản Google ở cả dev và desktop.
- Thứ tự sắp xếp thủ công của task lưu ở trình duyệt (`pph.taskOrder`), chưa lưu server.
