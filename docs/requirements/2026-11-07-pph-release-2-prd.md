# Personal Productivity Hub — Release 2 — PRD

## Document Info
| Field | Value |
|---|---|
| Version | v1.0 |
| Created | 2026-11-07 |
| Status | In Review |
| Scope | Google Calendar (một chiều + Google thắng về giờ), Scheduling Assistant, Integration API phía Hub |
| Nguồn | `2026-11-07-pph-release-2-proposal.md` (Approved); PRD Release 1 (quy ước §3.0 giữ nguyên); hợp đồng `docs/integration/2026-11-07-japanese-app-integration.md` |

---

## 1. Overview

### 1.1 Summary
Đưa kế hoạch của Hub lên Google Calendar và dùng lịch thật để giữ kế hoạch khả thi; tự động ghi nhận hoạt động học từ app tiếng Nhật như việc đã hoàn thành.

### 1.2 Goals
- G-6: Mọi phiên làm việc của Task xuất hiện trên Google Calendar ≤ 60 giây, không trùng.
- G-7: Đổi giờ trên Google phản ánh vào Hub ≤ 5 phút.
- G-8: Người dùng xếp lịch cho Task bằng 1 lần chọn gợi ý; được cảnh báo trước khi kế hoạch vỡ.
- G-9: Hoạt động từ app ngoài cộng tiến độ/XP/Streak tự động, không cộng trùng, không mất khi gửi trễ.

### 1.3 Non-Goals
Lịch khác Google; nhiều tài khoản Google; đồng bộ tiêu đề/mô tả từ Google; tự xếp lịch không hỏi; sự kiện đảo ngược từ app ngoài; Telegram/Quiet Hours; tính năng nâng cao (FR-140).

---

## 2. Use Cases
| ID | Description | Trigger | Expected Outcome |
|---|---|---|---|
| UC-101 | Kết nối Google Calendar | Owner bấm "Kết nối" và đăng nhập Google | Trạng thái "Đang hoạt động"; phiên tương lai được đẩy lên |
| UC-102 | Lên lịch Task | Owner thêm phiên 19:00–20:00 | Event xuất hiện trên lịch chính ≤ 60 giây |
| UC-103 | Dời giờ trên điện thoại | Owner kéo Event sang 21:00 trên Google | ≤ 5 phút sau, phiên trong Hub là 21:00–22:00 |
| UC-104 | Nhận gợi ý | Owner mở "Gợi ý lịch" cho Task 120 phút | ≤ 3 phương án trong giờ làm việc, tránh giờ bận |
| UC-105 | Cảnh báo thiếu giờ | Task 120 phút chỉ có phiên 30 phút | Cảnh báo "thiếu 90 phút" |
| UC-106 | App tiếng Nhật gửi "học 20 từ" | POST sự kiện | Goal +20 Contribution, XP/Pool, Streak ngày đó |
| UC-107 | Quản lý app | Owner tạo/thu hồi API key | Key hiển thị 1 lần; thu hồi → 401 |

---

## 3. Functional Requirements

### 3.0 Quy ước bổ sung
- Mọi quy ước Release 1 (§3.0: ISO 8601, múi giờ Owner, số nguyên, soft delete, idempotency, Activity) áp dụng.
- **Google Calendar trong nghiệm thu:** test dùng **Google Calendar giả lập** có cùng hành vi (tạo/sửa/xóa Event, liệt kê thay đổi, free/busy, lỗi mạng/401/429/5xx). Kiểm tra với tài khoản Google thật là bước nghiệm thu thủ công.
- **"Event của Hub"** = Event mà Hub đã tạo (nhận diện bằng dấu hiệu ẩn, không bằng tiêu đề).

