# Personal Productivity Hub
## Product Specification — Version 1.0

## 1. Tổng quan sản phẩm

### 1.1. Giới thiệu

Personal Productivity Hub là một hệ thống quản lý mục tiêu, công việc và thời gian cá nhân, kết hợp cơ chế gamification nhằm duy trì động lực và theo dõi tiến độ phát triển dài hạn.

Hệ thống đóng vai trò là trung tâm quản lý (Central Hub), kết nối với các ứng dụng cá nhân khác để tự động ghi nhận hoạt động và cập nhật tiến độ.

Ví dụ:

- Ứng dụng học tiếng Nhật ghi nhận số từ vựng đã học.
- Personal Productivity Hub nhận dữ liệu và cập nhật tiến độ mục tiêu học 1.000 từ vựng.
- Người dùng hoàn thành một công việc nghiên cứu, hệ thống cộng điểm tiến độ và trao thưởng.
- Người dùng tạo Task trên Hub, hệ thống đồng bộ công việc lên Google Calendar.
- Khi lịch Google Calendar thay đổi, Hub cập nhật lại thời gian thực hiện Task tương ứng.

### 1.2. Mục tiêu sản phẩm

Hệ thống cần giải quyết 5 vấn đề chính:

1. **Goal Tracking:** Theo dõi mục tiêu dài hạn, milestone và tiến độ hoàn thành.
2. **Task Management:** Quản lý công việc hằng ngày, mức độ ưu tiên và đóng góp của từng công việc vào mục tiêu.
3. **Time Management:** Quản lý thời gian thực hiện, tích hợp hai chiều với Google Calendar.
4. **Gamification:** Tạo động lực thông qua XP, Reward, Streak và các cơ chế phạt phù hợp.
5. **Application Integration:** Kết nối các ứng dụng bên ngoài để tự động ghi nhận tiến độ.

### 1.3. Đối tượng sử dụng

- Hệ thống phục vụ một người dùng duy nhất.
- Không cần xây dựng chức năng đăng ký nhiều tài khoản, phân quyền RBAC hoặc quản lý tổ chức.
- Có thể mở rộng khả năng tích hợp trong tương lai, nhưng không cần thiết kế theo hướng SaaS đa người dùng ở giai đoạn đầu.

### 1.4. Nguyên tắc thiết kế

- Đơn giản, dễ sử dụng, không biến quản lý công việc thành một công việc khác.
- Tiến độ mục tiêu phải phản ánh mức độ đóng góp thực tế, không chỉ đếm số Task hoàn thành.
- Reward phải tương xứng với giá trị và công sức của công việc.
- Không phạt người dùng khi hệ thống lập lịch không hợp lý hoặc thời gian thực tế không khả thi.
- Tự động hóa các hoạt động có thể tự động hóa thông qua tích hợp.
- Hub là nguồn dữ liệu chính cho Goal, Task, Contribution và Reward.
- Google Calendar là nguồn dữ liệu chính cho lịch và thời gian được lên lịch.

---

# 2. Tổng quan chức năng

Hệ thống bao gồm các module chính:

| Module | Chức năng |
|---|---|
| Dashboard | Tổng quan hoạt động và tiến độ cá nhân |
| Goal Management | Quản lý mục tiêu và tiến độ |
| Task Management | Tạo, cập nhật và theo dõi công việc |
| Milestone Management | Quản lý các cột mốc quan trọng |
| Calendar Integration | Đồng bộ Google Calendar hai chiều |
| Scheduling Assistant | Đề xuất thời gian thực hiện Task |
| Reward System | XP, điểm thưởng và phần thưởng |
| Penalty System | Cảnh báo và cơ chế xử lý công việc bỏ lỡ |
| Streak & Check-in | Theo dõi chuỗi hoạt động |
| Notification | Nhắc nhở và cảnh báo |
| Integration Management | Kết nối các ứng dụng bên ngoài |
| Activity History | Lưu lịch sử hoạt động và tiến độ |

---

# 3. Goal Management

## 3.1. Khái niệm Goal

Goal là mục tiêu dài hạn mà người dùng muốn đạt được.

Ví dụ:

- Đạt JLPT N2.
- Hoàn thành nghiên cứu khoa học.
- Phát triển công việc Upwork.
- Phát triển sự nghiệp AI Engineer.
- Thử nghiệm xây dựng kênh YouTube.

Mỗi Goal cần có:

| Thuộc tính | Mô tả |
|---|---|
| id | Định danh |
| title | Tên mục tiêu |
| description | Mô tả chi tiết |
| category | Nhóm mục tiêu |
| status | Trạng thái |
| start_date | Ngày bắt đầu |
| target_date | Ngày dự kiến hoàn thành |
| progress | Tiến độ hiện tại |
| target_contribution | Tổng mức đóng góp cần đạt |
| icon/color | Biểu tượng hoặc màu sắc |
| created_at | Thời điểm tạo |
| updated_at | Thời điểm cập nhật |

## 3.2. Phân loại Goal

Cho phép người dùng tự tạo các nhóm mục tiêu.

Một số nhóm mặc định:

- Career.
- Education.
- Research.
- Finance.
- Business.
- Personal Development.
- Health.
- Other.

Không giới hạn người dùng trong những nhóm mặc định.

## 3.3. Goal Progress

Tiến độ Goal không được tính bằng số lượng Task hoàn thành.

Thay vào đó, mỗi Task có một giá trị Contribution thể hiện mức đóng góp của Task đó đối với Goal.

Ví dụ:

Goal: Học 1.000 từ vựng tiếng Nhật.

Target Contribution: 1.000 điểm.

| Task | Contribution | Status |
|---|---:|---|
| Học 100 từ vựng | 100 | Completed |
| Ôn tập 50 từ | 30 | Completed |
| Học 200 từ vựng | 200 | In Progress |
| Luyện nghe | 50 | Pending |

Công thức:

```text
Progress (%) =
    Completed Contribution / Target Contribution * 100
```

Ví dụ:

```text
Completed Contribution = 130
Target Contribution = 1000

Progress = 13%
```

Yêu cầu:

- Contribution phải do người dùng cấu hình.
- Người dùng có thể thay đổi Contribution của Task.
- Tiến độ không vượt quá 100% khi hiển thị tiến độ hoàn thành mục tiêu.
- Nếu tổng đóng góp vượt Target Contribution, hệ thống cần ghi nhận phần vượt nhưng không hiển thị tiến độ vượt 100% ở thanh tiến độ thông thường.
- Khi Task thay đổi trạng thái hoặc Contribution, tiến độ Goal phải được tính lại chính xác.
- Không được cộng trùng Contribution khi nhận cùng một sự kiện nhiều lần.
- Lưu lịch sử thay đổi để có thể truy vết tiến độ.

