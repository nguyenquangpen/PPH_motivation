# Personal Productivity Hub — Requirement Proposal

> Nguồn: `doc_description.md` (Product Specification v1.0) + phiên phân tích yêu cầu ngày 2026-11-05.
> Trạng thái: **Approved — 2026-11-06** (A-02…A-05 đã được xác nhận thành quy tắc)

---

## 1. Background & Problem

### 1.1 Problem Description

Người dùng đặt nhiều mục tiêu dài hạn (ví dụ: học ngoại ngữ, nghiên cứu, phát triển sự nghiệp) nhưng **thường bỏ dở giữa chừng do mất động lực**.

Chuỗi 5 Whys:

| # | Câu hỏi | Phát hiện |
|---|---|---|
| 1 | Vấn đề đau nhất? | Mất động lực, bỏ dở mục tiêu |
| 2 | Điều gì xảy ra trước khi bỏ? | Không thấy tiến bộ — đã làm nhiều nhưng không đo được mình đi được bao xa |
| 3 | Chỉ có thanh tiến độ đã đủ? | Chưa — tiến độ dài hạn tăng chậm, thiếu cảm giác được thưởng ngắn hạn |
| 4 | Phần thưởng nào hiệu quả? | XP/Level để thấy tiến bộ **và** đổi XP lấy phần thưởng đời thực do mình tự đặt |
| 5 | Phiên bản tối thiểu? | Goal/Task + Reward trước; Calendar và tích hợp app là phần hỗ trợ, làm sau |

**Nhu cầu gốc:** Một hệ thống cá nhân biến mỗi công việc thành **tiến bộ nhìn thấy được** hướng tới mục tiêu dài hạn và **phần thưởng tức thì**, để người dùng duy trì thay vì bỏ cuộc.

### 1.2 Impact Scope

- **Universality assessment:** Nhu cầu **cụ thể (specific)** — một người dùng duy nhất. Giải pháp nhắm đích, không thiết kế cho nhiều người dùng.
- **Affected roles:** Một người dùng cá nhân (chủ hệ thống). Các ứng dụng cá nhân khác là nguồn dữ liệu (Release 2+).
- **Current pain points:**
  - Không đo được mức đóng góp thực tế của công việc hằng ngày vào mục tiêu dài hạn.
  - Tiến độ dài hạn tăng chậm → không có phản hồi tích cực ngắn hạn.
  - Không có cơ chế ràng buộc trách nhiệm khi bỏ lỡ việc, nhưng cơ chế phạt cứng nhắc sẽ gây nản.
  - Dữ liệu tiến độ phân tán ở nhiều app, lịch tách rời khỏi công việc (pain phụ, xử lý ở Release 2+).

### 1.3 Problem Domain Boundary

**Thuộc problem domain (cần giải quyết):**
- Đo tiến độ Goal theo Contribution thực tế.
- Phản hồi động lực ngắn hạn: XP, Level, Streak, đổi thưởng.
- Trách nhiệm khi bỏ lỡ việc, có miễn trừ công bằng.
- Truy vết, đối soát mọi thay đổi tiến độ và XP.

**Thuộc solution domain (ngoài phạm vi tài liệu này):**
- Công nghệ, kiến trúc, database, cơ chế queue/webhook, framework UI.
- Các chi tiết kỹ thuật trong spec gốc (OAuth flow, incremental sync API, DB-backed queue, Kafka...) được giữ lại như **ràng buộc/gợi ý** cho giai đoạn thiết kế, không phải yêu cầu nghiệp vụ.

### 1.4 Cross-cutting Principles

