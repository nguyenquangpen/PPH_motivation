# Personal Productivity Hub — Product Requirements Document (PRD)

## Document Info
| Field | Value |
|-------|-------|
| Version | v1.0 |
| Created | 2026-11-05 |
| Last Updated | 2026-11-06 |
| Status | Approved — 2026-11-06 (BDD readiness: Pass) |
| Scope | **Release 1 (Core)** — chi tiết đầy đủ. Release 2+ chỉ liệt kê, sẽ có PRD riêng. |
| Nguồn | `doc_description.md` (Spec v1.0); `2026-11-05-personal-productivity-hub-proposal.md` (Approved) |

---

## 1. Overview

### 1.1 Product/Feature Summary
Personal Productivity Hub là ứng dụng cá nhân, chạy local trên laptop, giúp một người dùng duy trì động lực theo đuổi mục tiêu dài hạn. Mỗi Task hoàn thành được quy đổi thành **Contribution** (tiến độ Goal đo được) và **XP** (phần thưởng tức thì). XP tích lũy nâng **Level** và có thể **đổi lấy phần thưởng đời thực** do người dùng tự định nghĩa. Bỏ lỡ Task có cảnh báo và trừ XP, trừ các lý do được miễn trừ. Mọi thay đổi Contribution/XP đều có giao dịch để đối soát.

### 1.2 Goals
- G-1: Người dùng luôn nhìn thấy tiến độ Goal theo Contribution, cập nhật ngay khi hoàn thành/hoàn tác Task.
- G-2: Mỗi ngày làm việc tạo phản hồi tích cực (XP, Pool, Streak) mà không cần chờ Goal dài hạn.
- G-3: XP có giá trị thực thông qua Reward Shop.
- G-4: Lifetime XP, Spendable XP và Contribution luôn khớp 100% với lịch sử giao dịch.
- G-5: Không có thưởng/phạt bị cộng trùng hoặc phạt sai đối với lý do miễn trừ.

### 1.3 Non-Goals (Release 1)
- Google Calendar sync, Scheduling Assistant, Integration API cho app ngoài, kênh thông báo ngoài (Release 2+).
- Nhiều người dùng, đăng nhập, RBAC, multi-tenant.
- Giao diện Mobile; truy cập từ thiết bị khác ngoài laptop.
- Phạt tiền thật.
- App Streak; hoàn thành Milestone thủ công; giới hạn số lần đổi Reward Item theo kỳ; Task gắn nhiều Goal.

---

## 2. Users & Scenarios

### 2.1 Target Users
| User Role | Description | Core Need |
|---|---|---|
| Owner | Người dùng duy nhất, sở hữu laptop chạy Hub | Thấy tiến bộ, được thưởng ngay, có trách nhiệm công bằng khi bỏ lỡ việc |

### 2.2 Core User Stories
US-01…US-08 — xem Proposal §2.1.

### 2.3 Use Cases
| ID | Description | Trigger | Expected Outcome |
|---|---|---|---|
| UC-001 | Tạo Goal | Owner nhập Goal mới | Goal xuất hiện ở Goals và Dashboard với Progress 0% |
| UC-002 | Tạo Task gắn Goal | Owner nhập Task | Task xuất hiện trong danh sách, hiển thị XP dự kiến |
| UC-003 | Hoàn thành Task lớn | Owner bấm Complete | Goal Progress tăng đúng Contribution; nhận Task XP |
| UC-004 | Hoàn thành Task nhỏ | Owner bấm Complete | Goal Progress tăng; Pool tăng; nhận Pool Reward khi Pool đủ |
| UC-005 | Hoàn tác Task | Owner bấm Undo | Task về IN_PROGRESS; Contribution, XP, Pool, Milestone được đảo ngược |
| UC-006 | Đổi thưởng | Owner chọn Reward Item | Spendable XP giảm đúng giá; lịch sử ghi nhận |
| UC-007 | Task bị Missed | Quá Deadline | Cảnh báo; sau Grace Period trừ XP nếu chưa có lý do miễn trừ |
| UC-008 | Giải trình Missed | Owner chọn lý do miễn trừ | Không phạt hoặc hoàn lại XP đã phạt |
| UC-009 | Đạt Milestone | Điều kiện Milestone thỏa | Milestone Completed + Milestone Reward |
| UC-010 | Goal đạt 100% | Progress ≥ 100% | Gợi ý hoàn thành; Owner xác nhận → Goal Completed + Goal Reward |
| UC-011 | Xem đối soát | Owner mở Activity/Reward History | Thấy mọi giao dịch, tổng khớp số dư |

---

## 3. Functional Requirements

