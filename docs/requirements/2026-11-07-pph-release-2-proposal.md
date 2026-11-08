# Personal Productivity Hub — Release 2 — Requirement Proposal

> Phạm vi: Google Calendar, Scheduling Assistant, Integration API phía Hub.
> Nguồn: Product Spec §6, §7, §11, §12; Proposal/PRD Release 1; hợp đồng `docs/integration/2026-11-07-japanese-app-integration.md`; phiên BA 2026-11-07.
> Trạng thái: **Approved — 2026-11-07**
> Ký hiệu: **D-xx** = quyết định của người dùng; **AD-xx** = áp dụng theo thông lệ của TickTick / Notion Calendar / Obsidian Full Calendar / Motion (không hỏi lại, có thể bác bỏ khi review).

---

## 1. Background & Problem

### 1.1 Problem Description
Release 1 giải quyết động lực (tiến độ, XP, Streak). Hai vấn đề còn lại:
1. **Kế hoạch tách rời lịch thật:** Task không có giờ làm trên Google Calendar (lịch người dùng dùng hằng ngày, kể cả trên điện thoại), nên dễ xếp quá tải hoặc quên; Hub không biết giờ bận để cảnh báo.
2. **Nhập tay hoạt động học:** việc học tiếng Nhật đã được app riêng ghi nhận nhưng phải nhập lại vào Hub.

5 Whys (rút gọn):

| # | Câu hỏi | Phát hiện |
|---|---|---|
| 1 | Cần Calendar để làm gì? | Cả ba: hiện Task lên lịch, sửa được trên Google, biết giờ trống để gợi ý |
| 2 | Vì sao muốn dùng tool/opensource bên ngoài? | Muốn **có sớm để dùng** — ưu tiên thời gian ra mắt |
| 3 | Bản tối thiểu chấp nhận được? | Hub → Calendar + đọc lịch bận; sau đó Google thắng khi sửa giờ (D-23) |

### 1.2 Impact Scope
- **Universality:** cụ thể — một người dùng, một laptop, một tài khoản Google.
- **Pain points:** lịch không khả thi → Task Missed → bị phạt oan; phải nhập tay việc học.

### 1.3 Problem Domain Boundary
- **Trong phạm vi:** hành vi đồng bộ lịch, quy tắc giờ bận, gợi ý & kiểm tra khả thi, tiếp nhận và ánh xạ sự kiện app ngoài.
- **Ngoài phạm vi (giai đoạn thiết kế):** chọn thư viện/tool kết nối Google, cơ chế OAuth, lưu token, cấu trúc queue. **Ràng buộc đã ghi nhận:** được phép dùng tool/opensource bên ngoài cho kết nối Calendar để ra mắt nhanh, tối ưu sau.

---

## 2. User Stories

| ID | User Story | Ưu tiên |
|---|---|---|
| US-13 | As the user, I want tasks with a scheduled time to appear on my Google Calendar automatically, so that I see and get reminded of my plan on any device. | Must |
| US-14 | As the user, I want the Hub to know my busy and free time from Google Calendar, so that it can suggest realistic slots and warn me when I'm overloaded. | Must |
| US-15 | As the user, I want time-slot suggestions for a task based on its duration, deadline and my free time, so that I can schedule it in one click. | Must |
| US-16 | As the user, I want a warning when the scheduled time is shorter than the estimate or the day is overloaded, so that I fix the plan before it fails. | Must |
| US-17 | As the user, I want activity from my Japanese learning app to update goal progress automatically, so that I don't log every study session by hand. | Must |
| US-18 | As the user, I want to manage connected apps (API key, status, event history, failed events), so that I trust the data and can fix problems. | Must |
| US-19 | As the user, I want time changes I make in Google Calendar to update the matching Hub task, so that I can reschedule from my phone. | Must (dạng đơn giản: Google thắng — D-23) |

---

## 3. Requirement Refinement

### 3.1 Functional Requirements

#### Lịch làm việc của Task (nền cho US-13…16)