| ID | Nguyên tắc |
|---|---|
| P-01 | **Không hardcode dữ liệu nghiệp vụ.** Mọi danh mục (Goal Category, Reward Shop item, Missed Reason tag, Contribution preset, External App, Event Type, Event → Goal mapping) đều do người dùng thêm/sửa/xóa. Hệ thống chỉ cung cấp dữ liệu mẫu (seed) có thể xóa. Các ví dụ trong spec (JLPT, Upwork, Japanese Learning App...) chỉ là demo. |
| P-02 | **Mọi tham số Reward/Penalty/Streak đều cấu hình được** qua giao diện Settings, không cần sửa code. |
| P-03 | **Ledger trước, tổng sau.** Contribution và XP chỉ thay đổi qua giao dịch có lịch sử; mọi giá trị tổng hợp phải tính lại được từ giao dịch gốc. Không xóa giao dịch — điều chỉnh bằng giao dịch đảo ngược. |
| P-04 | **Idempotent.** Cùng một thao tác/sự kiện gửi lại nhiều lần chỉ tạo hiệu lực một lần. |
| P-05 | **Công bằng.** Không phạt khi nguyên nhân thuộc danh sách miễn trừ. |
| P-06 | **Múi giờ người dùng** quyết định ranh giới ngày cho Streak, Deadline, "hôm nay". |

---

## 2. User Stories

### 2.1 Core User Stories (Release 1 — MVP)

| ID | User Story |
|---|---|
| US-01 | As the user, I want to create long-term Goals and see progress measured by actual Contribution, so that I always know how far I have come. |
| US-02 | As the user, I want to create Tasks with Priority, Contribution, Duration and Deadline, optionally linked to a Goal, so that each completed Task visibly moves the Goal forward. |
| US-03 | As the user, I want to earn XP immediately for large Tasks and accumulated XP for many small Tasks, so that I feel rewarded every day even while the long-term Goal grows slowly. |
| US-04 | As the user, I want to define real-life rewards with an XP price and redeem my XP for them, so that XP has real value and motivates me more. *(mới — không có trong spec gốc)* |
| US-05 | As the user, I want to track my streak of active days, so that I keep the habit and come back after interruptions. |
| US-06 | As the user, I want to be rewarded when reaching a Milestone or completing a Goal, so that I celebrate major achievements. |
| US-07 | As the user, I want to see the history of activity, Contribution and XP, with undo producing reversal entries, so that I trust the numbers are accurate and never double-counted. |
| US-08 | As the user, I want warnings and XP deductions when I miss Tasks, except for exempt reasons I define, so that I take responsibility without feeling unfairly punished. |

### 2.2 Extended User Stories (Release 2+)

| ID | User Story |
|---|---|
| US-09 | As the user, I want Tasks synced two-way with Google Calendar, so that Tasks have real time slots without entering them twice. |
| US-10 | As the user, I want time-slot suggestions and warnings when scheduled time is insufficient, so that my plan is feasible. |
| US-11 | As the user, I want my personal apps to send activity to the Hub automatically, so that progress updates without manual entry. |
| US-12 | As the user, I want reminders through external channels (Telegram, desktop) that are relevant and not spammy, so that I stay on plan. |

---

## 3. Requirement Refinement

### 3.1 Functional Requirements

#### Goal (US-01)

| ID | Description | Priority | Source |
|---|---|---|---|
| FR-001 | Tạo/xem/sửa/xóa (soft) Goal với các thuộc tính: title, description, category, status, start_date, target_date, target_contribution, icon/color. | Must | US-01 |
| FR-002 | Quản lý Goal Category (thêm/sửa/xóa); seed mặc định: Career, Education, Research, Finance, Business, Personal Development, Health, Other. | Must | US-01, P-01 |
| FR-003 | Goal Status: Not Started, Active, Paused, Completed, Archived; người dùng đổi trạng thái thủ công. | Must | US-01 |
| FR-004 | Progress (%) = Completed Contribution / Target Contribution × 100. Thanh tiến độ hiển thị tối đa 100%; phần vượt được ghi nhận và hiển thị riêng (ví dụ "+120 vượt mục tiêu"). | Must | US-01 |
| FR-005 | Progress được tính lại khi Task thay đổi trạng thái, Contribution hoặc Goal liên kết. | Must | US-01 |
| FR-006 | Khi sửa Target Contribution: giữ Completed Contribution, tính lại %, ghi Activity "Target A → B, Progress X% → Y%". Milestone đã hoàn thành không bị thu hồi. | Must | D-10 |
| FR-007 | Khi Progress đạt ≥ 100%: hiển thị gợi ý "đánh dấu Goal hoàn thành?". Chỉ khi người dùng xác nhận mới chuyển Completed và trao Goal Completion Reward. Người dùng cũng có thể đánh dấu Completed khi chưa đạt 100%. | Must | D-11 |
| FR-008 | Khi Goal Completed: lưu completed_at, tổng Contribution tại thời điểm hoàn thành; không xóa Task liên quan. | Must | US-01 |
| FR-009 | Goal có target_date: hiển thị số ngày còn lại; cảnh báo khi gần hạn; cảnh báo khi tiến độ thấp hơn kỳ vọng (công thức D-20); không tự kết luận thất bại khi quá hạn. | Should | US-01, D-20 |