### 3.1 Feature List
| ID | Feature Name | Description | Priority | Proposal FR |
|---|---|---|---|---|
| F-01 | Goal & Category Management | CRUD Goal, Category, Status | Must | FR-001…003, FR-008 |
| F-02 | Goal Progress | Tính Progress theo Contribution ledger | Must | FR-004…006 |
| F-03 | Goal Completion | Gợi ý 100%, xác nhận, Goal Reward | Must | FR-007, FR-008, FR-023 |
| F-04 | Goal Deadline Warnings | Days remaining, gần hạn, chậm kỳ vọng | Should | FR-009 |
| F-05 | Task Management | CRUD Task, Priority, Contribution preset | Must | FR-010…013 |
| F-06 | Task Lifecycle | Chuyển trạng thái, hoàn thành, hoàn tác, Actual Duration | Must (Actual: Should) | FR-014…017 |
| F-07 | Task XP | Công thức XP, XP dự kiến | Must | FR-020, FR-022 |
| F-08 | Accumulation Pool | Pool chung cho Task nhỏ | Must | FR-021, FR-024 |
| F-09 | XP Ledger, Balances & Level | Giao dịch, Lifetime/Spendable, Level | Must | FR-025…027 |
| F-10 | Settings | Tham số Reward/Penalty/Streak/Preset | Must | FR-028, FR-067, FR-012 |
| F-11 | Reward Shop | Item, mở khóa, đổi, hoàn tác đổi | Must (unlock: Should) | FR-030…034 |
| F-12 | Milestone | Điều kiện tự động, thưởng, mở lại | Must | FR-040…043, FR-023 |
| F-13 | Streak | Productivity, Goal Streak, Freeze | Must (Goal Streak, Freeze: Should) | FR-050…053 |
| F-14 | Check-in Journal | Nhật ký hằng ngày | Could | FR-054 |
| F-15 | Missed Task & Penalty | Missed, review, Penalty, miễn trừ | Must | FR-060, 061, 063…066 |
| F-16 | Missed Reason Tags | CRUD tag có cờ miễn trừ | Must | FR-062 |
| F-17 | Dashboard | Tổng quan | Must | FR-070 |
| F-18 | Activity History | Nhật ký, bộ lọc | Must | FR-071 |
| F-19 | In-app Notification | Cảnh báo, dedupe, đã đọc | Must | FR-072 |
| F-20 | Goal & Task Detail | Màn hình chi tiết | Must | FR-073 |
| F-90 | Google Calendar Sync | Release 2 — PRD riêng | Should | FR-100 |
| F-91 | Scheduling Assistant | Release 2 — PRD riêng | Should | FR-110 |
| F-92 | Integration API | Release 2 — PRD riêng | Should | FR-120 |
| F-93 | External Notification Channels | Release 2+ | Could | FR-130 |
| F-94 | Advanced Productivity | Release 2+ | Could | FR-140 |

### 3.0 Quy ước chung (áp dụng mọi Feature)

- **Thời gian:** lưu và trao đổi theo ISO 8601 có offset. "Ngày" = ngày lịch theo múi giờ Owner cấu hình (IANA, mặc định `Asia/Ho_Chi_Minh`).
- **Thời lượng:** số nguyên phút.
- **XP, Contribution:** số nguyên. Kết quả công thức XP làm tròn nửa lên (round half up) về số nguyên; Penalty làm tròn lên (ceil).
- **Phạm vi giá trị:** contribution int 0–10.000; estimated_duration, actual_duration int 1–1.440; target_contribution int 1–1.000.000; price_xp int 1–1.000.000.
- **Deadline:** datetime; nếu Owner chỉ chọn ngày → 23:59 ngày đó theo múi giờ Owner.
- **Text:** title 1–200 ký tự (sau khi trim), description 0–5.000 ký tự, UTF-8.
- **Soft delete:** đối tượng bị xóa ẩn khỏi danh sách mặc định, vẫn tồn tại trong lịch sử; giao dịch không bao giờ bị xóa.
- **Idempotency:** mọi thao tác thay đổi Contribution/XP/Pool mang một khóa thao tác; gửi lại cùng khóa trả cùng kết quả, không tạo giao dịch mới.
- **Activity:** mọi thao tác thành công trong mục 3.2 ghi một Activity entry (F-18).
- **Cấu hình không hồi tố:** giao dịch đã tạo không đổi khi Settings thay đổi.

### 3.2 Feature Details

---

#### F-01: Goal & Category Management
**Description:** Owner tạo, xem, sửa, xóa (soft) Goal và Goal Category.

**Input (Goal):**
| Field | Type | Required | Constraint |
|---|---|---|---|
| title | string | Yes | 1–200 ký tự |
| description | string | No | ≤ 5.000 ký tự |
| category_id | ref | Yes | Category tồn tại, chưa bị xóa |
| start_date | date | No | |
| target_date | date | No | ≥ start_date nếu cả hai có |
| target_contribution | int | Yes | 1–1.000.000 |
| goal_reward_xp | int | No | ≥ 0; trống = dùng mặc định Settings (1000) |
| icon, color | string | No | |

**Input (Category):** name (1–50 ký tự, duy nhất không phân biệt hoa thường), color (tùy chọn).

**Output:** Goal với id, status, progress (F-02), created_at, updated_at, completed_at.

**Business Rules:**
1. Goal mới có status = Not Started.
2. Owner đổi status thủ công giữa: Not Started, Active, Paused, Archived. Chuyển sang Completed chỉ qua F-03.
3. Goal Completed có thể chuyển về Active (mở lại); Goal Reward đã trao **không** bị đảo ngược; xác nhận hoàn thành lần sau không trao thêm Goal Reward.
4. Seed Category: Career, Education, Research, Finance, Business, Personal Development, Health, Other — có thể sửa/xóa.
5. Xóa Category đang được Goal dùng: bị chặn.
6. Xóa Goal (soft): Task liên kết giữ nguyên, goal_id vẫn trỏ tới Goal đã xóa; Contribution ledger giữ nguyên.

**Error & Exception Scenarios:**
| Scenario | Trigger | Expected Behavior |
|---|---|---|
| Thiếu title | title rỗng/chỉ khoảng trắng | Từ chối, báo "Title bắt buộc" |
| Target không hợp lệ | target_contribution ngoài phạm vi | Từ chối, báo phạm vi hợp lệ |
| Ngày sai | target_date < start_date | Từ chối, báo lỗi ngày |
| Category trùng tên | Tên đã tồn tại | Từ chối |
| Xóa Category đang dùng | Category có Goal chưa xóa | Từ chối, báo số Goal đang dùng |
| Đặt Completed trực tiếp | Đổi status = Completed qua F-01 | Từ chối, hướng dẫn dùng F-03 |

**Boundary Conditions:** title đúng 200 ký tự → chấp nhận; 201 → từ chối. start_date = target_date → chấp nhận.

**State Behavior:** Goal lưu bền vững; Archived/xóa không ảnh hưởng ledger.

---