| ID | Description | Priority | Source |
|---|---|---|---|
| FR-200 | Task có **0..n phiên làm việc** (start, end — datetime). Mỗi phiên: end > start, ≤ 24 giờ, không trùng nhau trong cùng Task. Tạo/sửa/xóa phiên trong Task Detail và form tạo Task. Phiên làm việc không thay đổi Deadline. | Must | US-13, US-15 |
| FR-201 | Task COMPLETED/CANCELLED không thêm/sửa phiên được. | Must | AD-09 |

#### Google Calendar (US-13, US-14, US-19)

| ID | Description | Priority | Source |
|---|---|---|---|
| FR-210 | Kết nối / ngắt kết nối / kết nối lại một tài khoản Google trong Settings. Màn hình trạng thái: Chưa kết nối / Đang hoạt động / Lỗi (kèm lý do, lần đồng bộ thành công gần nhất). | Must | Spec §6.6 |
| FR-211 | Mỗi phiên làm việc của Task ↔ đúng **một Event** trên **lịch chính (primary)**. Hub lưu mapping (task, phiên, event id, lần đồng bộ, trạng thái). Không bao giờ tạo Event trùng cho cùng một phiên. | Must | D-21, Spec §6.2 |
| FR-212 | Tạo/sửa/xóa phiên trong Hub → tạo/cập nhật/xóa Event tương ứng; đẩy lên trong ≤ 60 giây khi có mạng, chạy nền, không làm chậm thao tác trong Hub. Mất mạng/Hub tắt → xếp hàng, đẩy khi có lại (không mất). | Must | AD-02 |
| FR-213 | Nội dung Event: tiêu đề = tiêu đề Task; Task COMPLETED → tiêu đề có tiền tố "✓ ". Mô tả: Goal, Priority, Contribution, dòng "Quản lý bởi Productivity Hub". Nhắc nhở theo mặc định của lịch Google. | Must | AD-03, D-24 |
| FR-214 | Task COMPLETED → giữ Event, thêm "✓ ". Hoàn tác → bỏ "✓ ". Task CANCELLED hoặc bị xóa → xóa các Event của Task. | Must | D-24 |
| FR-215 | **Google thắng về giờ:** Event do Hub tạo bị đổi giờ trên Google → phiên tương ứng trong Hub cập nhật theo, ghi Activity "Giờ cập nhật từ Google Calendar". Thay đổi tiêu đề/mô tả trên Google **không** đồng bộ về (Hub sở hữu nội dung — Spec §6.2); lần đẩy kế tiếp từ Hub sẽ ghi lại nội dung của Hub. | Must | D-23, AD-06 |
| FR-216 | Event do Hub tạo bị **xóa trên Google** → Task giữ nguyên, phiên đó bị gỡ khỏi Task, Notification "Lịch của Task X đã bị xóa trên Google Calendar". Không tạo lại Event. | Must | D-23, Spec §6.3 Case 5 |
| FR-217 | Đọc thay đổi từ Google: khi khởi động Hub, mỗi 5 phút, và khi mở cửa sổ Hub. | Must | AD-02 |
| FR-218 | **Giờ bận:** đọc Event từ các lịch người dùng chọn (mặc định chỉ primary). Không tính bận: Event đánh dấu "Rảnh/Free", Event đã từ chối, Event cả ngày, Event do chính Hub tạo (đã tính qua phiên Task). Event lặp lại tính từng lần xuất hiện. | Must | D-22, AD-05, AD-10 |
| FR-219 | Lỗi đồng bộ không chặn bất kỳ chức năng nào của Hub; retry tăng dần. Lỗi liên tục ≥ 30 phút → Notification CALENDAR_SYNC_ERROR (1 lần / đợt lỗi). | Must | Spec §6.5, §11.2, AD-07 |
| FR-220 | Ngắt kết nối: dừng đồng bộ, Event đã tạo giữ nguyên trên Google, mapping chuyển trạng thái "không hoạt động". Kết nối lại cùng tài khoản → tiếp tục mapping cũ, không tạo trùng. | Must | AD-08 |
| FR-221 | Liên kết một Event có sẵn (không do Hub tạo) với Task. | Could | Spec §6.4 |

#### Scheduling Assistant (US-15, US-16)