### 3.1 Feature List
| ID | Feature | Priority | Proposal FR |
|---|---|---|---|
| F-21 | Task Work Sessions | Must | FR-200, FR-201 |
| F-22 | Calendar Connection | Must | FR-210, FR-220, NFR-205 |
| F-23 | Push Hub → Google | Must | FR-211…214, FR-219, NFR-201…204 |
| F-24 | Pull changes from Google (Google wins) | Must | FR-215…217, NFR-208 |
| F-25 | Busy Time | Must | FR-218 |
| F-26 | Working Hours | Must | FR-230 |
| F-27 | Schedule Suggestions | Must | FR-231, FR-232 |
| F-28 | Feasibility Warnings | Must (Task lớn: Should) | FR-233…236 |
| F-29 | Penalty Fairness for Infeasible Schedules | Must | FR-237 |
| F-30 | Integration Event API | Must | FR-240, FR-246, FR-247, NFR-206 |
| F-31 | Integration Apps & API Keys | Must | FR-241, FR-242, NFR-207 |
| F-32 | Event Mapping & Processing | Must (xử lý lại IGNORED: Could) | FR-243…245, FR-248, FR-250 |
| F-33 | External App Inactivity | Should | FR-249 |
| F-34 | Link Existing Google Event | Could | FR-221 |

### 3.2 Feature Details

---

#### F-21: Task Work Sessions
**Input (phiên):** `start`, `end` — ISO datetime có offset.

**Rules:**
1. Task có 0..n phiên. `end > start`; độ dài ≤ 1.440 phút; các phiên **cùng Task** không chồng nhau (chạm đầu mút được phép: 10:00–11:00 và 11:00–12:00). Phiên của các Task khác nhau được phép chồng (sẽ bị tính vào quá tải — F-28).
2. Phiên trong quá khứ được phép (ghi lại việc đã làm), nhưng không được đẩy lên Google (F-23 rule 6).
3. Task COMPLETED/CANCELLED/đã xóa: không thêm/sửa/xóa phiên → 422 TASK_LOCKED.
4. Tổng thời lượng phiên (`scheduled_minutes`) hiển thị trên Task cạnh thời lượng ước tính.
5. Phiên không ảnh hưởng Deadline, XP, Penalty (ngoài F-29).
6. Mỗi thay đổi ghi Activity.

**Errors:** end ≤ start → 400; > 1.440 phút → 400; chồng phiên cùng Task → 422 CONFLICT; Task không tồn tại → 404.

**Boundary:** đúng 1.440 phút → hợp lệ; 1.441 → 400.

---

#### F-22: Calendar Connection
**Rules:**
1. Settings → "Google Calendar": nút Kết nối (mở trình duyệt đăng nhập Google), Ngắt kết nối, Kết nối lại; chọn lịch dùng đọc giờ bận (F-25).
2. Trạng thái: `NOT_CONNECTED` | `ACTIVE` | `ERROR` (lý do + thời điểm đồng bộ thành công gần nhất). Hiển thị ở Settings và Dashboard (khi `ERROR`).
3. Kết nối thành công lần đầu → đẩy mọi phiên có `end ≥ now` của Task chưa COMPLETED/CANCELLED (F-23).
4. Google trả lỗi xác thực (token bị thu hồi/hết hạn không làm mới được) → `ERROR` "Cần kết nối lại", dừng đồng bộ đến khi kết nối lại.
5. Ngắt kết nối: dừng đồng bộ; Event đã tạo giữ nguyên trên Google; mapping chuyển `INACTIVE`; xóa thông tin xác thực Google khỏi Hub.
6. Kết nối lại **cùng** tài khoản → mapping `INACTIVE` hoạt động lại, không tạo Event trùng; thay đổi trong thời gian ngắt được đẩy bù. Kết nối **tài khoản khác** → mapping cũ giữ `INACTIVE` (không đụng Event của tài khoản cũ), đẩy mới như rule 3.
7. Thông tin xác thực Google được mã hóa khi lưu; không xuất hiện trong log, API, Activity, backup dạng đọc được.

---