#### F-02: Goal Progress
**Description:** Tính tiến độ Goal từ Contribution ledger.

**Input:** Contribution ledger entries của Goal; target_contribution.

**Output:**
| Field | Type | Rule |
|---|---|---|
| completed_contribution | int | Tổng ledger của Goal |
| progress_percent | decimal 1 chữ số | completed / target × 100, làm tròn xuống 0,1 |
| display_percent | decimal | min(progress_percent, 100) |
| overflow_contribution | int | max(completed − target, 0) |
| remaining_contribution | int | max(target − completed, 0) |

**Business Rules:**
1. Khi Task gắn Goal chuyển sang COMPLETED: ghi entry `CONTRIBUTION_ADD` = contribution của Task tại thời điểm hoàn thành.
2. Khi hoàn tác: ghi `CONTRIBUTION_REVERSAL` = −(giá trị đã add).
3. Chỉ Task COMPLETED đóng góp; TODO/IN_PROGRESS/CANCELLED không đóng góp.
4. Contribution được ghi cho Goal ở mọi status (kể cả Paused/Completed/Archived); Task của các Goal này vẫn hoàn thành và nhận XP bình thường.
5. Sửa target_contribution: completed_contribution giữ nguyên; progress tính lại; Activity ghi "Target A → B, Progress X% → Y%". Milestone đã Completed không bị mở lại vì thay đổi Target.
6. Contribution, goal_id, estimated_duration, actual_duration của Task COMPLETED bị khóa; muốn sửa phải Undo trước (F-06).
7. Thanh tiến độ hiển thị display_percent; nếu overflow > 0 hiển thị nhãn "+{overflow} vượt mục tiêu".

**Error & Exception Scenarios:**
| Scenario | Trigger | Expected Behavior |
|---|---|---|
| Hoàn thành trùng | Cùng khóa thao tác gửi 2 lần | Chỉ 1 entry CONTRIBUTION_ADD |
| Ledger âm | Reversal làm completed < 0 (do dữ liệu lỗi) | Không xảy ra theo thiết kế; nếu phát hiện → ghi lỗi đối soát, hiển thị cảnh báo hệ thống |

**Boundary Conditions:** completed = target → 100%, overflow 0. completed = target + 1 → display 100%, overflow 1. target = 1000, completed = 130 → 13,0%.

**State Behavior:** Progress luôn tính lại được từ ledger; không có giá trị tổng hợp nào là nguồn sự thật.

---

#### F-03: Goal Completion
**Description:** Gợi ý và xác nhận hoàn thành Goal, trao Goal Reward.

**Business Rules:**
1. Khi progress_percent chuyển từ < 100 lên ≥ 100 và Goal chưa Completed: tạo Notification "Goal {title} đã đạt mục tiêu — đánh dấu hoàn thành?".
2. Owner xác nhận → status = Completed, completed_at = now, lưu completed_contribution tại thời điểm đó, ghi giao dịch `GOAL_REWARD` (+goal_reward_xp vào Lifetime và Spendable).
3. Owner có thể đánh dấu Completed khi progress < 100%: hệ thống yêu cầu xác nhận lần hai; Goal Reward vẫn được trao đầy đủ.
4. Goal Reward chỉ trao **một lần trong vòng đời Goal**.
5. Hoàn tác Task làm progress < 100% không thay đổi Goal đã Completed và không đảo Goal Reward (D-13).
6. Task liên quan không bị xóa hay đổi trạng thái.

**Error & Exception Scenarios:**
| Scenario | Trigger | Expected Behavior |
|---|---|---|
| Xác nhận trùng | Bấm xác nhận 2 lần | 1 giao dịch GOAL_REWARD |
| Xác nhận Goal đã Completed | Goal đã Completed | Không đổi gì, báo đã hoàn thành |
| Goal đã xóa | Xác nhận Goal soft-deleted | Từ chối |

**Boundary Conditions:** progress đúng 100,0% → gợi ý. Progress dao động 99→100→99→100 trước khi xác nhận → tối đa 1 Notification chưa đọc cho Goal đó *(xem F-19)*.

**State Behavior:** Cờ "đã nhận Goal Reward" bền vững.

---

#### F-04: Goal Deadline Warnings (Should)
**Business Rules:**
1. days_remaining = target_date − hôm nay (ngày, theo múi giờ Owner); âm = quá hạn N ngày, hiển thị "Quá hạn N ngày", **không** đổi status.
2. Áp dụng cảnh báo chỉ cho Goal status Active có cả start_date và target_date.
3. Expected% = clamp((hôm nay − start_date) / (target_date − start_date) × 100, 0, 100). Nếu start_date = target_date → Expected = 100.
4. Cảnh báo **chậm** khi progress_percent < Expected% − BehindMargin (mặc định 15).
5. Cảnh báo **gần hạn** khi 0 ≤ days_remaining ≤ NearDueDays (mặc định 14).
6. Mỗi loại cảnh báo tối đa 1 Notification / Goal / ngày.

**Boundary Conditions:** progress = Expected − 15 đúng → không cảnh báo; thấp hơn 0,1 → cảnh báo. days_remaining = 14 → cảnh báo; 15 → không.

---

#### F-05: Task Management
**Input:**
| Field | Type | Required | Constraint |
|---|---|---|---|
| title | string | Yes | 1–200 ký tự |
| description | string | No | ≤ 5.000 |
| priority | enum | Yes | CRITICAL, HIGH, MEDIUM, LOW |
| contribution | int | Yes | 0–10.000; có thể chọn preset Major/Medium/Minor (100/50/10) rồi sửa |
| goal_id | ref | No | Goal tồn tại, chưa xóa |
| milestone_ids | ref[] | No | Milestone thuộc cùng Goal của Task |
| estimated_duration | int (phút) | Yes | 1–1.440 |
| deadline | datetime | No | Chỉ chọn ngày → 23:59 ngày đó; khi tạo/sửa phải > now |