| ID | Description | Priority | Source |
|---|---|---|---|
| FR-230 | Settings **giờ làm việc theo từng thứ**: mỗi thứ 0..n khung giờ (HH:mm–HH:mm, không chồng nhau). Mặc định mọi ngày 08:00–22:00. | Must | D-25 |
| FR-231 | **Gợi ý:** tối đa 3 phương án cho một Task, chỉ trong giờ làm việc, trừ giờ bận và các phiên Task khác, từ thời điểm hiện tại (làm tròn lên 15 phút) đến Deadline (không có Deadline → 7 ngày tới). Ưu tiên 1 khối liền đủ thời lượng còn thiếu, sớm nhất trước; nếu không có → phương án chia nhiều phiên, mỗi phiên ≥ 30 phút, bước 15 phút. Không đủ chỗ → báo "Không đủ thời gian trống trước Deadline: thiếu N phút". | Must | Spec §7.3, AD-11 |
| FR-232 | Người dùng chọn một phương án → tạo các phiên tương ứng (và Event). Có thể sửa tay, bỏ qua, hoặc tự lên lịch. Hệ thống không bao giờ tự đổi lịch. | Must | Spec §7.1, §7.3 |
| FR-233 | **Thiếu thời gian:** tổng phiên < thời lượng ước tính và thiếu ≥ 15 phút **và** ≥ 10% ước tính → cảnh báo "Estimated X phút, Scheduled Y phút, thiếu Z phút" trên Task và Dashboard. Ngưỡng cấu hình được. | Must | Spec §7.4, AD-12 |
| FR-234 | **Task lớn chưa đủ giờ:** Task chưa xong có Contribution ≥ preset Major và Deadline trong 7 ngày tới mà tổng phiên < ước tính → cảnh báo trên Dashboard. | Should | Spec §7.4, AD-12 |
| FR-235 | **Ngày quá tải:** (giờ bận + phiên Task) trong giờ làm việc của một ngày > 100% thời lượng giờ làm việc ngày đó → cảnh báo ngày đó (Dashboard + khi lên lịch). Ngưỡng % cấu hình được. | Must | Spec §7.4, AD-12 |
| FR-236 | "Chấp nhận lịch này": tắt cảnh báo cho Task/ngày đó đến khi lịch thay đổi. | Must | Spec §7.4 |
| FR-237 | **Công bằng với Penalty:** Task bị Missed mà tại Deadline đang có cảnh báo thiếu thời gian hoặc ngày quá tải (kể cả đã "chấp nhận") → tự gán lý do "Lịch quá tải/Assistant đề xuất sai" (miễn phạt), giống cách xử lý Goal Paused. | Must | Spec §9.4, AD-13 |

#### Integration (US-17, US-18)

| ID | Description | Priority | Source |
|---|---|---|---|
| FR-240 | `POST /api/v1/integrations/events` đúng hợp đồng v1 (envelope, mã phản hồi 202/200 duplicate/400/401/409/413). Hub lưu sự kiện trước khi xử lý nghiệp vụ. | Must | Spec §12, hợp đồng v1 |
| FR-241 | Màn hình Integrations: đăng ký app (tên, app_id), tạo API key (hiển thị **một lần**, lưu dạng băm), thu hồi key (hiệu lực ngay). Một app có thể có nhiều key. | Must | Spec §12.6, AD-15 |
| FR-242 | Danh sách app: tên, app_id, trạng thái kết nối, hoạt động gần nhất, sự kiện gần nhất, số sự kiện, lỗi. Lịch sử sự kiện có lọc theo trạng thái/loại/thời gian; xem chi tiết payload. | Must | Spec §12.6 |
| FR-243 | Trạng thái sự kiện: RECEIVED → PROCESSED / IGNORED (không có quy tắc ánh xạ) / FAILED (lỗi xử lý). Thử lại thủ công sự kiện FAILED. | Must | Spec §12.5, AD-16 |
| FR-244 | **Quy tắc ánh xạ** (người dùng cấu hình): (app, event_type) → Goal + Contribution = trường số × hệ số (ví dụ `count × 1`, `duration_minutes × 0,5`) hoặc cố định mỗi sự kiện; thời lượng dùng cho công thức XP = `duration_minutes` của sự kiện nếu có, ngược lại giá trị mặc định của quy tắc. Tối đa 1 quy tắc / (app, event_type). | Must | Q-09, AD-17 |
| FR-245 | Sự kiện PROCESSED được tính **như một Task hoàn thành**: Contribution vào Goal, XP theo F-07 (nhỏ → Pool), ngày Streak theo ngày của `occurred_at` (múi giờ Owner); có giao dịch ledger truy vết tới sự kiện. | Must | D-26 |
| FR-246 | Idempotency theo `event_id`: nhận lại → 200 duplicate, không xử lý lại. Cùng `event_id` khác nội dung → 409. | Must | Spec §12.7 |
| FR-247 | Sự kiện trễ: xử lý bình thường; Streak/ngày hoạt động theo `occurred_at`; XP ghi nhận tại thời điểm xử lý. | Must | AD-18 |
| FR-248 | Thêm/sửa quy tắc **không** áp dụng lại cho sự kiện cũ. Nút "Áp dụng cho sự kiện IGNORED" (xử lý lại sự kiện chưa có quy tắc). | Could | AD-19 |
| FR-249 | Cảnh báo app ngoài không hoạt động: mỗi app có tần suất kỳ vọng (mặc định hằng ngày); quá 3 ngày không có sự kiện hoạt động (heartbeat không tính) → Notification EXTERNAL_APP_INACTIVE, 1 lần / đợt. | Should | Spec §11.2, AD-20 |
| FR-250 | Mỗi sự kiện PROCESSED ghi Activity ("Học 20 từ vựng — Japanese Learning App"). | Must | AD-21 |