#### Task (US-02)

| ID | Description | Priority | Source |
|---|---|---|---|
| FR-010 | Tạo/xem/sửa/xóa (soft) Task với: title, description, priority, contribution, goal_id (tùy chọn), estimated_duration (phút), deadline (tùy chọn). | Must | US-02 |
| FR-011 | Priority: Critical, High, Medium, Low. Priority độc lập với Contribution, không dùng để tính Contribution. | Must | US-02 |
| FR-012 | Contribution nhập trực tiếp; có preset Major/Medium/Minor với giá trị cấu hình được. | Must | US-02, P-01 |
| FR-013 | Một Task gắn tối đa một Goal; có thể không gắn Goal. | Must | US-02 |
| FR-014 | Trạng thái: TODO → IN_PROGRESS → COMPLETED; TODO/IN_PROGRESS → CANCELLED; COMPLETED → hoàn tác luôn quay về **IN_PROGRESS**. Lưu lịch sử chuyển trạng thái. | Must | US-02, D-14 |
| FR-015 | Hoàn thành Task: cập nhật status, completed_at, Goal Progress, Reward, Streak, Milestone, Notification, Activity — xử lý idempotent. | Must | US-02, P-04 |
| FR-016 | Hoàn tác Task Completed: tạo giao dịch đảo ngược Contribution và XP (xem FR-024). | Must | D-03 |
| FR-017 | Ghi nhận Actual Duration (phút) tùy chọn khi hoặc sau khi hoàn thành. | Should | US-02, D-01 |

#### Reward — kiếm XP (US-03, US-06)

| ID | Description | Priority | Source |
|---|---|---|---|
| FR-020 | Task XP = Contribution × Multiplier × DurationFactor; DurationFactor = clamp(D / RefDuration, MinFactor, MaxFactor); D = min(Estimated, Actual) nếu có Actual, ngược lại = Estimated. Mọi hệ số cấu hình được. | Must | D-01 |
| FR-021 | Task có Contribution < SmallThreshold **không nhận XP ngay**; Contribution được cộng vào Accumulation Pool. Khi Pool ≥ PoolTarget → trao một lần Pool Reward XP, Pool giảm đi PoolTarget (phần dư giữ sang vòng sau). | Must | D-02 |
| FR-022 | Task có Contribution ≥ SmallThreshold nhận Task XP (FR-020) ngay khi Completed. | Must | D-02 |
| FR-023 | Milestone Reward và Goal Completion Reward: số XP cấu hình theo từng Milestone/Goal, có giá trị mặc định. | Must | US-06 |
| FR-024 | Hoàn tác Task: tạo giao dịch REVERSAL bằng đúng số XP đã nhận; Task nhỏ thì trừ Contribution khỏi Pool (Pool có thể âm), Pool Reward đã trả không thu hồi. | Must | D-03 |
| FR-025 | Hai số dư tách biệt: **Lifetime XP** (tổng kiếm được, chỉ giảm khi đảo ngược thưởng) quyết định Level; **Spendable XP** (dùng để đổi thưởng) giảm khi đổi thưởng và khi bị phạt. Spendable XP được phép âm. | Must | D-03, D-04, D-09 |
| FR-026 | Level = floor(max(Lifetime XP, 0) / XPPerLevel) + 1; XPPerLevel cấu hình được (mặc định 1000). | Must | D-04, D-19 |
| FR-027 | Mọi giao dịch XP lưu: id, nguồn (Task/Milestone/Goal/Pool/Redemption/Penalty), loại, số XP, ảnh hưởng Lifetime/Spendable, lý do, thời điểm. Tổng Lifetime và Spendable luôn bằng tổng giao dịch. | Must | US-07, P-03 |
| FR-028 | Màn hình Reward Settings cho phép chỉnh mọi tham số ở FR-020…FR-026. | Must | P-02 |