**Output:** Task với id, status = TODO, expected_xp (F-07), is_small (contribution < SmallThreshold), created_at, updated_at.

**Business Rules:**
1. Priority không ảnh hưởng Contribution hay XP.
2. Một Task gắn tối đa một Goal.
3. Gắn Task vào Milestone yêu cầu Task gắn cùng Goal với Milestone.
4. Xóa Task (soft): Task TODO/IN_PROGRESS/CANCELLED xóa không tạo giao dịch. Task COMPLETED: yêu cầu xác nhận, hệ thống thực hiện Undo (F-06, đảo ngược đầy đủ) rồi soft delete trong cùng một thao tác nguyên tử. Penalty đã áp dụng (nếu có) giữ nguyên.
5. Task COMPLETED bị khóa sửa contribution, goal_id, milestone_ids, estimated_duration, actual_duration.

**Error & Exception Scenarios:**
| Scenario | Trigger | Expected Behavior |
|---|---|---|
| Thiếu trường bắt buộc | title/priority/contribution/estimated_duration trống | Từ chối, chỉ rõ trường |
| Giá trị ngoài phạm vi | contribution/duration ngoài phạm vi | Từ chối |
| Goal không hợp lệ | goal_id không tồn tại/đã xóa | Từ chối |
| Milestone khác Goal | milestone thuộc Goal khác | Từ chối |

---

#### F-06: Task Lifecycle
**State machine:**
```
TODO ──start──> IN_PROGRESS ──complete──> COMPLETED
TODO ──complete──> COMPLETED
TODO / IN_PROGRESS ──cancel──> CANCELLED
COMPLETED ──undo──> IN_PROGRESS
```

**Business Rules — Complete:**
1. Chỉ từ TODO hoặc IN_PROGRESS.
2. Trong một thao tác nguyên tử: status = COMPLETED; completed_at = now; F-02 CONTRIBUTION_ADD (nếu có Goal); F-07 TASK_REWARD **hoặc** F-08 POOL_ADD; F-12 kiểm tra Milestone; F-13 cập nhật Streak; F-03 kiểm tra 100%; F-18 Activity.
3. Idempotent theo khóa thao tác.
4. Hoàn thành Task đang Missed: nhận Contribution và XP đầy đủ; hết Missed. Nếu hoàn thành trước khi đánh giá phạt (trong Grace) → không phạt. Nếu đã bị phạt → PENALTY giữ nguyên, trừ khi Owner chọn tag miễn trừ (F-15).

**Business Rules — Undo:**
1. Chỉ từ COMPLETED → IN_PROGRESS; completed_at = null.
2. Tạo đảo ngược của **chính các giao dịch lần hoàn thành gần nhất**: CONTRIBUTION_REVERSAL; XP REVERSAL (nếu có TASK_REWARD) hoặc POOL_DEDUCT (nếu là Task nhỏ). POOL_REWARD đã trả không đảo.
3. F-12: mở lại Milestone không còn thỏa điều kiện và đảo Milestone Reward.
4. F-13: Streak tính lại.
5. Spendable XP và Pool được phép âm.

**Business Rules — Cancel:**
1. Chỉ từ TODO hoặc IN_PROGRESS. CANCELLED là trạng thái cuối (không chuyển đi đâu được).
2. Task chưa Missed (không có deadline hoặc now ≤ deadline): không cần tag, không phạt.
3. Task đang Missed: bắt buộc chọn Missed Reason tag. Tag miễn trừ (hoặc Goal Paused, hoặc Penalty Enabled = false) → không phạt. Tag không miễn → `PENALTY` **ngay lập tức** (không chờ Grace), trừ khi Task đã bị phạt cho deadline hiện tại.
4. Đổi tag của Task CANCELLED sau đó áp dụng F-15 rule 5.

**Business Rules — Actual Duration (Should):** Owner nhập actual_duration (int 1–1.440 phút) trong lúc hoàn thành hoặc khi Task chưa COMPLETED. Task COMPLETED bị khóa; muốn sửa phải Undo.

**Error & Exception Scenarios:**
| Scenario | Trigger | Expected Behavior |
|---|---|---|
| Chuyển trạng thái không hợp lệ | Ví dụ CANCELLED → COMPLETED, TODO → undo | Từ chối, trạng thái không đổi |
| Complete lặp | Cùng khóa thao tác | Trả kết quả lần đầu, không giao dịch mới |
| Complete lại sau Undo | Complete → Undo → Complete | Giao dịch mới hợp lệ (khóa thao tác khác) |
| Lỗi giữa chừng | Lỗi khi đang ghi giao dịch | Không có thay đổi nào được lưu (all-or-nothing) |

**State Behavior:** Lịch sử chuyển trạng thái lưu: from, to, thời điểm, lý do (nếu có).

---

#### F-07: Task XP
**Formula:**
```
DurationFactor = clamp(D / RefDuration, MinFactor, MaxFactor)
D = min(estimated_duration, actual_duration) nếu actual_duration có, ngược lại estimated_duration
NominalXP = round_half_up(Contribution × Multiplier × DurationFactor)
```
Mặc định: Multiplier 1.0, RefDuration 60, MinFactor 0.5, MaxFactor 2.0.

**Business Rules:**
1. Task **lớn** (contribution ≥ SmallThreshold = 20): khi COMPLETED nhận `TASK_REWARD` = NominalXP (Lifetime +, Spendable +).
2. Task **nhỏ** (contribution < SmallThreshold): không nhận TASK_REWARD (F-08).
3. expected_xp hiển thị trên Task: NominalXP với Task lớn; "0 XP + {contribution} vào Pool" với Task nhỏ.
4. Tham số dùng là giá trị Settings **tại thời điểm hoàn thành**.
5. Task không gắn Goal vẫn nhận XP theo cùng công thức.