Đối với Goal có dữ liệu định lượng trực tiếp từ ứng dụng bên ngoài, chẳng hạn số từ vựng đã học, Hub cần hỗ trợ cập nhật Contribution từ dữ liệu được tích hợp. Không bắt buộc người dùng phải tạo thủ công từng Task cho mọi hoạt động nhỏ.

## 3.4. Goal Status

Các trạng thái:

- Not Started.
- Active.
- Paused.
- Completed.
- Archived.

Người dùng có thể chủ động thay đổi trạng thái.

Khi Goal Completed:
- Lưu thời điểm hoàn thành.
- Ghi nhận tổng Contribution.
- Kích hoạt phần thưởng hoàn thành Goal nếu có cấu hình.
- Không tự động xóa các Task liên quan.

## 3.5. Goal Deadline

Goal có thể có Target Date.

Hệ thống cần:
- Hiển thị thời gian còn lại.
- Cảnh báo khi gần đến hạn.
- Cảnh báo khi tiến độ thấp hơn mức kỳ vọng.
- Cho phép thay đổi Target Date.
- Không tự động kết luận Goal thất bại chỉ vì quá hạn.

---

# 4. Task Management

## 4.1. Khái niệm Task

Task là một công việc cụ thể cần được thực hiện.

Tất cả công việc đều sử dụng chung một loại Task. Không tách riêng Core Task và Supporting Task thành hai entity hoặc hai loại dữ liệu khác nhau.

Việc phân biệt công việc quan trọng hay phụ được thể hiện qua các thuộc tính như:

- Priority.
- Contribution.
- Estimated Duration.
- Deadline.
- Goal Association.

Ví dụ:

| Task | Priority | Contribution |
|---|---|---:|
| Hoàn thành nghiên cứu | High | 100 |
| Học 20 từ tiếng Nhật | Medium | 20 |
| Tìm kiếm khách hàng Upwork | High | 80 |
| Đọc tài liệu tham khảo | Low | 10 |

## 4.2. Task Attributes

| Thuộc tính | Mô tả |
|---|---|
| id | Định danh Task |
| title | Tên công việc |
| description | Mô tả |
| status | Trạng thái |
| priority | Mức độ ưu tiên |
| contribution | Mức đóng góp vào Goal |
| goal_id | Goal liên quan, có thể null |
| estimated_duration | Thời lượng dự kiến |
| scheduled_start | Thời gian bắt đầu đã lên lịch |
| scheduled_end | Thời gian kết thúc đã lên lịch |
| actual_duration | Thời lượng thực tế |
| deadline | Hạn hoàn thành |
| completed_at | Thời điểm hoàn thành |
| created_at | Thời điểm tạo |
| updated_at | Thời điểm cập nhật |

Các trường về thời lượng sử dụng đơn vị phút.

## 4.3. Priority

Priority thể hiện mức độ quan trọng hoặc cấp thiết của Task.

Các mức mặc định:

- Critical.
- High.
- Medium.
- Low.

Priority và Contribution là hai thuộc tính độc lập.

Ví dụ:

- Một Task có Priority High nhưng Contribution nhỏ vì nó chỉ là việc cần xử lý gấp.
- Một Task có Priority Medium nhưng Contribution lớn vì nó đóng góp đáng kể vào mục tiêu dài hạn.

Không sử dụng Priority để tự động tính Contribution.

## 4.4. Contribution

Contribution thể hiện giá trị đóng góp của Task vào Goal.

Người dùng có thể nhập trực tiếp điểm đóng góp.

Có thể cung cấp các preset để thao tác nhanh:

- Major.
- Medium.
- Minor.

Các preset chỉ là giá trị gợi ý; người dùng được phép thay đổi.

Một Task có thể:
- Gắn với một Goal.
- Không gắn với Goal nào nếu là công việc độc lập.

Ở phiên bản đầu tiên, nên giới hạn một Task chỉ gắn với một Goal để tránh phức tạp trong tính toán tiến độ.

## 4.5. Task Status

Các trạng thái:

```text
TODO
IN_PROGRESS
COMPLETED
CANCELLED
```

Luồng cơ bản:

```text
TODO -> IN_PROGRESS -> COMPLETED
  |          |
  |          -> CANCELLED
  |
  -> CANCELLED
```

Yêu cầu:

- Chỉ Task Completed mới được tính Contribution vào tiến độ Goal.
- Task Cancelled không được tính Contribution.
- Task có thể được chuyển từ Completed về trạng thái chưa hoàn thành nếu người dùng thao tác hoàn tác.
- Khi hoàn tác, hệ thống phải điều chỉnh Contribution và Reward tương ứng.
- Lưu lại lịch sử thay đổi trạng thái.

## 4.6. Task Creation

Người dùng có thể tạo Task từ Hub.

Thông tin tối thiểu:
- Title.
- Priority.
- Goal liên quan (không bắt buộc).
- Contribution.
- Estimated Duration.
- Deadline (không bắt buộc).

Thông tin lịch:
- Scheduled Start.
- Scheduled End.

Người dùng có thể tạo Task trước rồi mới lên lịch.

Sau khi tạo Task:
- Task xuất hiện trong danh sách công việc.
- Nếu có lịch thực hiện, Hub tạo hoặc liên kết Calendar Event trên Google Calendar.
- Nếu Task có Goal, hệ thống liên kết Task với Goal.

## 4.7. Task Completion

Khi người dùng hoàn thành Task:

1. Cập nhật Status thành Completed.
2. Ghi nhận Completed At.
3. Cập nhật Goal Progress.
4. Tính Reward.
5. Cập nhật Streak nếu đủ điều kiện.
6. Kiểm tra các Milestone có thể được hoàn thành.
7. Gửi Notification nếu cần.
8. Đồng bộ trạng thái với Google Calendar nếu Task có Calendar Event liên kết.

Việc hoàn thành Task phải được xử lý theo cách idempotent: một Task không được nhận thưởng hoặc cộng Contribution nhiều lần chỉ vì cùng một thao tác được gửi lại.

---

# 5. Milestone Management

## 5.1. Khái niệm

Milestone là cột mốc quan trọng trong quá trình thực hiện Goal.

Ví dụ Goal: Đạt JLPT N2.

Các Milestone:

1. Hoàn thành N5.
2. Hoàn thành N4.
3. Hoàn thành N3.
4. Hoàn thành N2.

Milestone có thể được gắn với:
- Một Goal.
- Một hoặc nhiều Task liên quan.
- Một mức Contribution hoặc điều kiện hoàn thành.

## 5.2. Milestone Attributes