#### Reward Shop — đổi XP (US-04, mới)

| ID | Description | Priority | Source |
|---|---|---|---|
| FR-030 | Thêm/sửa/xóa (soft) Reward Item: tên, mô tả, giá XP, ảnh/icon (tùy chọn), điều kiện mở khóa (tùy chọn). | Must | US-04 |
| FR-031 | Điều kiện mở khóa tùy chọn: đạt Level X, hoặc hoàn thành một Milestone cụ thể, hoặc hoàn thành một Goal cụ thể. Mặc định: không có điều kiện. | Should | D-05 |
| FR-032 | Đổi thưởng chỉ thành công khi Item đã mở khóa và Spendable XP ≥ giá; tạo giao dịch REDEEM trừ Spendable XP. | Must | US-04 |
| FR-033 | Hoàn tác một lần đổi thưởng: tạo giao dịch đảo ngược hoàn lại Spendable XP. | Must | D-05 |
| FR-034 | Xem lịch sử đổi thưởng. | Must | US-04, US-07 |

#### Milestone (US-06)

| ID | Description | Priority | Source |
|---|---|---|---|
| FR-040 | Thêm/sửa/xóa Milestone thuộc một Goal: title, description, target_date, điều kiện hoàn thành, XP thưởng. | Must | US-06 |
| FR-041 | Điều kiện hoàn thành (chọn một): (a) Completed Contribution của Goal ≥ X; (b) tất cả Task được gắn vào Milestone đều Completed. Không có hoàn thành thủ công. | Must | D-12 |
| FR-042 | Khi điều kiện thỏa: tự chuyển Completed, lưu completed_at, trao Milestone Reward, hiển thị thành tựu trên Dashboard, ghi Activity. | Must | US-06 |
| FR-043 | Khi hoàn tác Task làm điều kiện không còn thỏa: Milestone mở lại, đảo Milestone Reward. Hoàn thành lại thì trao lại (không trùng). Goal đã Completed do người dùng xác nhận thì giữ nguyên. | Must | D-13 |

#### Streak & Check-in (US-05)

| ID | Description | Priority | Source |
|---|---|---|---|
| FR-050 | Productivity Streak: một ngày (theo múi giờ người dùng) được tính khi có ≥ 1 Task Completed trong ngày. | Must | D-06 |
| FR-051 | Goal Streak: cho mỗi Goal, ngày được tính khi có ≥ 1 Task của Goal đó Completed. | Should | D-06 |
| FR-052 | Streak Freeze: N lượt/tháng (cấu hình). Ngày không hoạt động sẽ tự dùng Freeze nếu còn, giữ chuỗi. | Should | D-06 |
| FR-053 | Hiển thị streak hiện tại, streak dài nhất và lịch hoạt động. | Must | US-05 |
| FR-054 | Check-in hằng ngày (ghi chú/tâm trạng) — chỉ là nhật ký, không tính Streak. | Could | D-06 |

#### Penalty (US-08)