**Examples (mặc định):**
| contribution | estimated | actual | D | Factor | XP |
|---|---|---|---|---|---|
| 100 | 120 | – | 120 | 2.0 | 200 |
| 100 | 15 | – | 15 | 0.5 | 50 |
| 100 | 600 | – | 600 | 2.0 (chặn) | 200 |
| 100 | 120 | 45 | 45 | 0.75 | 75 |
| 50 | 60 | 90 | 60 | 1.0 | 50 |
| 19 | 60 | – | – | – | 0 (Task nhỏ) |

---

#### F-08: Accumulation Pool
**Business Rules:**
1. Một Pool chung cho mọi Task nhỏ (kể cả không gắn Goal).
2. Task nhỏ COMPLETED → `POOL_ADD` = contribution.
3. Sau mỗi POOL_ADD: chừng nào Pool ≥ PoolTarget (100): ghi `POOL_REWARD` (+PoolRewardXP = 120 vào Lifetime và Spendable) và `POOL_PAYOUT` (Pool −PoolTarget). Lặp lại cho mỗi PoolTarget vượt qua (ví dụ Pool 50 + 260 khi PoolTarget = 100 → 3 POOL_REWARD, Pool còn 10).
4. Undo Task nhỏ → `POOL_DEDUCT` = −contribution; Pool có thể âm; POOL_REWARD đã trả không đảo.
5. Dashboard hiển thị Pool hiện tại / PoolTarget.

**Boundary Conditions:** Pool 90 + 10 = 100 → thưởng, Pool còn 0. Pool 95 + 10 = 105 → thưởng, còn 5. Pool 0, undo Task 10 → Pool −10.

**State Behavior:** Pool = tổng POOL_ADD + POOL_DEDUCT + POOL_PAYOUT; bền vững; không reset theo thời gian.

---

#### F-09: XP Ledger, Balances & Level
**Transaction types:**
| Type | Lifetime Δ | Spendable Δ | Source |
|---|---|---|---|
| TASK_REWARD | +X | +X | Task |
| POOL_REWARD | +X | +X | Pool |
| MILESTONE_REWARD | +X | +X | Milestone |
| GOAL_REWARD | +X | +X | Goal |
| REWARD_REVERSAL | −X | −X | Giao dịch reward bị đảo |
| REDEEM | 0 | −price | Redemption |
| REDEEM_REVERSAL | 0 | +price | Redemption bị hoàn tác |
| PENALTY | 0 | −X | Task |
| PENALTY_REVERSAL | 0 | +X | Penalty bị hoàn |

**Mỗi giao dịch lưu:** id, type, lifetime_delta, spendable_delta, source_type, source_id, reversed_transaction_id (nếu là đảo ngược), reason (text), created_at, operation_key.

**Business Rules:**
1. Lifetime XP = Σ lifetime_delta; Spendable XP = Σ spendable_delta.
2. Giao dịch không bao giờ bị sửa/xóa.
3. Một giao dịch chỉ bị đảo ngược tối đa một lần.
4. Level = floor(max(Lifetime XP, 0) / XPPerLevel) + 1; XPPerLevel mặc định 1000.
5. Khi Level tăng: Notification + Activity "Lên Level N".
6. Reward History hiển thị mọi giao dịch, lọc theo type, khoảng thời gian, nguồn.

**Boundary Conditions:** Lifetime 999 → Level 1; 1000 → Level 2. Spendable −50 hợp lệ.

---

#### F-10: Settings
**Tham số (đều sửa được qua UI, mặc định theo D-18/D-19/D-20):**
| Nhóm | Tham số | Mặc định | Ràng buộc |
|---|---|---|---|
| XP | Multiplier | 1.0 | > 0, ≤ 100 |
| XP | RefDuration | 60 | int 1–1440 |
| XP | MinFactor / MaxFactor | 0.5 / 2.0 | 0 < Min ≤ Max ≤ 10 |
| Pool | SmallThreshold | 20 | int ≥ 0 (0 = tắt Pool) |
| Pool | PoolTarget | 100 | int ≥ 1 |
| Pool | PoolRewardXP | 120 | int ≥ 0 |
| Reward | Default Milestone XP | 300 | int ≥ 0 |
| Reward | Default Goal Completion XP | 1000 | int ≥ 0 |
| Level | XPPerLevel | 1000 | int ≥ 1 |
| Penalty | Enabled | true | bool |
| Penalty | PenaltyPercent | 50 | int 0–100 |
| Penalty | GracePeriodHours | 24 | int 0–168 |
| Streak | FreezesPerMonth | 2 | int 0–31 |
| Goal warning | BehindMargin / NearDueDays | 15 / 14 | int 0–100 / int 0–365 |
| Preset | Major / Medium / Minor | 100 / 50 / 10 | int, phạm vi như contribution |
| Chung | Timezone | Asia/Ho_Chi_Minh | IANA hợp lệ |

**Business Rules:**
1. Thay đổi có hiệu lực cho giao dịch tạo sau thời điểm lưu; không hồi tố.
2. Mỗi lần lưu ghi Activity với giá trị cũ → mới.
3. Có nút "Khôi phục mặc định" cho từng nhóm.

**Error:** giá trị vi phạm ràng buộc → từ chối, không lưu phần nào của lần lưu đó.

---

#### F-11: Reward Shop
**Input (Item):** name (1–100), description (≤ 1.000), price_xp (int 1–1.000.000), icon (tùy chọn), unlock_condition (tùy chọn; một trong: `LEVEL ≥ N`, `MILESTONE_COMPLETED(id)`, `GOAL_COMPLETED(id)`).