#### F-23: Push Hub → Google
**Mapping:** mỗi phiên ↔ tối đa 1 Event trên lịch chính; trạng thái mapping `PENDING` | `SYNCED` | `ERROR` | `DETACHED` (Event bị xóa trên Google) | `INACTIVE`.

**Rules:**
1. Thêm phiên → tạo Event; sửa giờ phiên → cập nhật Event; xóa phiên → xóa Event.
2. Nội dung: tiêu đề = tiêu đề Task (Task COMPLETED: tiền tố "✓ "); mô tả gồm Goal (nếu có), Priority, Contribution, dòng "Quản lý bởi Productivity Hub"; nhắc nhở = mặc định của lịch.
3. Đổi tiêu đề/Goal/Priority/Contribution của Task → cập nhật mọi Event của Task.
4. Task COMPLETED → giữ Event, thêm "✓ "; hoàn tác → bỏ "✓ ". Task CANCELLED hoặc bị xóa → xóa mọi Event của Task.
5. Đẩy chạy nền; thay đổi lên Google ≤ 60 giây khi có mạng; thao tác trong Hub không chờ Google.
6. Phiên có `end < now` lúc tạo không được đẩy (không tạo Event cho quá khứ). Event đã có của phiên trong quá khứ vẫn được cập nhật (ví dụ "✓ ").
7. Nhiều thay đổi liên tiếp cho cùng phiên trước khi đẩy được gộp thành trạng thái cuối cùng.
8. Không có kết nối/Hub tắt → thay đổi được giữ, đẩy khi có lại (kể cả sau khởi động lại).
9. Lỗi tạm thời (mạng, 429, 5xx) → thử lại với khoảng chờ tăng dần 30 giây → tối đa 15 phút. Lỗi liên tục ≥ 30 phút → trạng thái `ERROR` + Notification `CALENDAR_SYNC_ERROR` (1 lần / đợt lỗi; đợt kết thúc khi đồng bộ thành công).
10. Cập nhật/xóa Event mà Google báo không tồn tại → xử lý như F-24 rule 4 (Event bị xóa trên Google).
11. Không bao giờ có 2 Event cho cùng một phiên, kể cả khi mất phản hồi sau khi Google đã tạo Event (Hub kiểm tra Event của mình trước khi tạo lại).
12. Không bao giờ sửa/xóa Event không phải của Hub.

---

#### F-24: Pull changes from Google (Google wins)
**Rules:**
1. Đọc thay đổi khi Hub khởi động, mỗi 5 phút, và khi cửa sổ Hub được mở/được focus (tối đa 1 lần/phút).
2. Event của Hub đổi giờ trên Google → phiên tương ứng nhận giờ mới (kể cả nếu tạo chồng với phiên khác của cùng Task, hoặc dài > 1.440 phút — quy tắc F-21 chỉ áp cho thao tác trong Hub). Activity "Giờ cập nhật từ Google Calendar: A → B".
3. Nếu phiên đó đang có thay đổi chưa đẩy từ Hub → **bỏ** thay đổi của Hub (Google thắng).
4. Event của Hub bị xóa / bị chuyển sang lịch khác / bị đổi thành sự kiện cả ngày trên Google → phiên bị gỡ khỏi Task, mapping `DETACHED`, Task giữ nguyên, Notification `CALENDAR_EVENT_DELETED` "Lịch của Task {title} đã bị xóa trên Google Calendar". Không tạo lại Event.
5. Đổi tiêu đề/mô tả Event trên Google → không đồng bộ về; lần đẩy kế tiếp của Task (nếu có) ghi lại nội dung của Hub.
6. Task đã COMPLETED/CANCELLED mà Event đổi giờ → vẫn cập nhật giờ phiên (lịch sử), không đổi trạng thái Task.
7. Kết thúc một Event trên Google **không** làm Task hoàn thành (Spec §6.3 Case 4).

---