| ID | Description | Priority | Source |
|---|---|---|---|
| FR-060 | Task có Deadline, chưa Completed/Cancelled khi quá Deadline → đánh dấu **Missed**, gửi cảnh báo in-app, đưa vào hàng chờ review. | Must | US-08 |
| FR-061 | Review Missed Task: người dùng chọn một Missed Reason tag và tùy chọn: dời Deadline, hủy Task, hoặc giữ nguyên. | Must | US-08 |
| FR-062 | Quản lý Missed Reason tag (thêm/sửa/xóa), mỗi tag có cờ "miễn trừ phạt". Seed: Bất khả kháng (miễn), Lỗi hệ thống/đồng bộ (miễn), Goal đang Paused (miễn), Lịch quá tải/Assistant đề xuất sai (miễn), Ước lượng sai (không miễn), Trì hoãn (không miễn). | Must | D-07, P-01 |
| FR-063 | Sau Grace Period (mặc định 24h sau Deadline), nếu Task vẫn Missed và chưa có lý do miễn trừ → trừ P% (mặc định 50%) **XP danh nghĩa** của Task vào **Spendable XP** (giao dịch PENALTY), làm tròn lên số nguyên. XP danh nghĩa = XP theo công thức FR-020, áp dụng cho mọi Task kể cả Task nhỏ (chỉ góp Pool) và mọi Priority. Không ảnh hưởng Lifetime XP / Level. | Must | D-08, D-09, D-15 |
| FR-064 | Nếu sau khi bị phạt người dùng chọn lý do miễn trừ → giao dịch đảo ngược hoàn lại XP. | Must | D-08 |
| FR-065 | Hủy Task (CANCELLED) yêu cầu chọn Missed Reason tag; lý do không miễn trừ → áp dụng Penalty như FR-063. | Must | D-07 |
| FR-066 | Tự miễn phạt (không cần người dùng chọn) khi Goal của Task đang Paused. | Must | D-07, P-05 |
| FR-067 | Bật/tắt XP Deduction toàn cục; cấu hình P% và Grace Period. | Must | P-02 |

#### Dashboard, Activity, Notification in-app

| ID | Description | Priority | Source |
|---|---|---|---|
| FR-070 | Dashboard: Today (Task hôm nay, đã hoàn thành, quá hạn), Goal Overview (progress, contribution, days remaining, status), Reward (Level, Lifetime XP, Spendable XP, XP hôm nay, Pool progress, thưởng gần đây), Streak, cảnh báo chưa đọc. | Must | US-01…08 |
| FR-071 | Activity History ghi mọi sự kiện quan trọng (Task, Goal, Milestone, XP, Redemption, Penalty, cấu hình); lọc theo thời gian, Goal, Task, loại; xem chi tiết. | Must | US-07 |
| FR-072 | Notification in-app: Missed Task, Deadline sắp tới, Goal đạt 100%, Milestone hoàn thành; đánh dấu đã đọc; không gửi trùng; không nhắc Task đã hoàn thành. | Must | US-08 |
| FR-073 | Goal Detail và Task Detail theo spec §19.3, §19.4 (bao gồm "XP dự kiến" của Task). | Must | US-01, US-02 |

#### Release 2+ (tóm tắt — chi tiết hóa ở vòng phân tích sau)

| ID | Description | Priority | Source |
|---|---|---|---|
| FR-100 | Kết nối Google Calendar; đồng bộ hai chiều Task ↔ Event theo spec §6 (Case 1–6), không tạo Event trùng, xóa Event không mất Task. | Should | US-09 |
| FR-110 | Scheduling Suggestion và Feasibility Check theo spec §7 (chỉ đề xuất, không ghi đè lịch). | Should | US-10 |
| FR-120 | Integration API nhận Event theo Event Envelope (spec §12), API Key, idempotency theo event_id, phân biệt occurred_at/recorded_at, mapping Event → Goal/Contribution do người dùng cấu hình. | Should | US-11 |
| FR-130 | Kênh thông báo ngoài: Telegram, Desktop/Browser; Quiet Hours; tần suất nhắc lại. | Could | US-12 |
| FR-140 | Advanced: Weekly Review, Goal Analytics, Duration Estimation Improvement, External App Inactivity Detection. | Could | — |

### 3.2 Non-Functional Requirements