### 3.2 Non-Functional Requirements

| ID | Description | Acceptance Criteria | Priority |
|---|---|---|---|
| NFR-201 | Không trùng Event | 0 Event trùng cho cùng một phiên sau mọi chuỗi thao tác/retry/khởi động lại | Must |
| NFR-202 | Độ trễ đẩy lịch | Thay đổi phiên trong Hub xuất hiện trên Google ≤ 60 giây (có mạng) | Must |
| NFR-203 | Không chặn UI | Tạo/sửa Task có phiên: thời gian phản hồi không tăng so với khi chưa kết nối Calendar (đồng bộ chạy nền) | Must |
| NFR-204 | Bền vững hàng đợi | Thay đổi chưa đẩy được giữ qua tắt app/mất mạng và được đẩy khi có lại | Must |
| NFR-205 | Bảo mật thông tin Google | Token Google được mã hóa khi lưu; không xuất hiện trong log, backup dạng đọc được, hay API | Must |
| NFR-206 | Tiếp nhận sự kiện | `POST /integrations/events` phản hồi ≤ 200 ms (p95); sự kiện được xử lý xong ≤ 5 giây sau khi nhận | Must |
| NFR-207 | Bảo mật API key | Key chỉ hiển thị một lần; lưu dạng băm; key bị thu hồi → 401 ngay lập tức | Must |
| NFR-208 | Đọc thay đổi Google | Thay đổi giờ trên Google phản ánh vào Hub ≤ 5 phút khi Hub đang chạy | Must |

### 3.3 Key Decision Records