#### F-25: Busy Time
**Rules:**
1. Settings chọn lịch dùng tính giờ bận (danh sách lịch của tài khoản); mặc định chỉ primary.
2. Giờ bận = các khoảng thời gian Event trong lịch đã chọn, **trừ**: Event "Rảnh/Free", Event Owner đã từ chối, Event cả ngày, Event của Hub. Event lặp lại: mỗi lần xuất hiện là một khoảng.
3. Các khoảng chồng nhau được gộp.
4. Chưa kết nối hoặc `ERROR` → giờ bận rỗng; mọi màn hình dùng giờ bận hiển thị "Chưa có dữ liệu lịch Google".
5. Giờ bận cập nhật mỗi lần đọc thay đổi (F-24 rule 1).

---

#### F-26: Working Hours
**Input:** cho mỗi thứ (Thứ Hai…Chủ Nhật) danh sách khung `HH:mm–HH:mm` (00:00 ≤ start < end ≤ 24:00), không chồng nhau.
**Default:** mọi ngày 08:00–22:00. Ngày không có khung = ngày nghỉ (capacity 0).
**Errors:** start ≥ end, chồng khung, sai định dạng → 400, không lưu phần nào.
**Rule:** thay đổi có hiệu lực ngay cho gợi ý và cảnh báo; ghi Activity.

---

#### F-27: Schedule Suggestions
**Định nghĩa:** `remaining = estimated_duration − scheduled_minutes` (tất cả phiên của Task). `window` = từ `now` làm tròn lên bội 15 phút đến Deadline (Task không Deadline: `now + 7 ngày`). `free` = giờ làm việc trong `window` − giờ bận − phiên của **mọi** Task chưa xong (kể cả Task này).

**Rules:**
1. `remaining ≤ 0` → "Task đã đủ thời gian", không gợi ý.
2. Phương án liền: mỗi khoảng `free` liên tục ≥ `remaining` cho 1 phương án = 1 phiên dài `remaining` bắt đầu tại đầu khoảng. Lấy tối đa 3 phương án sớm nhất, mỗi phương án ở một khoảng `free` khác nhau.
3. Nếu < 3 phương án liền: thêm **một** phương án chia phiên — lấy lần lượt các khoảng `free` sớm nhất **chưa được phương án liền nào dùng**, mỗi phiên ≥ 30 phút (trừ phiên cuối được ngắn hơn nếu `remaining` còn lại < 30), mốc thời gian theo bước 15 phút, đến khi đủ `remaining`.
4. Tổng `free` < `remaining` → thông báo "Không đủ thời gian trống trước Deadline: thiếu N phút" và một phương án chia phiên phủ hết phần có thể (đánh dấu "chưa đủ").
5. Chọn phương án → tạo các phiên (F-21) trong một thao tác; nếu khung đã bị chiếm trong lúc chọn → 409, yêu cầu tải lại gợi ý.
6. Task COMPLETED/CANCELLED → không gợi ý (422).
7. Không bao giờ tự tạo/đổi phiên khi Owner chưa chọn.

**Example (Spec §7.3):** Task 120 phút, Deadline Thứ Sáu 23:59; `free`: Thứ Tư 14:00–16:00, Thứ Năm 09:00–10:00, Thứ Năm 14:00–15:00 → Phương án 1 (liền): Thứ Tư 14:00–16:00. Chỉ có 1 phương án liền nên thêm phương án chia từ các khoảng chưa dùng → Phương án 2: Thứ Năm 09:00–10:00 + Thứ Năm 14:00–15:00.

---

#### F-28: Feasibility Warnings
**Settings (mặc định):** `insufficientMinMinutes` 15, `insufficientMinPercent` 10, `overloadPercent` 100.