| ID | Description | Acceptance Criteria | Priority |
|---|---|---|---|
| NFR-001 | Bền vững dữ liệu | Restart ứng dụng bất kỳ lúc nào không làm mất Goal, Task, giao dịch XP/Contribution đã được xác nhận thành công. | Must |
| NFR-002 | Đối soát | Lifetime XP, Spendable XP, Completed Contribution của mỗi Goal bằng đúng tổng giao dịch tương ứng (sai lệch = 0) tại mọi thời điểm. | Must |
| NFR-003 | Idempotency | Gửi cùng thao tác hoàn thành/hoàn tác/đổi thưởng N lần (N ≥ 2) → đúng 1 giao dịch được tạo. | Must |
| NFR-004 | Hiệu năng Dashboard | Dashboard hiển thị đầy đủ ≤ 2 giây (p95) với 10.000 Task và 50.000 giao dịch. | Should |
| NFR-005 | Thao tác nhanh | Hoàn thành Task ≤ 2 thao tác từ Dashboard; tạo Task chỉ với các trường bắt buộc trên một màn hình. | Must |
| NFR-006 | Màn hình laptop | Sử dụng được đầy đủ trên trình duyệt laptop, độ phân giải tối thiểu 1366×768, không cần cuộn ngang. Không yêu cầu Mobile (D-17). | Must |
| NFR-007 | Múi giờ | Mọi ranh giới ngày tính theo múi giờ cấu hình của người dùng; đổi múi giờ không làm thay đổi lịch sử đã ghi. | Must |
| NFR-008 | Backup | Backup tự động hằng ngày; khôi phục được Goal, Task, giao dịch XP; mất dữ liệu tối đa 24h (RPO). | Must |
| NFR-009 | Truy cập an toàn | Giao diện và API của Hub từ chối mọi kết nối không xuất phát từ chính laptop (localhost). Không cần đăng nhập (D-17). | Must |
| NFR-010 | Cấu hình | Mọi tham số Reward/Penalty/Streak thay đổi qua UI, có hiệu lực cho các giao dịch phát sinh sau thời điểm thay đổi, không hồi tố. | Must |
| NFR-011 | Dark Mode | Hỗ trợ Dark Mode. | Could |

### 3.3 Key Decision Records