| Thuộc tính | Mô tả |
|---|---|
| id | Định danh |
| goal_id | Goal liên quan |
| title | Tên Milestone |
| description | Mô tả |
| target_date | Ngày dự kiến |
| status | Trạng thái |
| reward_config | Cấu hình phần thưởng |
| completed_at | Thời điểm hoàn thành |

## 5.3. Milestone Completion

Khi Milestone hoàn thành:

- Cập nhật trạng thái.
- Lưu thời điểm hoàn thành.
- Trao thưởng Milestone nếu có cấu hình.
- Hiển thị thành tựu trên Dashboard.
- Ghi nhận Activity History.

Không mặc định tất cả Milestone đều tự động hoàn thành theo phần trăm Goal. Người dùng có thể cấu hình điều kiện hoàn thành cụ thể.

---

# 6. Google Calendar Integration

## 6.1. Mục tiêu

Google Calendar là ứng dụng lịch chính của người dùng.

Hub không cần xây dựng một hệ thống Calendar độc lập thay thế Google Calendar.

Thay vào đó, Hub quản lý Task và đồng bộ lịch với Google Calendar theo hai chiều.

## 6.2. Nguyên tắc sở hữu dữ liệu

Hub quản lý:

- Task Title và Description.
- Goal Association.
- Contribution.
- Priority.
- Task Status.
- Estimated Duration.
- Reward.

Google Calendar quản lý:

- Calendar Event.
- Scheduled Start.
- Scheduled End.
- Calendar ID.
- Các thông tin lịch do người dùng chỉnh sửa trực tiếp.

Hub cần lưu mapping giữa Task nội bộ và Calendar Event bên ngoài.

Thông tin mapping:

```text
task_id
google_calendar_event_id
google_calendar_id
last_synced_at
sync_status
external_updated_at
```

## 6.3. Two-way Synchronization

### Case 1: Tạo Task từ Hub

```text
User creates Task
        |
        v
Hub saves Task
        |
        v
Task has scheduled time?
        |
        v
Create Google Calendar Event
        |
        v
Save Google Event ID
        |
        v
Sync completed
```

### Case 2: Thay đổi lịch từ Google Calendar

Ví dụ người dùng thay đổi thời gian của một Task trực tiếp trên Google Calendar.

Hệ thống cần:
1. Nhận biết thay đổi từ Google Calendar.
2. Xác định Calendar Event tương ứng với Task.
3. Cập nhật Scheduled Start và Scheduled End của Task.
4. Cập nhật trạng thái đồng bộ.
5. Không tạo thêm Task mới.

### Case 3: Thay đổi lịch từ Hub

Khi người dùng thay đổi thời gian Task trong Hub:
- Cập nhật Task.
- Cập nhật Calendar Event tương ứng.
- Không tạo Event mới nếu Event đã tồn tại.

### Case 4: Hoàn thành Task

Khi Task được hoàn thành trong Hub:
- Đồng bộ trạng thái nếu có biểu diễn trạng thái tương ứng trong Calendar.
- Không xóa Event mặc định.
- Giữ lại lịch sử công việc đã thực hiện.

Nếu người dùng hoàn thành Task từ một giao diện bên ngoài, Hub chỉ cập nhật khi có một thao tác hoặc nguồn dữ liệu rõ ràng thể hiện trạng thái hoàn thành. Không được suy luận rằng một Event đã kết thúc đồng nghĩa với Task đã hoàn thành.

### Case 5: Xóa Event trên Google Calendar

Nếu người dùng xóa Calendar Event:
- Không tự động xóa Task.
- Gỡ hoặc đánh dấu mapping là đã bị xóa bên ngoài.
- Giữ Task trong Hub.
- Thông báo hoặc cung cấp lựa chọn tạo lại lịch.

### Case 6: Xóa Task trên Hub

Nếu người dùng xóa Task:
- Ưu tiên Archive hoặc Soft Delete.
- Nếu có Event liên kết, yêu cầu hoặc áp dụng chính sách xóa Event đã cấu hình.
- Không xóa các Calendar Event không được Hub quản lý.

## 6.4. Calendar Event và Task

Không phải tất cả Event trong Google Calendar đều là Task.

Ví dụ:
- Cuộc họp.
- Sinh nhật.
- Lịch học.
- Cuộc hẹn cá nhân.

Các Event này không nên tự động biến thành Task.

Hub cần hỗ trợ:
- Chỉ đồng bộ những Event do Hub tạo.
- Cho phép người dùng chọn Event bên ngoài để liên kết với Task.
- Cho phép phân loại Event nếu muốn quản lý chúng trong Hub.

## 6.5. Đồng bộ và xử lý xung đột

Yêu cầu:

- Sử dụng cơ chế đồng bộ tăng dần của Google Calendar API khi phù hợp.
- Có thể dùng webhook/push notification để phát hiện thay đổi, kết hợp cơ chế polling hoặc incremental sync để đảm bảo dữ liệu không bị bỏ sót.
- Có cơ chế retry khi API lỗi.
- Có cơ chế phát hiện Event đã bị xóa.
- Không tạo Event trùng lặp.
- Lưu lịch sử đồng bộ.
- Có màn hình hoặc trạng thái cho biết kết nối Calendar đang hoạt động hay lỗi.

Khi hai phía thay đổi gần như đồng thời:
- Không âm thầm ghi đè dữ liệu.
- Xác định các trường bị thay đổi.
- Áp dụng chính sách conflict resolution rõ ràng.
- Nếu không thể tự giải quyết an toàn, đánh dấu cần người dùng xử lý.

## 6.6. Google Calendar Authentication

Sử dụng Google OAuth 2.0.

Yêu cầu:
- Chỉ xin các quyền cần thiết.
- Lưu và làm mới access token an toàn.
- Không lưu thông tin bí mật trực tiếp trong source code.
- Có chức năng ngắt kết nối và kết nối lại.

---

# 7. Scheduling Assistant

## 7.1. Mục tiêu

Scheduling Assistant hỗ trợ người dùng sắp xếp thời gian thực hiện Task hợp lý.

Hệ thống sử dụng chế độ Suggest, không tự động quyết định toàn bộ lịch.

Người dùng vẫn là người quyết định thời gian cuối cùng.

## 7.2. Input

Scheduling Assistant sử dụng:

- Estimated Duration của Task.
- Priority.
- Deadline.
- Goal.
- Contribution.
- Các khoảng thời gian trống trong Google Calendar.
- Các giới hạn về giờ làm việc và thời gian nghỉ do người dùng thiết lập.

## 7.3. Đề xuất lịch

Ví dụ:

Task: Hoàn thành báo cáo nghiên cứu.

Estimated Duration: 120 phút.

Deadline: Thứ Sáu.