**Rules:**
1. **Thiếu thời gian (Task):** Task chưa xong, có ≥ 1 phiên, `missing = estimated − scheduled_minutes`; cảnh báo khi `missing ≥ insufficientMinMinutes` **và** `missing ≥ estimated × insufficientMinPercent / 100`. Nội dung: "Ước tính X phút · Đã xếp Y phút · Thiếu Z phút". Hiển thị trên Task Detail, danh sách Task, Dashboard.
2. **Task lớn chưa đủ giờ (Should):** Task chưa xong, `contribution ≥ presetMajor`, `now ≤ deadline ≤ now + 7 ngày`, `scheduled_minutes < estimated` (kể cả 0 phiên) → cảnh báo trên Dashboard.
3. **Ngày quá tải:** với mỗi ngày trong 14 ngày tới: `capacity` = tổng phút giờ làm việc; `load` = phút giờ bận nằm trong giờ làm việc + tổng phút các phiên Task chưa xong trong ngày (mọi giờ). Quá tải khi `load > capacity × overloadPercent / 100`; ngày `capacity = 0` mà có phiên → quá tải. Hiển thị trên Dashboard (danh sách ngày) và khi tạo/chọn phiên rơi vào ngày đó.
4. **Chấp nhận lịch:** nút "Chấp nhận lịch này" trên cảnh báo Task (rule 1) hoặc ngày (rule 3) → ẩn cảnh báo; tự hiện lại khi `estimated`, phiên của Task, hoặc `load` của ngày đó thay đổi.
5. Cảnh báo chỉ hiển thị, không tạo Notification push (tránh spam), không tự đổi lịch.

**Boundary:** estimated 120, scheduled 105 (missing 15 = 12,5%) → cảnh báo; scheduled 106 (missing 14) → không. estimated 300, missing 20 (6,7%) → không. load = capacity → không quá tải; capacity + 1 → quá tải.

---

#### F-29: Penalty Fairness for Infeasible Schedules
**Rules:**
1. Khi đánh giá phạt (F-15 rule 4) hoặc khi hủy Task đang Missed (F-06 Cancel), nếu Task **đang** có cảnh báo Thiếu thời gian (F-28 rule 1) hoặc có phiên nằm trong một ngày quá tải (F-28 rule 3) — kể cả đã "Chấp nhận" — → tự gán lý do hệ thống "Lịch quá tải/Assistant đề xuất sai" và không phạt.
2. Lý do này trở thành **tag hệ thống** (không xóa được, luôn miễn phạt), giống "Goal đang Paused".
3. Task không có phiên → áp dụng quy tắc phạt Release 1 như cũ.

---

#### F-30: Integration Event API
Theo hợp đồng v1 (`docs/integration/2026-11-07-japanese-app-integration.md`) — các mục 3, 4, 6, 7 của hợp đồng là yêu cầu bắt buộc phía Hub.

**Rules:**
1. `POST /api/v1/integrations/events`, header `Authorization: Bearer <key>`.
2. Kiểm tra theo thứ tự: body > 64 KB → 413; thiếu/sai/key đã thu hồi → 401 `UNAUTHORIZED`; `source.app_id` khác app của key → 403 `FORBIDDEN`; envelope sai (thiếu trường, `event_id` không phải UUID, `schema_version ≠ 1`, thời gian không có offset, `occurred_at > now + 5 phút`) → 400 `VALIDATION` kèm chi tiết; `data` sai đặc tả đối với 4 loại đã định nghĩa → 400.
3. `event_type` khác 4 loại đã định nghĩa nhưng đúng mẫu `chữ.thường(.chữ.thường)+` → nhận (202), xử lý theo F-32 (thường IGNORED nếu chưa có quy tắc).
4. `event_id` mới → lưu sự kiện (`RECEIVED`), trả **202** `{"success":true,"event_id":…,"status":"accepted"}` trước khi xử lý nghiệp vụ.
5. `event_id` đã có, nội dung giống hệt → **200** `{"status":"duplicate"}`, không xử lý lại. Nội dung khác → **409** `CONFLICT`.
6. `external_app.heartbeat`: cập nhật "lần heartbeat gần nhất" của app, lưu sự kiện với trạng thái `PROCESSED`; không tính là hoạt động (F-33), ẩn khỏi lịch sử mặc định.
7. Phản hồi ≤ 200 ms (p95).