| ID | Question | Conclusion | Rationale |
|---|---|---|---|
| D-00 | Thứ tự release | Release 1 = Goal/Task/Progress + toàn bộ Gamification (XP, Level, Shop, Streak, Milestone, Penalty). Calendar, Scheduling, Integration chuyển sang Release 2+. | 5 Whys: pain gốc là động lực; Calendar/Integration chỉ hỗ trợ. Thay đổi thứ tự so với spec §18. |
| D-01 | Công thức XP | Contribution × Multiplier × clamp(D/RefDuration, Min, Max); D = min(Estimated, Actual nếu có). | Có xét Duration nhưng chặn khai khống thời lượng. |
| D-02 | Task nhỏ | Contribution < SmallThreshold → không nhận XP ngay, chỉ góp Pool; đủ PoolTarget → thưởng một lần, phần dư giữ lại. | Đúng tinh thần spec §8.2-B; khuyến khích làm nhiều việc nhỏ. |
| D-03 | Hoàn tác Task | Đảo ngược đầy đủ; Pool và Spendable XP được phép âm; Pool Reward đã trả không thu hồi. | Chặn khai thác "hoàn thành → đổi thưởng → hoàn tác"; giữ ledger nguyên vẹn. |
| D-04 | Level vs đổi thưởng | Tách Lifetime XP (Level) và Spendable XP (đổi thưởng). | Đổi thưởng không làm tụt thành tựu. |
| D-05 | Ràng buộc Reward Item | Mặc định không ràng buộc; tùy chọn điều kiện mở khóa; cho hoàn tác đổi thưởng. Không giới hạn số lần/kỳ. | Đơn giản, linh hoạt. |
| D-06 | Streak | Productivity + Goal Streak (≥1 Task Completed/ngày), có Streak Freeze. Check-in không tính streak. Bỏ App Streak. | Streak phải phản ánh hoạt động có ý nghĩa. |
| D-07 | Penalty & miễn trừ | Cảnh báo + trừ XP. Miễn trừ theo Missed Reason tag do người dùng quản lý; áp dụng cả khi hủy Task. | Có trách nhiệm nhưng công bằng. |
| D-08 | Mức phạt | P% (mặc định 50%) Task XP dự kiến, sau Grace Period (mặc định 24h); hoàn lại nếu sau đó chọn lý do miễn trừ. | Không phạt ngay khi vừa quá hạn (spec §9.4). |
| D-09 | Phạm vi phạt | Chỉ trừ Spendable XP. | Không xóa thành tựu đã đạt. |
| D-10 | Đổi Target Contribution | Tính lại %, ghi lịch sử, không thu hồi Milestone. | Minh bạch, không mất dữ liệu. |
| D-11 | Goal đạt 100% | Gợi ý, người dùng xác nhận mới Completed và nhận thưởng. | Người dùng là người quyết định. |
| D-12 | Điều kiện Milestone | Ngưỡng Contribution hoặc tập Task liên kết; không có thủ công. | Tự động, tránh tự khai. |
| D-13 | Hoàn tác ảnh hưởng Milestone/Goal | Mở lại Milestone + đảo thưởng; Goal đã xác nhận Completed giữ nguyên. | Nhất quán với điều kiện tự động. |
| D-14 | Hoàn tác Task về trạng thái nào | Luôn về IN_PROGRESS. | Đơn giản; nghĩa là "việc chưa xong hẳn". |
| D-15 | Phạt Task nhỏ | Mức phạt = ceil(P% × XP danh nghĩa theo FR-020), áp dụng mọi Task, mọi Priority. | Một công thức thống nhất; Task nhỏ vẫn có trách nhiệm tương xứng. |
| D-16 | Phạm vi Pool | Một Accumulation Pool chung cho mọi Task nhỏ, kể cả Task không gắn Goal. | Đơn giản, thưởng thường xuyên hơn. |
| D-17 | Môi trường sử dụng & truy cập | Hub chạy local trên laptop, chỉ chấp nhận truy cập từ chính máy (localhost), không có màn hình đăng nhập. Không hỗ trợ Mobile. App ngoài (Release 2) vẫn phải dùng API Key. | Người dùng chỉ dùng laptop; bảo vệ bằng tài khoản hệ điều hành. |
| D-18 | Giá trị mặc định (bộ cân bằng, chỉnh được) | Multiplier 1.0; RefDuration 60'; Min/MaxFactor 0.5/2.0; SmallThreshold 20; PoolTarget 100; Pool Reward 120 XP; Milestone 300 XP; Goal Completion 1000 XP; Penalty 50%; Grace 24h; Streak Freeze 2/tháng; Preset Major/Medium/Minor 100/50/10. | Thưởng vừa phải; Pool đầy sau khoảng 10 việc nhỏ. |
| D-19 | Bảng Level | Mỗi Level cần cố định XPPerLevel (mặc định 1000, cấu hình được): Level = floor(max(Lifetime XP, 0) / XPPerLevel) + 1. | Đơn giản, dễ dự đoán. |
| D-20 | Cảnh báo Goal | Expected% = (ngày đã trôi từ start_date) / (target_date − start_date) × 100. Cảnh báo chậm khi Progress < Expected − BehindMargin (mặc định 15 điểm %). Cảnh báo gần hạn khi còn ≤ NearDueDays (mặc định 14) ngày và chưa Completed. Chỉ áp dụng Goal Active có cả start_date và target_date. | Đơn giản, minh bạch, cấu hình được. |

---

## 4. MoSCoW Priority Overview