**Business Rules:**
1. Item hiển thị trạng thái: Có thể đổi / Chưa đủ XP / Bị khóa (kèm điều kiện).
2. Đổi thành công khi: Item chưa xóa, điều kiện mở khóa thỏa **tại thời điểm đổi**, Spendable XP ≥ price_xp → giao dịch REDEEM, ghi Redemption (item snapshot: name, price), Activity.
3. Hoàn tác một Redemption → REDEEM_REVERSAL; mỗi Redemption chỉ hoàn tác một lần.
4. Sửa giá Item không ảnh hưởng Redemption cũ.
5. Không giới hạn số lần đổi.
6. Item đã từng mở khóa nhưng điều kiện không còn thỏa (ví dụ Milestone bị mở lại) → bị khóa lại.

**Error & Exception Scenarios:**
| Scenario | Trigger | Expected Behavior |
|---|---|---|
| Không đủ XP | Spendable < price (kể cả Spendable âm) | Từ chối, hiển thị số XP còn thiếu |
| Bị khóa | Điều kiện chưa thỏa | Từ chối, hiển thị điều kiện |
| Đổi lặp | Cùng khóa thao tác | 1 giao dịch REDEEM |
| Hoàn tác lặp | Redemption đã hoàn tác | Từ chối |
| Item đã xóa | Đổi Item soft-deleted | Từ chối |

**Boundary Conditions:** Spendable = price → thành công, còn 0.

---

#### F-12: Milestone
**Input:** goal_id (bắt buộc), title, description, target_date (tùy chọn), condition_type (`CONTRIBUTION_THRESHOLD` | `LINKED_TASKS`), threshold (int ≥ 1, khi THRESHOLD), reward_xp (int ≥ 0, trống = mặc định 300).

**Business Rules:**
1. `CONTRIBUTION_THRESHOLD`: thỏa khi completed_contribution của Goal ≥ threshold.
2. `LINKED_TASKS`: thỏa khi có ≥ 1 Task liên kết chưa xóa và **tất cả** Task liên kết chưa xóa và không CANCELLED đều COMPLETED. *(Task CANCELLED bị bỏ qua khi xét)*
3. Điều kiện được đánh giá sau mỗi thay đổi Contribution ledger của Goal, thay đổi trạng thái/liên kết Task, và khi tạo/sửa Milestone.
4. Chuyển chưa thỏa → thỏa: status Completed, completed_at, `MILESTONE_REWARD`, Notification, Activity, hiển thị thành tựu trên Dashboard.
5. Chuyển thỏa → không thỏa **do hoàn tác/xóa Task**: status về Pending, completed_at = null, REWARD_REVERSAL cho Milestone Reward gần nhất.
6. Thay đổi target_contribution của Goal không mở lại Milestone (D-10).
7. Tại mọi thời điểm, số MILESTONE_REWARD chưa bị đảo của một Milestone ≤ 1.

**Error:** Milestone thiếu Goal / threshold ≤ 0 / không có điều kiện → từ chối.

**Boundary Conditions:** completed = threshold → Completed. Milestone LINKED_TASKS không có Task nào → không bao giờ tự Completed.

---

#### F-13: Streak
**Business Rules:**
1. **Active day (Productivity):** ngày (múi giờ Owner) có ≥ 1 Task có completed_at trong ngày và hiện đang COMPLETED.
2. **Goal active day:** như trên nhưng chỉ xét Task của Goal đó.
3. current_streak = số ngày liên tiếp kết thúc ở hôm nay (nếu hôm nay active) hoặc hôm qua, trong đó mỗi ngày là active hoặc được phủ bởi Freeze.
4. Hôm nay chưa active không làm đứt chuỗi cho đến hết ngày.
5. **Freeze** (Should): khi một ngày kết thúc không active và current_streak > 0, tự động dùng 1 Freeze nếu tháng đó còn lượt → chuỗi giữ nguyên (ngày freeze không cộng vào độ dài chuỗi). Hết lượt → chuỗi về 0. Số lượt reset về FreezesPerMonth vào ngày 1 mỗi tháng, không cộng dồn. Freeze chỉ áp dụng cho Productivity Streak; Goal Streak không dùng Freeze.
6. longest_streak = chuỗi dài nhất từng đạt.
7. Streak tính lại hoàn toàn từ dữ liệu Task + Freeze đã dùng; hoàn tác Task có thể làm ngày đó không còn active (A-03).
8. Missed Task không trực tiếp ảnh hưởng Streak (A-04).
9. Hiển thị lịch hoạt động 12 tuần gần nhất (ngày active / freeze / trống).

---

#### F-14: Check-in Journal (Could)
Owner ghi tối đa 1 entry/ngày: mood (1–5, tùy chọn), note (≤ 2.000 ký tự). Sửa được trong cùng ngày. Không ảnh hưởng Streak/XP.

---

#### F-15: Missed Task & Penalty
**Business Rules:**
1. Task có deadline, status TODO/IN_PROGRESS, now > deadline → **Missed** (cờ, không phải status). Task không có deadline không bao giờ Missed.
2. Khi chuyển Missed: Notification "Task quá hạn" (1 lần / Task / giá trị deadline) và đưa vào Missed Review queue.
3. **Review:** Owner chọn 1 Missed Reason tag (F-16) và một hành động: dời deadline (giá trị mới > now → hết Missed), hủy Task (F-06 Cancel), hoặc giữ nguyên. Có thể đổi tag sau.
4. **Đánh giá phạt** tại thời điểm deadline + GracePeriodHours, nếu Task vẫn Missed:
   - Penalty Enabled = false → không phạt.
   - Goal của Task đang Paused → không phạt, tự gán tag "Goal đang Paused".
   - Tag hiện tại có cờ miễn trừ → không phạt.
   - Ngược lại (chưa có tag hoặc tag không miễn) → `PENALTY` = ceil(PenaltyPercent% × NominalXP) với NominalXP theo F-07 (áp dụng cả Task nhỏ, mọi Priority), chỉ trừ Spendable.