---

#### F-31: Integration Apps & API Keys
**Rules:**
1. Màn hình Integrations: đăng ký app (tên 1–100 ký tự; `app_id` theo mẫu `[a-z0-9-]{3,50}`, duy nhất), sửa tên, xóa app (soft — thu hồi mọi key, giữ lịch sử).
2. Tạo API key cho app: hiển thị **một lần** (kèm nút sao chép và cảnh báo "sẽ không xem lại được"); Hub chỉ lưu dạng băm + 4 ký tự cuối để nhận diện; một app có thể có nhiều key, mỗi key có tên gợi nhớ.
3. Thu hồi key → hiệu lực ngay (request tiếp theo 401).
4. Danh sách app: tên, `app_id`, trạng thái (Đang hoạt động = có sự kiện/heartbeat ≤ 24 giờ; Không hoạt động; Chưa có dữ liệu), hoạt động gần nhất, heartbeat gần nhất, tổng số sự kiện, số sự kiện FAILED.
5. Lịch sử sự kiện: lọc theo app, trạng thái, `event_type`, khoảng thời gian (theo `occurred_at`); chi tiết hiển thị payload, kết quả xử lý (Goal, Contribution, XP) hoặc lý do IGNORED/FAILED.

---

#### F-32: Event Mapping & Processing
**Quy tắc ánh xạ (Input):** `app`, `event_type`, `goal`, `mode` = `PER_UNIT` (trường số: `count` | `duration_minutes` | `items_reviewed`; hệ số > 0, tối đa 2 chữ số thập phân) hoặc `FIXED` (số nguyên 0–10.000); `defaultDurationMinutes` 1–1.440 (dùng cho công thức XP khi sự kiện không có `duration_minutes`); `enabled`.
Tối đa 1 quy tắc / (app, event_type) → trùng: 409.

**Processing (≤ 5 giây sau khi nhận):**
1. Không có quy tắc bật, hoặc Goal của quy tắc đã xóa → `IGNORED` (lý do).
2. Contribution = `round_half_up(trường × hệ số)` (PER_UNIT; trường thiếu → coi là 0) hoặc giá trị FIXED; giới hạn 0–10.000.
3. Thời lượng cho XP = `data.duration_minutes` nếu có, ngược lại `defaultDurationMinutes`.
4. Tính **như một Task hoàn thành** (D-26): Contribution vào Goal; XP theo F-07 (Contribution < SmallThreshold → Pool, không XP ngay); ngày hoạt động Streak = ngày của `occurred_at` theo múi giờ Owner; Milestone/Goal 100% đánh giá như khi hoàn thành Task. Giao dịch ledger có nguồn `INTEGRATION_EVENT` + id sự kiện.
5. Contribution = 0 → `PROCESSED`, không tạo giao dịch.
6. Lỗi khi xử lý → `FAILED` (lý do), không thay đổi gì (nguyên tử). Nút "Thử lại" → xử lý lại từ đầu, không cộng trùng.
7. Sự kiện trễ: xử lý bình thường; XP/Contribution ghi tại thời điểm xử lý; Streak theo `occurred_at` (có thể làm tăng chuỗi của ngày quá khứ).
8. Thêm/sửa quy tắc không áp dụng cho sự kiện đã xử lý. (Could) Nút "Áp dụng cho các sự kiện IGNORED" của (app, event_type) → xử lý lại các sự kiện IGNORED đó.
9. Activity cho mỗi sự kiện PROCESSED có Contribution > 0, ví dụ "Học 20 từ vựng — Japanese Learning App (+20 vào Học 1000 từ)".
10. Không có hoàn tác sự kiện ở bản này.