Google Calendar hiện có:
- Thứ Tư: Trống 14:00–16:00.
- Thứ Năm: Trống 09:00–10:00.
- Thứ Sáu: Trống 15:00–17:00.

Hệ thống đề xuất:

```text
Option 1:
Wednesday 14:00 - 16:00

Option 2:
Thursday 09:00 - 10:00
Thursday 14:00 - 15:00
```

Người dùng có thể:
- Chọn một đề xuất.
- Chỉnh sửa thời gian.
- Bỏ qua đề xuất.
- Tự lên lịch thủ công.

## 7.4. Scheduling Feasibility Check

Đây là chức năng quan trọng.

Hệ thống cần kiểm tra xem thời gian được lên lịch có đủ để hoàn thành Task hay không.

Ví dụ:

```text
Task:
Estimated Duration = 120 minutes

Calendar:
Scheduled Duration = 30 minutes
```

Kết quả:

```text
Warning:
Scheduled time is insufficient.

Estimated: 120 minutes
Scheduled: 30 minutes
Missing: 90 minutes
```

Hệ thống cần:

- So sánh Estimated Duration và Scheduled Duration.
- Cảnh báo nếu Scheduled Duration thấp hơn đáng kể.
- Cảnh báo nếu Task có Contribution lớn nhưng chưa được phân bổ đủ thời gian.
- Cảnh báo nếu lịch làm việc bị quá tải.
- Đề xuất chia Task thành các phiên nhỏ.
- Cho phép người dùng chấp nhận lịch hiện tại nếu họ có lý do riêng.

Không tự động thay đổi lịch của người dùng.

## 7.5. Actual Duration

Người dùng có thể ghi nhận thời gian thực tế thực hiện Task.

Hệ thống có thể sử dụng dữ liệu này để:
- So sánh Estimated Duration và Actual Duration.
- Tính sai lệch thời lượng.
- Gợi ý thời gian hợp lý hơn cho các Task tương tự.
- Cải thiện các đề xuất lịch trong tương lai.

Không yêu cầu người dùng phải bật tính năng theo dõi thời gian liên tục.

---

# 8. Reward System

## 8.1. Mục tiêu

Reward System tạo động lực bằng cách ghi nhận thành quả sau khi người dùng hoàn thành công việc.

Reward phải phản ánh:
- Mức Contribution.
- Khối lượng công việc.
- Mức độ quan trọng của thành tựu.
- Tần suất hoàn thành các công việc nhỏ.

Không nên chỉ thưởng theo số lượng Task.

## 8.2. Các loại Reward

### A. Immediate Reward

Dành cho Task có Contribution lớn.

Ví dụ:

```text
Task Contribution: 100
Reward: 100 XP
```

Khi hoàn thành Task, người dùng nhận XP ngay lập tức.

### B. Accumulated Reward

Dành cho các Task nhỏ.

Ví dụ:

```text
Task A: 10 Contribution
Task B: 10 Contribution
Task C: 10 Contribution

Accumulated Contribution: 30
```

Khi đạt ngưỡng:
- Trao thưởng một lần.
- Reset hoặc trừ phần Contribution đã dùng để tính thưởng theo cấu hình.
- Giữ lịch sử các Task đã đóng góp vào Reward.

Mục đích là khuyến khích người dùng hoàn thành nhiều công việc nhỏ thay vì chỉ tập trung vào công việc lớn.

### C. Milestone Reward

Trao thưởng khi hoàn thành Milestone.

Ví dụ:
- Hoàn thành N5.
- Hoàn thành một giai đoạn nghiên cứu.
- Đạt một mốc doanh thu.
- Hoàn thành một dự án quan trọng.

### D. Goal Completion Reward

Trao thưởng khi Goal hoàn thành.

Phần thưởng có thể lớn hơn Reward của Task thông thường.

## 8.3. Reward Configuration

Người dùng có thể điều chỉnh:

- XP cho Task lớn.
- Ngưỡng tích lũy Task nhỏ.
- XP khi đạt ngưỡng.
- XP khi hoàn thành Milestone.
- XP khi hoàn thành Goal.

Không hardcode tất cả các quy tắc thưởng trong business logic.

## 8.4. Reward và Duration

Reward cần cân nhắc Contribution và Duration.

Ví dụ:

```text
Task A:
Contribution = 100
Estimated Duration = 120 minutes

Task B:
Contribution = 100
Estimated Duration = 15 minutes
```

Hai Task có Contribution bằng nhau nhưng khối lượng thời gian dự kiến khác nhau.

Hệ thống cần cho phép cấu hình công thức Reward có xét đến Duration, thay vì mặc định Contribution là yếu tố duy nhất.

Một công thức ban đầu có thể là:

```text
Base Reward = Contribution * Reward Multiplier

Duration Factor =
    Estimated Duration / Reference Duration

Final Reward =
    Base Reward * Duration Factor
```

Đây chỉ là công thức khởi điểm. Cần có giới hạn trên/dưới để tránh Reward quá lớn hoặc quá nhỏ.

Không được tự động thưởng nhiều chỉ vì người dùng khai báo Estimated Duration cao. Cần tránh cơ chế có thể bị khai thác bằng cách khai khống thời lượng.

## 8.5. Reward History

Mọi lần trao thưởng phải được ghi nhận.

Thông tin:

- Reward ID.
- Source Task/Milestone/Goal.
- Reward Type.
- XP Amount.
- Reason.
- Created At.

Không chỉ lưu tổng XP hiện tại.

Tổng XP phải có thể đối chiếu với lịch sử giao dịch.

Nếu Task bị hoàn tác, hệ thống phải có chính sách điều chỉnh Reward rõ ràng, ví dụ tạo một giao dịch đảo ngược thay vì xóa lịch sử cũ.

---

# 9. Penalty System

## 9.1. Mục tiêu

Penalty System không nhằm trừng phạt người dùng một cách cứng nhắc.

Mục tiêu là giúp người dùng nhận ra khi kế hoạch bị bỏ lỡ và có trách nhiệm điều chỉnh.

## 9.2. Các tình huống

### Task nhỏ bị bỏ lỡ

- Không nhận Reward.
- Có thể nhắc nhở.
- Có thể đề xuất chuyển lịch.

### Task quan trọng bị bỏ lỡ

- Gửi cảnh báo.
- Hiển thị mức độ ảnh hưởng đến Goal.
- Yêu cầu người dùng xem xét lại kế hoạch.
- Có thể áp dụng Penalty nếu người dùng đã bật cơ chế này.

### Task bị bỏ lỡ do lịch quá tải

Không tự động áp dụng Penalty.

Hệ thống cần xác định hoặc cho phép người dùng xác nhận nguyên nhân:
- Calendar bị quá tải.
- Có việc phát sinh.
- Ước lượng thời gian sai.
- Người dùng chủ động trì hoãn.