5. Sau khi bị phạt, đổi sang tag miễn trừ → `PENALTY_REVERSAL`. Đổi ngược lại tag không miễn → phạt lại (tối đa 1 PENALTY chưa đảo / Task / giá trị deadline).
6. Mỗi Task bị phạt tối đa một lần cho mỗi giá trị deadline; dời deadline rồi lại quá hạn → có thể bị đánh giá phạt lần nữa.
7. Đổi Penalty Enabled không hồi tố giao dịch PENALTY đã có.

**Error & Exception Scenarios:**
| Scenario | Trigger | Expected Behavior |
|---|---|---|
| Hệ thống tắt lúc đến hạn đánh giá | App không chạy tại deadline + grace | Khi khởi động lại, đánh giá bù đúng một lần cho các Task đã quá hạn đánh giá |
| Đánh giá lặp | Job chạy 2 lần | 1 giao dịch PENALTY |
| Dời deadline về quá khứ | Giá trị mới ≤ now | Từ chối |
| NominalXP = 0 | contribution = 0 | PENALTY = 0 → không tạo giao dịch, vẫn ghi Activity |

**Boundary Conditions:** now = deadline → chưa Missed; now = deadline + 1 phút → Missed. Grace = 0 → đánh giá ngay khi Missed.

---

#### F-16: Missed Reason Tags
**Input:** name (1–50, duy nhất), exempt (bool).
**Seed:** Bất khả kháng (miễn), Lỗi hệ thống/đồng bộ (miễn), Goal đang Paused (miễn, **hệ thống, không xóa được**), Lịch quá tải/Assistant đề xuất sai (miễn), Ước lượng sai (không miễn), Trì hoãn (không miễn).
**Rules:** Sửa cờ exempt không hồi tố phạt đã có. Xóa tag đang được Task dùng → soft delete, Task giữ tag cũ trong lịch sử.

---

#### F-17: Dashboard
Hiển thị trên một màn hình (1366×768, cuộn dọc cho phép):
- **Today:** số Task có deadline hôm nay, Task đã hoàn thành hôm nay, Task Missed, danh sách Task hôm nay với nút Complete (1 thao tác).
- **Goals:** mỗi Goal Active/Not Started/Paused: tên, thanh tiến độ, completed/target, days remaining, status, cảnh báo F-04.
- **Reward:** Level, Lifetime XP, Spendable XP, XP kiếm hôm nay (Σ lifetime_delta > 0 hôm nay), Pool x/PoolTarget, 5 giao dịch gần nhất.
- **Streak:** current, longest, Freeze còn lại tháng này.
- **Alerts:** Notification chưa đọc, Missed Review queue (số lượng).
- **Achievements:** Milestone hoàn thành gần nhất (5).

---

#### F-18: Activity History
Mỗi entry: id, timestamp, type, mô tả, liên kết Goal/Task/Milestone/Item, before/after (nếu có). Lọc: khoảng thời gian, Goal, Task, type; phân trang 50/trang; mới nhất trước. Entry không sửa/xóa được.

---

#### F-19: In-app Notification
**Types:** TASK_MISSED, TASK_DEADLINE_SOON (24 giờ trước deadline, 1 lần / Task / giá trị deadline), GOAL_REACHED_100, GOAL_BEHIND, GOAL_NEAR_DUE, MILESTONE_COMPLETED, LEVEL_UP, POOL_REWARD.
**Rules:**
1. Đánh dấu đã đọc từng cái / tất cả.
2. Dedupe key = (type, object_id, kỳ). Không tạo Notification mới nếu đã có cùng key chưa đọc.
3. Không tạo TASK_DEADLINE_SOON / TASK_MISSED cho Task đã COMPLETED/CANCELLED; Notification chưa đọc của Task đó bị ẩn khi Task hoàn thành.
4. Lưu lịch sử tối thiểu 90 ngày.

---

#### F-20: Goal & Task Detail
- **Goal Detail:** description, progress, completed/remaining/overflow, target date, Milestones (trạng thái), Related Tasks (theo status), Activity của Goal.
- **Task Detail:** mọi thuộc tính F-05, status, Missed/tag, expected XP (hoặc "vào Pool"), XP thực nhận, Actual Duration, lịch sử trạng thái.

---

## 4. Non-Functional Requirements

### 4.1 Performance Requirements
| Metric | Requirement | Measurement Method |
|---|---|---|
| Dashboard load | ≤ 2 s p95 với 10.000 Task, 50.000 giao dịch (Should) | Đo 20 lần tải trên laptop mục tiêu với dữ liệu sinh sẵn |
| Complete/Undo | ≤ 500 ms p95 đến khi UI phản ánh kết quả | Đo end-to-end 50 lần |

### 4.2 Security Requirements
- Giao diện và API chỉ nhận kết nối từ localhost; kết nối từ địa chỉ khác bị từ chối.
- Không có đăng nhập (D-17).

### 4.3 Usability Requirements
- Hoàn thành Task ≤ 2 thao tác từ Dashboard.
- Tạo Task chỉ với trường bắt buộc trên một form.
- Mọi số XP/Contribution hiển thị kèm khả năng mở lịch sử giao dịch nguồn.
- Dark Mode (Could).

### 4.4 Compatibility Requirements
- Trình duyệt desktop phiên bản hiện hành (Chrome, Edge); độ phân giải ≥ 1366×768, không cuộn ngang.
- Windows laptop.

### 4.5 Reliability & Data
- Restart bất kỳ lúc nào không mất thao tác đã báo thành công.
- Thao tác đa bước (Complete, Undo, Redeem, Penalty) là nguyên tử.
- Đối soát: Lifetime/Spendable/Pool/Contribution mỗi Goal = Σ ledger, sai lệch 0. Có chức năng "Kiểm tra đối soát" hiển thị kết quả.
- Backup tự động hằng ngày; khôi phục được; RPO ≤ 24 h. Có hướng dẫn khôi phục.