**Example:** quy tắc `vocabulary.learned` → Goal "Học 1000 từ", `PER_UNIT count × 1`, `defaultDurationMinutes` 20. Sự kiện `count = 20` → Contribution 20; 20 ≥ SmallThreshold 20 → XP = round(20 × 1 × clamp(20/60, 0,5, 2)) = 10.

---

#### F-33: External App Inactivity (Should)
1. Mỗi app có tần suất kỳ vọng: `DAILY` (mặc định, ngưỡng 3 ngày) | `WEEKLY` (ngưỡng 10 ngày) | `NONE` (không cảnh báo).
2. Không có sự kiện **hoạt động** (mọi loại trừ heartbeat) trong số ngày ngưỡng → Notification `EXTERNAL_APP_INACTIVE` "Bạn chưa ghi nhận hoạt động từ {app} trong N ngày", 1 lần / đợt (đợt kết thúc khi có sự kiện hoạt động mới).
3. App chưa từng gửi sự kiện hoạt động → không cảnh báo.

---

#### F-34: Link Existing Google Event (Could)
Trong Task Detail chọn một Event có sẵn (trong 30 ngày tới, lịch primary) để làm phiên của Task: phiên lấy giờ của Event; Event **không** bị đổi tiêu đề/mô tả; Google thắng về giờ (F-24); xóa phiên trong Hub chỉ gỡ liên kết, không xóa Event của Owner.

---

## 4. Non-Functional Requirements
| Metric | Requirement | Measurement |
|---|---|---|
| Không trùng Event | 0 | Kịch bản retry/mất phản hồi/khởi động lại với Calendar giả lập |
| Đẩy lên Google | ≤ 60 giây | Calendar giả lập ghi thời điểm nhận |
| Đọc từ Google | ≤ 5 phút khi Hub chạy | Theo nhịp F-24 |
| UI không chờ Google | Thao tác Task với Calendar lỗi/chậm 30 giây vẫn phản hồi như khi chưa kết nối | Calendar giả lập trễ 30 giây |
| Tiếp nhận sự kiện | ≤ 200 ms p95; xử lý xong ≤ 5 giây | 100 request liên tiếp |
| Bảo mật | Token Google mã hóa; API key lưu băm; không lộ trong log/API/backup đọc được | Kiểm tra DB, log, response |

## 5. Constraints & Dependencies
- Hub chỉ nghe `127.0.0.1` → đọc thay đổi chủ động, không webhook.
- Phụ thuộc: Google Calendar API (tài khoản Google, OAuth client do Owner tạo); app tiếng Nhật theo hợp đồng v1.
- Được dùng tool/opensource bên ngoài cho kết nối Google (quyết định ở thiết kế).

## 6. BDD Testability Check
| Dimension | Status | Ghi chú |
|---|---|---|
| Input/Output format | Pass | Phiên, khung giờ, quy tắc, envelope (hợp đồng v1) |
| Error & exception scenarios | Pass | Lỗi Google (mạng/401/429/5xx/404), lỗi API sự kiện |
| Boundary & priority rules | Pass | Google thắng; ngưỡng cảnh báo; thứ tự kiểm tra request |
| State behavior | Pass | Trạng thái mapping, kết nối, sự kiện; hàng đợi bền |
| Verifiable granularity | Pass | Dùng Calendar giả lập |
| Ambiguity check | Pass | Các điểm theo thông lệ đã liệt kê (AD-xx) và được duyệt |

## 7. Glossary
| Term | Definition |
|---|---|
| Phiên làm việc | Khoảng thời gian đã xếp để làm một Task |
| Event của Hub | Event do Hub tạo trên Google Calendar |
| Giờ bận | Khoảng thời gian bận đọc từ các lịch đã chọn (F-25) |
| Giờ làm việc | Khung giờ Owner cho phép xếp việc (F-26) |
| Calendar giả lập | Bản thay thế Google Calendar dùng trong test tự động |
| Quy tắc ánh xạ | Cách biến sự kiện app ngoài thành Contribution cho một Goal |