Nếu nguyên nhân đến từ việc lập lịch không hợp lý, ưu tiên đề xuất điều chỉnh thay vì trừ điểm.

## 9.3. Các loại Penalty có thể hỗ trợ

- XP Deduction.
- Streak Reset.
- Missed Task Warning.
- Weekly Review.
- Temporary Reward Restriction.

Các loại Penalty cần bật/tắt được.

Không bắt buộc triển khai tất cả ngay từ đầu.

Không sử dụng phạt tiền thật trong MVP. Nếu tương lai triển khai cơ chế cam kết tài chính, phải là tính năng opt-in riêng biệt, có giới hạn và xác nhận rõ ràng.

## 9.4. Fairness

Các nguyên tắc bắt buộc:

- Không phạt khi người dùng chủ động Pause Goal.
- Không phạt khi Task bị hủy hợp lệ.
- Không phạt vì lỗi đồng bộ hoặc lỗi hệ thống.
- Không phạt vì lịch do Scheduling Assistant đề xuất không khả thi.
- Không tự động phạt ngay khi vừa quá Deadline.
- Cho phép người dùng giải thích hoặc bỏ qua Penalty trong các trường hợp hợp lý.

---

# 10. Streak & Check-in

## 10.1. Mục tiêu

Streak khuyến khích duy trì thói quen và hoạt động đều đặn.

Không tính Streak dựa trên số lần mở ứng dụng.

## 10.2. Các loại Streak

### App Streak

Duy trì Check-in mỗi ngày.

### Productivity Streak

Duy trì hoạt động có ý nghĩa, chẳng hạn hoàn thành ít nhất một Task hoặc ghi nhận một phiên làm việc hợp lệ.

### Goal Streak

Duy trì tiến độ đối với một Goal cụ thể.

## 10.3. Quy tắc

- Mỗi ngày chỉ tính tối đa một lần cho mỗi loại Streak.
- Phải sử dụng múi giờ người dùng.
- Không tính việc mở ứng dụng nhiều lần là nhiều hoạt động.
- Có thể hỗ trợ Grace Day hoặc Streak Freeze.
- Người dùng cần nhìn thấy Streak hiện tại và lịch sử hoạt động.

---

# 11. Notification System

## 11.1. Mục tiêu

Hệ thống gửi thông báo để nhắc nhở và giúp người dùng duy trì kế hoạch.

## 11.2. Notification Types

### Task Reminder

Nhắc nhở trước thời gian thực hiện Task.

### Deadline Warning

Cảnh báo khi Task hoặc Goal sắp đến hạn.

### Missed Task

Thông báo khi Task đã quá hạn nhưng chưa hoàn thành.

### Goal Progress

Thông báo khi đạt một mốc tiến độ quan trọng.

### Check-in Reminder

Nhắc người dùng Check-in nếu chưa ghi nhận hoạt động trong ngày.

### External App Inactivity

Cảnh báo khi một ứng dụng đã kết nối không gửi hoạt động trong thời gian dài.

Ví dụ:

```text
Japanese Learning App

Expected activity: Daily
Last activity: 3 days ago

Notification:
You haven't recorded Japanese learning activity
for 3 days.
```

### Calendar Sync Error

Thông báo khi đồng bộ Google Calendar gặp lỗi kéo dài hoặc cần người dùng xử lý.

## 11.3. Notification Configuration

Người dùng có thể cấu hình:

- Enable/Disable từng loại thông báo.
- Thời điểm gửi.
- Quiet Hours.
- Tần suất nhắc lại.
- Kênh nhận thông báo.

## 11.4. Notification Channels

Ưu tiên triển khai theo thứ tự:

1. In-app Notification.
2. Telegram.
3. Windows Desktop Notification hoặc Browser Notification.
4. Email nếu cần trong tương lai.

Không cần triển khai mọi kênh ngay từ MVP.

## 11.5. Notification Rules

- Không gửi nhắc nhở Task đã hoàn thành.
- Không gửi thông báo trùng lặp liên tục.
- Cho phép đánh dấu đã đọc.
- Lưu lịch sử Notification.
- Hỗ trợ retry nếu gửi thất bại.
- Có cơ chế chống spam.

---

# 12. Application Integration

## 12.1. Mục tiêu

Hub phải có khả năng nhận dữ liệu từ các ứng dụng cá nhân khác.

Ví dụ:

- Japanese Learning App.
- Research Tracker.
- Upwork Management Tool.
- Future Personal Applications.

Các ứng dụng này có thể hoạt động độc lập.

Hub chịu trách nhiệm tổng hợp dữ liệu và cập nhật Goal Progress, Reward và Activity History theo quy tắc đã cấu hình.

## 12.2. Integration Principles

Hub là nơi quyết định:
- Dữ liệu nào được chấp nhận.
- Dữ liệu nào ảnh hưởng đến Goal.
- Dữ liệu nào được tính Reward.
- Dữ liệu nào cập nhật Streak.
- Dữ liệu nào tạo Notification.

Ứng dụng bên ngoài chỉ gửi dữ liệu sự kiện, không trực tiếp chỉnh sửa XP hoặc Goal Progress.

## 12.3. Event Envelope

Tất cả ứng dụng tích hợp cần sử dụng một cấu trúc Event thống nhất.

Ví dụ:

```json
{
  "event_id": "uuid",
  "event_type": "vocabulary.learned",
  "schema_version": 1,
  "source": {
    "app_id": "japanese-learning-app"
  },
  "subject": {
    "type": "vocabulary",
    "external_id": "vocab-001"
  },
  "data": {
    "count": 10,
    "words": [
      "こんにちは",
      "ありがとう"
    ]
  },
  "occurred_at": "2026-11-04T09:00:00+07:00",
  "recorded_at": "2026-11-04T09:05:00+07:00",
  "metadata": {}
}
```

Các trường quan trọng:

| Field | Ý nghĩa |
|---|---|
| event_id | ID duy nhất của sự kiện |
| event_type | Loại sự kiện |
| schema_version | Phiên bản cấu trúc |
| source.app_id | Ứng dụng gửi sự kiện |
| subject | Đối tượng liên quan |
| data | Dữ liệu sự kiện |
| occurred_at | Thời điểm hoạt động thực sự xảy ra |
| recorded_at | Thời điểm Hub ghi nhận |
| metadata | Thông tin bổ sung |

Phân biệt `occurred_at` và `recorded_at` rất quan trọng vì một ứng dụng có thể gửi dữ liệu chậm nhiều ngày.

## 12.4. Event Types

Các Event Type ban đầu:

```text
task.completed
task.updated

goal.progress.updated
milestone.completed

vocabulary.learned
lesson.completed
learning.session.completed

research.session.completed
research.milestone.completed

upwork.revenue.recorded
upwork.project.completed

external_app.heartbeat
```

Có thể bổ sung Event Type trong tương lai.

Không yêu cầu tất cả ứng dụng phải sử dụng toàn bộ Event Type.

## 12.5. Integration API

Hub cần cung cấp API để các ứng dụng gửi Event.

Ví dụ:

```http
POST /api/v1/integrations/events
```

Request Body:

```json
{
  "event_id": "uuid",
  "event_type": "vocabulary.learned",
  "schema_version": 1,
  "source": {
    "app_id": "japanese-learning-app"
  },
  "subject": {
    "type": "vocabulary",
    "external_id": "vocab-001"
  },
  "data": {
    "count": 10
  },
  "occurred_at": "2026-11-04T09:00:00+07:00",
  "recorded_at": "2026-11-04T09:05:00+07:00"
}
```

Response:

```json
{
  "success": true,
  "event_id": "uuid",
  "status": "accepted"
}
```

Các trạng thái xử lý:

```text
RECEIVED
PROCESSING
PROCESSED
FAILED
```

`accepted` có nghĩa là Hub đã tiếp nhận sự kiện, không đồng nghĩa với việc mọi nghiệp vụ đã được xử lý xong.

## 12.6. Integration Management

Hub cần có giao diện quản lý ứng dụng đã kết nối.

Thông tin hiển thị:

- App Name.
- App ID.
- Connection Status.
- Last Activity.
- Last Event Received.
- Last Sync.
- Event Count.
- Error Status.

Người dùng có thể:
- Kết nối ứng dụng.
- Ngắt kết nối.
- Tạo hoặc thu hồi API Key.
- Xem lịch sử Event.
- Kiểm tra lỗi tích hợp.

## 12.7. Outbox và Retry

Các ứng dụng bên ngoài có thể không hoạt động liên tục cùng Hub.

Vì vậy cần hỗ trợ cơ chế Outbox.

Luồng:

```text
External App
     |
     v
Generate Event
     |
     v
Save to Local Outbox
     |
     v
Try to Send to Hub
     |
     +---- Success ----> Mark as Delivered
     |
     +---- Failure ----> Keep in Outbox
                              |
                              v
                         Retry Later
```

Hub cũng cần lưu Event đã nhận trước khi xử lý nghiệp vụ.

Yêu cầu:

- Không mất Event khi Hub tạm thời không hoạt động.
- Retry khi kết nối thất bại.
- Có giới hạn retry và thời gian chờ tăng dần.
- Có cơ chế xử lý Event lỗi kéo dài.
- Idempotency theo Event ID.
- Không xử lý cùng một Event nhiều lần gây cộng trùng Contribution hoặc Reward.

Không cần sử dụng Kafka trong MVP. Có thể bắt đầu bằng database-backed queue và worker đơn giản.

---

# 13. Dashboard

## 13.1. Mục tiêu

Dashboard là màn hình chính, cung cấp cái nhìn tổng quan về tình trạng hoạt động cá nhân.

## 13.2. Các thành phần

### A. Today Overview

Hiển thị:
- Ngày hiện tại.
- Số Task cần thực hiện.
- Số Task đã hoàn thành.
- Task quá hạn.
- Thời gian đã lên lịch.
- Thời gian trống còn lại nếu có dữ liệu Calendar.

### B. Goal Overview

Hiển thị danh sách Goal:

- Goal Name.
- Progress Bar.
- Contribution Completed.
- Target Date.
- Days Remaining.
- Status.

### C. Task Overview

Hiển thị:
- Today's Tasks.
- Upcoming Tasks.
- Overdue Tasks.
- Recently Completed.

### D. Reward Overview

Hiển thị:
- Total XP.
- Current Level nếu có hệ thống Level.
- XP Earned Today.
- Accumulated Reward Progress.
- Recent Rewards.

### E. Streak Overview

Hiển thị:
- Current App Streak.
- Productivity Streak.
- Goal Streak.
- Recent Activity Calendar.

### F. Integration Overview

Hiển thị:
- Connected Apps.
- Last Activity.
- Integration Errors.
- Google Calendar Connection Status.

### G. Notification Center

Hiển thị các cảnh báo và nhắc nhở chưa đọc.

---

# 14. Activity History

Hệ thống cần lưu lại lịch sử các hoạt động quan trọng.

Ví dụ:

```text
2026-11-04 09:00
Completed Task: Learn 20 Japanese Words

2026-11-04 09:01
Goal Progress: 12% -> 14%

2026-11-04 09:01
Reward Received: +20 XP

2026-11-04 10:30
Google Calendar Event Updated
```

Activity History cần hỗ trợ:
- Lọc theo thời gian.
- Lọc theo Goal.
- Lọc theo Task.
- Lọc theo loại hoạt động.
- Xem chi tiết hoạt động.

Mục đích:
- Truy vết thay đổi.
- Kiểm tra Reward.
- Phát hiện lỗi tính tiến độ.
- Hiển thị quá trình phát triển theo thời gian.

---

# 15. Cấu trúc dữ liệu nghiệp vụ ở mức khái niệm

Đây là danh sách các thực thể nghiệp vụ dự kiến. Agent có thể điều chỉnh cấu trúc database khi thiết kế hệ thống, nhưng phải giữ nguyên các quan hệ và quy tắc nghiệp vụ.

| Entity | Mục đích |
|---|---|
| Goal | Mục tiêu |
| Task | Công việc |
| Milestone | Cột mốc |
| GoalContribution | Lịch sử đóng góp vào Goal |
| RewardTransaction | Lịch sử thưởng/phạt XP |
| Streak | Trạng thái chuỗi hoạt động |
| CheckIn | Lịch sử Check-in |
| CalendarMapping | Mapping Task với Google Calendar Event |
| IntegrationApp | Ứng dụng bên ngoài |
| IntegrationEvent | Event nhận từ ứng dụng |
| OutboxEvent | Event chờ gửi |
| Notification | Thông báo |
| ActivityLog | Lịch sử hoạt động |
| UserSettings | Cấu hình cá nhân |

Lưu ý:
- Không cần tạo bảng hoặc entity cho các khái niệm chỉ mang tính hiển thị.
- Không tạo các bảng phục vụ multi-tenant hoặc RBAC.
- Các giao dịch XP và Contribution cần có lịch sử để đối soát.
- Không chỉ lưu giá trị tổng hợp nếu có thể tính lại từ dữ liệu giao dịch gốc.

---

# 16. Các quy tắc nghiệp vụ quan trọng

Agent phải tuân thủ các quy tắc sau:

1. Goal Progress dựa trên Contribution đã hoàn thành, không dựa trên số lượng Task.
2. Contribution và Priority độc lập.
3. Task không bắt buộc phải gắn Goal.
4. Một Task chỉ gắn với tối đa một Goal trong phiên bản đầu tiên.
5. Chỉ Task Completed mới được tính Contribution.
6. Không cộng Contribution hoặc Reward trùng lặp.
7. Task bị hoàn tác phải có giao dịch điều chỉnh tương ứng.
8. Hub quản lý nghiệp vụ Goal, Task và Reward.
9. Google Calendar quản lý lịch thực hiện.
10. Không phải Calendar Event nào cũng là Task.
11. Scheduling Assistant chỉ đề xuất, không tự động ghi đè lịch.
12. Không phạt khi lịch không khả thi do lỗi lập kế hoạch hoặc lỗi hệ thống.
13. Các ứng dụng bên ngoài gửi Event, Hub quyết định cách xử lý.
14. Event phải có ID duy nhất và hỗ trợ Idempotency.
15. Event có thể được gửi trễ, do đó cần phân biệt thời điểm xảy ra và thời điểm ghi nhận.
16. Reward phải có lịch sử giao dịch.
17. Notification không được gửi trùng lặp liên tục.
18. Tất cả ngày giờ phải xử lý đúng múi giờ người dùng.

---

# 17. Non-functional Requirements

## 17.1. Reliability

- Không mất dữ liệu Task, Goal hoặc Reward khi ứng dụng restart.
- Không mất Event khi một ứng dụng tích hợp tạm thời offline.
- Có retry cho các tác vụ đồng bộ.
- Các nghiệp vụ quan trọng phải đảm bảo tính nhất quán.

## 17.2. Security

- Google OAuth Token phải được bảo vệ.
- API Key của ứng dụng tích hợp phải được bảo vệ.
- Không để credential trong source code.
- Không expose các endpoint quản trị nhạy cảm ra Internet nếu không cần thiết.
- Có cơ chế revoke API Key.

## 17.3. Maintainability

- Các module nghiệp vụ cần tách biệt.
- Reward, Penalty và Contribution nên được cấu hình thay vì hardcode.
- Integration Event cần có version.
- API cần có version.
- Có logging và error handling rõ ràng.

## 17.4. Performance

- Dashboard cần tải nhanh với quy mô dữ liệu cá nhân.
- Không cần tối ưu cho hàng triệu người dùng.
- Các tác vụ đồng bộ và gửi Notification nên chạy nền.
- Không để việc đồng bộ Calendar làm chậm thao tác tạo Task.

## 17.5. Backup

- Có phương án backup database.
- Có thể khôi phục dữ liệu Goal, Task, Reward và Integration Event.
- Không phụ thuộc duy nhất vào dữ liệu trên Google Calendar.

---

# 18. MVP Scope

Không triển khai toàn bộ hệ thống ngay lập tức. Ưu tiên xây dựng MVP có thể sử dụng thực tế.

## Phase 1 — Core Productivity

Mục tiêu: Có thể quản lý Goal và Task.

Chức năng:

- Goal CRUD.
- Task CRUD.
- Goal Progress theo Contribution.
- Task Status.
- Priority.
- Estimated Duration.
- Deadline.
- Dashboard cơ bản.
- Activity History cơ bản.

Acceptance Criteria:

- Tạo được Goal.
- Tạo được Task và liên kết với Goal.
- Hoàn thành Task làm tăng Goal Progress đúng Contribution.
- Hoàn tác Task làm giảm Contribution tương ứng.
- Không cộng trùng Contribution.

## Phase 2 — Calendar Integration

Mục tiêu: Quản lý thời gian thông qua Google Calendar.

Chức năng:

- Google OAuth.
- Tạo Calendar Event từ Task.
- Đồng bộ thời gian từ Google Calendar về Hub.
- Đồng bộ thay đổi từ Hub lên Google Calendar.
- Calendar Mapping.
- Sync Error Handling.
- Scheduling Suggestion cơ bản.
- Scheduling Feasibility Check.

Acceptance Criteria:

- Tạo Task có lịch từ Hub và nhìn thấy Event trên Google Calendar.
- Chỉnh sửa thời gian trên Google Calendar và Hub cập nhật đúng Task.
- Chỉnh sửa thời gian trên Hub và Google Calendar cập nhật đúng Event.
- Không tạo Event trùng.
- Xóa Event không làm mất Task.

## Phase 3 — Gamification

Mục tiêu: Tạo động lực sử dụng hệ thống.

Chức năng:

- XP.
- Immediate Reward.
- Accumulated Reward.
- Milestone Reward.
- Goal Completion Reward.
- Reward History.
- Streak.
- Check-in.
- Penalty cơ bản.
- Cấu hình Reward/Penalty.

Acceptance Criteria:

- Hoàn thành Task lớn nhận Reward ngay.
- Task nhỏ tích lũy và nhận Reward khi đạt ngưỡng.
- Reward không bị cộng trùng.
- Có thể truy xuất lịch sử Reward.
- Penalty có thể tắt.
- Không phạt các trường hợp được miễn trừ.

## Phase 4 — External Integration

Mục tiêu: Kết nối các ứng dụng cá nhân.

Chức năng:

- Integration API.
- API Key.
- Event Envelope.
- Event Processing.
- Idempotency.
- Outbox.
- Retry.
- Integration Dashboard.
- External App Activity Tracking.

Acceptance Criteria:

- Ứng dụng bên ngoài gửi Event thành công.
- Hub lưu Event trước khi xử lý.
- Gửi lại cùng Event ID không làm thay đổi tiến độ hai lần.
- Event gửi trễ vẫn được xử lý đúng.
- Có thể xem trạng thái xử lý Event.
- Có thể retry Event lỗi.

## Phase 5 — Advanced Productivity

Mục tiêu: Nâng cao khả năng quản lý và tối ưu thời gian.

Chức năng:

- Advanced Scheduling Suggestion.
- Duration Estimation Improvement.
- Goal Analytics.
- Weekly Review.
- Advanced Notification.
- External App Inactivity Detection.
- Dynamic Goal Recommendation.

Các chức năng này không phải điều kiện bắt buộc để MVP được xem là hoàn thành.

---

# 19. UI/UX Requirements

## 19.1. Navigation

Giao diện cần có các khu vực:

```text
Dashboard
Goals
Tasks
Calendar
Rewards
Activity
Integrations
Settings
```

## 19.2. Dashboard

Ưu tiên:
- Tổng quan hôm nay.
- Goal Progress.
- Task cần thực hiện.
- Reward.
- Streak.
- Cảnh báo quan trọng.

Không nhồi nhét quá nhiều biểu đồ hoặc thông tin ít giá trị.