---

## 5. Constraints & Dependencies

### 5.1 Constraints
- Một người dùng; chạy local trên laptop; chỉ localhost.
- Đơn vị thời lượng: phút; XP/Contribution: số nguyên.
- Release 2 phải phát hiện thay đổi Google Calendar không dựa vào inbound từ Internet.

### 5.2 External Dependencies
- Release 1: không có.
- Release 2+: Google Calendar, ứng dụng cá nhân bên ngoài.

### 5.3 Assumptions
- Đồng hồ hệ thống laptop chính xác.
- Laptop có thể tắt; các đánh giá theo thời gian được bù khi khởi động lại (F-15).

---

## 6. BDD Testability Check
*(Chạy lại 2026-11-06 sau khi PC-01…PC-16 được chấp nhận)*

| Dimension | Status | Ghi chú |
|---|---|---|
| Input/Output format | Pass | §3.0, bảng Input từng Feature |
| Error & exception scenarios | Pass | Bảng Error mỗi Feature; Task COMPLETED sửa/xóa (F-05, F-06) |
| Boundary & priority rules | Pass | Missed + Complete, Cancel, Pool nhiều ngưỡng, ranh giới Level/Progress/Grace |
| State behavior | Pass | Ledger, Freeze, Goal không Active, đánh giá bù khi khởi động lại |
| Verifiable granularity | Pass | |
| Ambiguity check | Pass | |

### 6.1 Resolved Confirmations (đã chấp nhận 2026-11-06)
| ID | Câu hỏi | Quy tắc đã chốt |
|---|---|---|
| PC-01 | Làm tròn NominalXP | Làm tròn nửa lên (round half up) về số nguyên |
| PC-02 | Phạm vi giá trị | contribution int 0–10.000; estimated/actual_duration int 1–1.440; target_contribution int 1–1.000.000; price_xp int 1–1.000.000 |
| PC-03 | Sửa contribution / goal / duration của Task COMPLETED | Khóa — phải Undo trước khi sửa (actual_duration cũng chỉ nhập trước/lúc hoàn thành) |
| PC-04 | Xóa Task COMPLETED | Tự Undo (đảo ngược như F-06) rồi soft delete, có xác nhận |
| PC-05 | Hoàn thành Task đã Missed | Nhận XP/Contribution đầy đủ; nếu trong Grace → không phạt; nếu đã bị phạt → giữ phạt (trừ khi chọn tag miễn trừ) |
| PC-06 | Định dạng deadline | datetime; nếu chỉ chọn ngày → 23:59 ngày đó theo múi giờ Owner |
| PC-07 | Cancel | Cancel trước deadline: không cần tag, không phạt. Cancel khi đã Missed: bắt buộc tag, tag không miễn → phạt ngay (không chờ Grace). CANCELLED là trạng thái cuối |
| PC-08 | Streak Freeze | Tự dùng cho ngày không active khi current_streak > 0; reset vào ngày 1 mỗi tháng, không cộng dồn; hết Freeze → chuỗi đứt |
| PC-09 | Pool vượt nhiều ngưỡng trong 1 lần | Trao 1 POOL_REWARD cho mỗi PoolTarget vượt qua |
| PC-10 | Task của Goal Paused/Completed/Archived | Vẫn hoàn thành được và vẫn ghi Contribution/XP bình thường |
| PC-11 | Nhắc deadline Task | TASK_DEADLINE_SOON 24 giờ trước deadline, 1 lần / Task / giá trị deadline |
| PC-12 | Mở lại Goal Completed | Cho phép về Active; Goal Reward chỉ trao 1 lần trong vòng đời Goal |
| PC-13 | Task CANCELLED trong Milestone LINKED_TASKS | Bị bỏ qua khi xét điều kiện |
| PC-14 | Reward Item mất điều kiện mở khóa | Bị khóa lại |
| PC-15 | NFR bổ sung | Complete/Undo ≤ 500 ms p95; chức năng "Kiểm tra đối soát"; lưu Notification ≥ 90 ngày |
| PC-16 | Laptop tắt lúc đến hạn đánh giá phạt | Đánh giá bù đúng 1 lần khi khởi động lại |
| PC-17 | Phạm vi Streak Freeze | Chỉ Productivity Streak |
| PC-18 | Deadline trong quá khứ | Khi tạo/sửa, deadline phải > now |

---

## 7. Glossary
| Term | Definition |
|---|---|
| Contribution | Số nguyên Owner gán cho Task, thể hiện mức đóng góp vào Goal |
| Completed Contribution | Tổng Contribution ledger của Goal |
| NominalXP | XP tính theo công thức F-07, bất kể Task lớn hay nhỏ |
| Task lớn / nhỏ | contribution ≥ / < SmallThreshold |
| Accumulation Pool | Quỹ Contribution chung của Task nhỏ, đổi ra POOL_REWARD khi đủ PoolTarget |
| Lifetime XP | Tổng XP thưởng ròng; quyết định Level |
| Spendable XP | Số dư XP để đổi thưởng; giảm khi đổi và khi bị phạt; có thể âm |
| Missed | Cờ của Task quá deadline chưa COMPLETED/CANCELLED |
| Grace Period | Thời gian sau deadline trước khi đánh giá phạt |
| Missed Reason Tag | Lý do bỏ lỡ do Owner quản lý, có cờ miễn trừ |
| Streak Freeze | Lượt giữ chuỗi cho một ngày không active |
| Operation key | Khóa idempotency của một thao tác |
| Ledger | Tập giao dịch bất biến làm nguồn sự thật cho XP, Contribution, Pool |