### Must Have (Release 1)
- Goal CRUD, Category, Status, Progress theo Contribution, đổi Target, gợi ý hoàn thành.
- Task CRUD, Priority, Contribution preset, trạng thái, hoàn thành idempotent, hoàn tác có đảo ngược.
- XP theo công thức D-01, Pool cho Task nhỏ, Milestone/Goal Reward, Lifetime vs Spendable XP, Level, Reward Settings.
- Reward Shop: Item CRUD, đổi thưởng, hoàn tác đổi thưởng, lịch sử.
- Milestone tự động hoàn thành + mở lại khi hoàn tác.
- Productivity Streak, hiển thị streak.
- Penalty: Missed detection, Reason tag có cờ miễn trừ, trừ Spendable XP sau Grace Period, hoàn lại.
- Dashboard, Activity History, Notification in-app, Goal/Task Detail.
- NFR: bền vững, đối soát, idempotency, thao tác nhanh, màn hình laptop, múi giờ, backup, truy cập an toàn, cấu hình.

### Should Have
- Goal deadline warnings (FR-009), Actual Duration (FR-017), unlock condition (FR-031), Goal Streak (FR-051), Streak Freeze (FR-052).
- Release 2: Google Calendar two-way sync (FR-100), Scheduling Assistant (FR-110), Integration API (FR-120).
- Hiệu năng Dashboard (NFR-004).

### Could Have
- Check-in nhật ký (FR-054), Dark Mode, kênh thông báo ngoài (FR-130), tính năng Advanced (FR-140).

### Won't Have (this iteration)
- Nhiều người dùng, đăng ký tài khoản, RBAC, multi-tenant.
- Phạt tiền thật / cam kết tài chính.
- App Streak (streak theo mở app/check-in).
- Hoàn thành Milestone thủ công.
- Giới hạn số lần đổi Reward Item theo kỳ.
- Task gắn nhiều Goal.
- Giao diện Mobile, truy cập từ thiết bị khác ngoài laptop, màn hình đăng nhập.

---

## 5. Constraints & Assumptions

### 5.1 Constraints
- Một người dùng duy nhất.
- Google Calendar là hệ thống lịch chính (Release 2); Hub không thay thế Calendar.
- Ứng dụng ngoài chỉ gửi Event, không trực tiếp sửa XP/Progress (Release 2).
- Đơn vị thời lượng: phút.
- Không tự động thay đổi lịch của người dùng.
- Hub chạy local (localhost), không nhận kết nối từ Internet → Release 2 phải phát hiện thay đổi Google Calendar mà không dựa vào kết nối đến (inbound) từ Internet.

### 5.2 Assumptions
- A-02: Thay đổi cấu hình Reward/Penalty không hồi tố giao dịch cũ (NFR-010).
- A-03: Hoàn tác Task không trực tiếp phá Streak đã ghi nếu ngày đó vẫn còn Task Completed khác; nếu không còn, ngày đó không còn được tính (Streak tính lại từ dữ liệu).
- A-04: Missed Task không trực tiếp reset Streak (Streak chỉ phụ thuộc ngày có Task Completed).
- A-05: Task không có Deadline không bao giờ bị Missed.

---

## 6. Open Questions

| ID | Question | Status | Owner |
|---|---|---|---|
| Q-01 | Công thức cảnh báo chậm / gần hạn (FR-009)? | Resolved → D-20 | User |
| Q-02 | Hoàn tác Task Completed quay về trạng thái nào? | Resolved → D-14: luôn về IN_PROGRESS | User |
| Q-03 | Bảng Level mặc định? | Resolved → D-19 | User |
| Q-04 | Hub dùng ở đâu, mức xác thực? | Resolved → D-17: local laptop, localhost-only, không đăng nhập | User |
| Q-05 | Giá trị mặc định các tham số. | Resolved → D-18 (bộ cân bằng) | User |
| Q-06 | Penalty cho Task nhỏ (XP dự kiến = 0) và theo Priority? | Resolved → D-15 | User |
| Q-07 | Pool tích lũy chung hay riêng theo từng Goal? | Resolved → D-16: một Pool chung | User |
| Q-08 | Calendar conflict policy khi hai phía cùng thay đổi (spec §21.6). | Deferred (Release 2) | User |
| Q-09 | Cách ánh xạ Event từ từng app vào Goal/Contribution (spec §21.7). | Deferred (Release 2) | User |