## 19.3. Goal Detail

Khi mở một Goal, cần hiển thị:

- Goal Description.
- Progress.
- Target Date.
- Milestones.
- Related Tasks.
- Completed Contribution.
- Remaining Contribution.
- Activity History.

## 19.4. Task Detail

Khi mở một Task, cần hiển thị:

- Title.
- Description.
- Priority.
- Contribution.
- Goal.
- Estimated Duration.
- Scheduled Time.
- Actual Duration.
- Deadline.
- Status.
- Reward dự kiến.
- Lịch sử thay đổi.

## 19.5. Design Principles

- Giao diện tối giản, hiện đại.
- Ưu tiên khả năng sử dụng nhanh.
- Có thể sử dụng Dark Mode.
- Progress Bar dễ quan sát.
- Các thông tin quan trọng phải nổi bật.
- Các thao tác thường xuyên như tạo Task, hoàn thành Task, Check-in cần ít bước.
- Responsive cho Desktop và Mobile.

---

# 20. Instructions for Coding Agent

## 20.1. Vai trò

Bạn là Software Engineer chịu trách nhiệm triển khai Personal Productivity Hub theo Product Specification này.

Mục tiêu là tạo một sản phẩm có thể sử dụng thực tế, không chỉ là giao diện demo.

## 20.2. Nguyên tắc triển khai

1. Đọc và phân tích toàn bộ Product Specification trước khi code.
2. Không tự ý loại bỏ các business rule đã được xác định.
3. Không thêm độ phức tạp không cần thiết như multi-tenant, RBAC hoặc microservices nếu chưa có yêu cầu.
4. Ưu tiên thiết kế đơn giản, dễ bảo trì và dễ mở rộng.
5. Các module cần có ranh giới nghiệp vụ rõ ràng.
6. Tất cả nghiệp vụ quan trọng cần có validation.
7. Không hardcode các giá trị Reward, Penalty hoặc Contribution.
8. Không xử lý đồng bộ Calendar hoặc Integration Event theo cách có thể làm mất dữ liệu.
9. Các thao tác có ảnh hưởng đến Contribution và XP phải đảm bảo không xử lý trùng.
10. Có logging và xử lý lỗi.

## 20.3. Quy trình triển khai

Trước khi triển khai, hãy tạo:

- Product Requirement Checklist.
- Technical Architecture Proposal.
- Database Design.
- API Specification.
- Module Dependency Diagram.
- Implementation Plan.

Sau đó mới tiến hành code.

Triển khai theo từng Phase trong mục 18.

Không cố triển khai tất cả chức năng trong một lần.

Sau mỗi Phase:
- Chạy test.
- Kiểm tra Acceptance Criteria.
- Kiểm tra các nghiệp vụ liên quan.
- Cập nhật tài liệu.
- Báo cáo chức năng đã hoàn thành và phần còn thiếu.

## 20.4. Testing Requirements

Các nghiệp vụ bắt buộc cần có test:

- Goal Progress Calculation.
- Task Completion.
- Task Reversal.
- Contribution Recalculation.
- Reward Calculation.
- Accumulated Reward.
- Reward Reversal.
- Idempotent Event Processing.
- Delayed Event Processing.
- Calendar Synchronization.
- Calendar Conflict Handling.
- Notification Deduplication.

Không chỉ test các trường hợp thành công. Cần test cả lỗi API, retry, dữ liệu không hợp lệ và thao tác lặp.

## 20.5. Những điều không được tự ý thay đổi

- Đây là hệ thống cá nhân, một người dùng.
- Goal Progress phải dựa trên Contribution.
- Priority độc lập với Contribution.
- Task không chia thành Core Task và Supporting Task riêng biệt.
- Google Calendar là hệ thống lịch chính.
- Calendar Sync phải hỗ trợ hai chiều.
- Scheduling Assistant sử dụng chế độ Suggest.
- Hub là trung tâm xử lý Reward và Goal Progress.
- External Apps gửi Event thay vì trực tiếp sửa Goal Progress.
- Reward và Penalty phải có thể cấu hình.

Nếu có quyết định kỹ thuật làm thay đổi hành vi sản phẩm, hãy trình bày lý do và đề xuất trước khi triển khai.

---

# 21. Những điểm cần xác nhận trước khi hoàn thiện

Các nội dung sau chưa được quyết định hoàn toàn. Coding Agent không nên tự giả định thành quy tắc nghiệp vụ cố định:

1. **Reward Formula:** Công thức chính xác để kết hợp Contribution và Duration.
2. **Accumulated Reward:** Ngưỡng tích lũy và cách xử lý phần điểm dư.
3. **Penalty:** Có bật trừ XP hay chỉ sử dụng cảnh báo trong phiên bản đầu.
4. **Streak:** Điều kiện chính xác để một ngày được tính là ngày hoạt động.
5. **Task Reversal:** Chính sách xử lý Reward khi Task đã hoàn thành bị mở lại.
6. **Calendar Conflict:** Chính sách ưu tiên khi hai phía thay đổi đồng thời.
7. **External Event Mapping:** Cách ánh xạ Event từ từng ứng dụng vào Goal và Contribution.
8. **Goal Progress:** Chính sách khi người dùng thay đổi Target Contribution sau khi đã có tiến độ.

Trong giai đoạn MVP, hãy ưu tiên các quy tắc đơn giản, có thể cấu hình và không làm mất dữ liệu lịch sử.

---

# 22. Definition of Done

Sản phẩm MVP được xem là hoàn thành khi:

- Người dùng có thể tạo và quản lý Goal.
- Người dùng có thể tạo và quản lý Task.
- Goal Progress được tính theo Contribution chính xác.
- Người dùng có thể theo dõi Deadline và thời lượng Task.
- Google Calendar đồng bộ hai chiều với Task.
- Scheduling Assistant có thể đề xuất lịch và cảnh báo lịch không khả thi.
- Reward System có thể trao thưởng cho Task lớn và tích lũy thưởng cho Task nhỏ.
- Có lịch sử Reward và Activity.
- Có cơ chế Streak và Check-in cơ bản.
- Có Notification cơ bản.
- External App có thể gửi Event đến Hub.
- Event có cơ chế Idempotency và Retry.
- Dữ liệu không bị mất khi ứng dụng restart.
- Các nghiệp vụ cốt lõi có test tự động.
- Có tài liệu hướng dẫn cài đặt, cấu hình và chạy hệ thống.

**Kết quả cuối cùng cần đạt:** Một Personal Productivity Hub có thể sử dụng hằng ngày, giúp người dùng quản lý mục tiêu, công việc, thời gian và động lực cá nhân; đồng thời trở thành trung tâm tiếp nhận dữ liệu từ các ứng dụng cá nhân khác.