| ID | Question | Conclusion | Rationale |
|---|---|---|---|
| D-21 | Lịch đích | Lịch chính (primary) | Người dùng chọn |
| D-22 | Lịch đọc giờ bận | Chọn được, mặc định primary | Người dùng chọn |
| D-23 | Sửa trên Google | Google luôn thắng về giờ; xóa trên Google → Task giữ, mất phiên | Người dùng chọn; giải Q-08 |
| D-24 | Task đổi trạng thái | Xong: giữ Event + "✓ "; Hủy/Xóa: xóa Event | Người dùng chọn |
| D-25 | Giờ làm việc | Cấu hình từng thứ, nhiều khung/ngày; mặc định 08:00–22:00 | Người dùng chọn |
| D-26 | Giá trị sự kiện app ngoài | Như Task hoàn thành: Contribution + XP + Streak | Người dùng chọn |
| AD-02 | Nhịp đồng bộ | Đẩy ≤ 60 giây; đọc: khởi động, 5 phút/lần, khi mở cửa sổ | Thông lệ Notion Calendar / Obsidian Full Calendar |
| AD-03 | Nội dung Event | Tiêu đề Task, mô tả có Goal/Priority/Contribution, nhắc theo mặc định Google | Thông lệ TickTick |
| AD-05 | Giờ bận | Bỏ Free, từ chối, cả ngày, Event của Hub | Ngữ nghĩa free/busy của Google, Notion Calendar |
| AD-06 | Nội dung sửa trên Google | Chỉ giờ đồng bộ về; tiêu đề/mô tả do Hub sở hữu | Spec §6.2 |
| AD-07 | Lỗi đồng bộ | Retry tăng dần, báo sau 30 phút lỗi liên tục | Thông lệ |
| AD-08 | Ngắt kết nối | Giữ Event trên Google, giữ mapping | Thông lệ Notion Calendar |
| AD-11 | Thuật toán gợi ý | 3 phương án, sớm nhất trước, ưu tiên khối liền, chia phiên ≥ 30 phút, bước 15 phút | Thông lệ Motion / Reclaim; ví dụ Spec §7.3 |
| AD-12 | Ngưỡng cảnh báo | Thiếu ≥ 15 phút và ≥ 10%; quá tải > 100%; Task lớn = Contribution ≥ Major, Deadline ≤ 7 ngày | Cấu hình được |
| AD-13 | Missed do lịch không khả thi | Tự miễn phạt bằng tag hệ thống | Spec §9.4 |
| AD-15 | API key | Hiển thị 1 lần, lưu băm, thu hồi ngay | Thông lệ GitHub / Stripe |
| AD-17 | Ánh xạ sự kiện | Quy tắc (app, type) → Goal + công thức | Thông lệ Zapier/IFTTT; giải Q-09 |
| AD-18 | Sự kiện trễ | Theo `occurred_at` cho Streak | Spec §12.3 |
| AD-19 | Quy tắc mới | Không hồi tố; xử lý lại IGNORED thủ công | Nhất quán NFR-010 Release 1 |
| AD-20 | Không hoạt động | 3 ngày, heartbeat không tính | Ví dụ Spec §11.2 |

---

## 4. MoSCoW

**Must:** phiên làm việc của Task; kết nối Google; đẩy Hub → Google; Google thắng về giờ; xóa trên Google; giờ bận; gợi ý; thiếu thời gian; quá tải; chấp nhận lịch; miễn phạt khi lịch không khả thi; Integration API, API key, ánh xạ, xử lý như Task, idempotency, sự kiện trễ, màn hình Integrations; NFR-201…208.

**Should:** cảnh báo Task lớn chưa đủ giờ (FR-234); cảnh báo app ngoài không hoạt động (FR-249).

**Could:** liên kết Event có sẵn (FR-221); xử lý lại sự kiện IGNORED (FR-248).

**Won't (lần này):** lịch khác Google (Outlook/Apple); nhiều tài khoản Google; đồng bộ tiêu đề/mô tả từ Google về; tự động xếp lịch không hỏi; sự kiện đảo ngược từ app ngoài; Telegram/Quiet Hours (FR-130); tính năng nâng cao (FR-140).

---

## 5. Constraints & Assumptions

### 5.1 Constraints
- Hub chỉ nghe `127.0.0.1`; không có URL công khai → không dùng push notification/webhook của Google, phải chủ động đọc thay đổi.
- Một người dùng, một tài khoản Google.
- Được dùng tool/opensource bên ngoài cho kết nối Google để ra mắt nhanh (quyết định ở giai đoạn thiết kế).
- Hợp đồng sự kiện v1 đã gửi cho app tiếng Nhật — không đổi định dạng.

### 5.2 Assumptions
- A-201: Người dùng tự tạo OAuth client trên Google Cloud (Hub hướng dẫn từng bước).
- A-202: Laptop có Internet phần lớn thời gian; khi offline Hub vẫn hoạt động đầy đủ trừ đồng bộ.
- A-203: Event do Hub tạo được nhận diện bằng dấu hiệu ẩn trên Event (không dựa vào tiêu đề).

## 6. Open Questions

| ID | Question | Status |
|---|---|---|
| Q-08 | Xung đột Calendar | Resolved → D-23 (Google thắng về giờ) |
| Q-09 | Ánh xạ sự kiện → Goal | Resolved → FR-244 / AD-17 |
| Q-201 | Lựa chọn tool/opensource kết nối Google | Chuyển sang giai đoạn thiết kế |
