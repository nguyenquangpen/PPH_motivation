# Hướng dẫn kết nối Google Calendar (chi tiết từng bước)

Ngày: 2026-11-27. Bổ sung cho mục 3 của `docs/guides/2026-11-08-setup-0.2.0.md` (bản tóm tắt); tài liệu này đi sâu hơn, kèm xử lý lỗi và lưu ý bảo mật. Thiết kế kỹ thuật: `docs/design/2026-11-08-release-2-design.md`.

Quy ước: các mệnh đề về Google đều ghi nguồn chính thức ngay cạnh. Chỗ nào chưa kiểm chứng được ghi **"Chưa xác minh"**. Tên menu trên Google Cloud Console đổi khá thường xuyên; nếu màn hình của bạn khác, hãy tìm theo ý nghĩa.

---

## 1. Bạn được gì

Sau khi kết nối, mỗi **phiên làm việc** (session) của một Task trong Hub sẽ thành **một Event trên Google Calendar** (lịch chính). Hub đẩy phiên lên Google trong khoảng 1 phút và đọc thay đổi từ Google mỗi 5 phút (hoặc bấm **Đồng bộ ngay**). Nếu bạn kéo/sửa/xóa Event ngay trên Google thì **Google thắng**: giờ trong Hub đổi theo, Event bị xóa thì phiên bị gỡ khỏi Hub. Hub cũng đọc các lịch bạn chọn để biết giờ nào đang **bận**, từ đó **Gợi ý lịch** không xếp trùng.

Phạm vi quyền app xin (theo `google-provider.ts`): `openid`, `email` và `https://www.googleapis.com/auth/calendar` (xem/sửa/xóa mọi lịch bạn truy cập được; Google mô tả scope này tại <https://developers.google.com/workspace/calendar/api/auth>).

---

## 2. Các bước trên Google Cloud Console

Mở <https://console.cloud.google.com/> bằng tài khoản Google bạn dùng cho lịch.

### 2.1 Tạo project
Menu (☰) → **IAM & Admin** → **Create a Project** → nhập **Project Name** (ví dụ `PPH Hub`) → **Create**.
Nguồn: <https://developers.google.com/workspace/guides/create-project>.

### 2.2 Bật Google Calendar API
Cách chắc chắn nhất: mở liên kết bật API trực tiếp <https://console.cloud.google.com/flows/enableapi?apiid=calendar-json.googleapis.com>, chọn đúng project, bấm **Enable**.
Nguồn: <https://developers.google.com/workspace/calendar/api/quickstart/nodejs>.
(Đường menu **APIs & Services → Library → Google Calendar API → Enable** mà Hub và hướng dẫn 0.2.0 nhắc: **Chưa xác minh** trên tài liệu Google hiện hành, nhưng liên kết trực tiếp ở trên thì đã có trong tài liệu.)

### 2.3 Cấu hình màn hình đồng ý (OAuth consent screen)
Trong console hiện nay phần này nằm ở **Menu → Google Auth platform** với các mục **Branding**, **Audience**, **Clients**, **Data Access**
(nguồn: <https://developers.google.com/workspace/calendar/api/quickstart/nodejs>, <https://support.google.com/cloud/answer/15549049>).

1. **Menu → Google Auth platform → Branding**. Nếu thấy "Google Auth platform not configured yet" bấm **Get Started**.
2. Nhập **App name** (ví dụ `Productivity Hub`) và **User support email** (email của bạn) → **Next**.
3. Mục **Audience**: chọn **External** (tài khoản Gmail cá nhân không có lựa chọn Internal) → **Next**.
   Nguồn: "External" là loại dành cho mọi tài khoản Google, trạng thái phát hành quyết định ai được cấp quyền: <https://support.google.com/cloud/answer/15549945>.
4. Nhập email liên hệ → **Next** → tick đồng ý chính sách dữ liệu người dùng API → **Continue** → **Create**.
5. Bỏ qua phần scope (app tự xin quyền khi đăng nhập). Nếu muốn khai báo: **Data Access**.

### 2.4 Chọn chế độ phát hành: Testing hay In production

Đây là quyết định quan trọng nhất, vì nó quyết định bạn có phải đăng nhập lại mỗi tuần hay không. Thiết lập ở **Google Auth platform → Audience**.

| Chế độ | Hệ quả | Nguồn |
|---|---|---|
| **Testing** (mặc định) | Chỉ tối đa 100 test user được dùng. **Quyền cấp bởi test user hết hạn sau 7 ngày kể từ lúc đồng ý; refresh token cấp cho offline access cũng hết hạn.** (Ngoại lệ chỉ áp dụng khi app chỉ xin `openid`/email/profile; Hub xin thêm scope Calendar nên **không** được ngoại lệ này.) Hub sẽ báo lỗi và bạn phải bấm **Kết nối** lại mỗi ~7 ngày. | <https://support.google.com/cloud/answer/15549945>, <https://developers.google.com/identity/protocols/oauth2> (mục "Refresh token expiration") |
| **In production** (bấm **Publish app**) | Mọi tài khoản Google đều có thể cấp quyền; không còn giới hạn 7 ngày. Vì app chưa qua xác minh nên sẽ hiện màn hình "chưa xác minh" (mục 3.3) và có trần **100 người dùng mới** suốt đời project (không đặt lại được), thừa cho dùng cá nhân. | <https://support.google.com/cloud/answer/15549945> |

Khuyến nghị (khớp với hướng dẫn trong app và 0.2.0): dùng **In production** cho tài khoản thật để khỏi phải kết nối lại hàng tuần.
- Cách làm: **Audience → Publish app** (nút này đưa app sang **In production**, nguồn <https://support.google.com/cloud/answer/15549945>). Nếu muốn thử trước ở Testing, hãy thêm email của bạn vào danh sách test user ở trang **Audience** (nhãn nút chính xác như "Add users": **Chưa xác minh**, tài liệu Google không nêu; hãy xem trên giao diện).
- Không cần nộp xác minh OAuth cho app chỉ bạn dùng: cứ bấm qua cảnh báo ở 3.3. Việc xác minh chỉ cần khi phát hành cho người dùng đại chúng (<https://support.google.com/cloud/answer/7454865>).
- Lưu ý lý do kỹ thuật khác khiến refresh token ngừng hoạt động dù ở In production: bạn thu hồi quyền; **không dùng trong 6 tháng**; vượt 100 refresh token còn sống cho cùng client; quản trị viên Workspace chặn (`admin_policy_enforced`) (<https://developers.google.com/identity/protocols/oauth2>).

Tùy chọn "Personal mode" (project chỉ cho chính chủ tài khoản, không cần xác minh, không có trần 100 người, không bị hết hạn 7 ngày, không hiện màn hình chưa xác minh; nhưng chọn một lần, không đổi sang External/Internal được): có trong tài liệu <https://support.google.com/cloud/answer/15549945>. **Chưa xác minh:** có chọn được khi tạo project mới trong console của bạn không và Calendar scope có dùng được không. Tài liệu hướng dẫn này không dựa vào lựa chọn đó.

### 2.5 Tạo OAuth client loại Desktop app
**Menu → Google Auth platform → Clients → Create Client** → **Application type: Desktop app** → đặt **Name** (chỉ hiện trong console, ví dụ `PPH Desktop`) → **Create**.
Nguồn: <https://developers.google.com/workspace/guides/create-credentials#oauth-client-id>.

Bạn sẽ thấy **Client ID** và **Client secret** (hoặc nút tải file JSON; bước tải JSON dạng "Download JSON" có trong quickstart <https://developers.google.com/workspace/calendar/api/quickstart/nodejs>). Sao chép hai giá trị này, ở các bước sau gọi là `<CLIENT_ID>` và `<CLIENT_SECRET>`.

Không cần khai báo "Authorized redirect URIs" cho loại Desktop app: Hub dùng địa chỉ loopback `http://127.0.0.1:<cổng ngẫu nhiên>` và PKCE đúng theo luồng chính thức cho ứng dụng máy tính (<https://developers.google.com/identity/protocols/oauth2/native-app>). Tài liệu Google cũng nói client secret của app desktop không thật sự là bí mật, nhưng vẫn nên giữ riêng tư (mục 6).

---

## 3. Nhập vào app và kết nối

### 3.1 Nhập Client ID/Secret
Hub → **Cài đặt** → thẻ **Google Calendar** → khung **OAuth client**:
1. Dán `<CLIENT_ID>` vào ô **Client ID**.
2. Dán `<CLIENT_SECRET>` vào ô **Client Secret** (ô mật khẩu; sau khi lưu sẽ hiện chú thích "(đã lưu — nhập để thay)").
3. Bấm **Lưu** (thông báo "Đã lưu OAuth client"). Nút Lưu chỉ bật khi cả hai ô đều có nội dung.

Hai giá trị được lưu mã hóa trong DB cục bộ. Dự phòng cho người chạy server tự dựng: biến môi trường `PPH_GOOGLE_CLIENT_ID` và `PPH_GOOGLE_CLIENT_SECRET` (chỉ dùng khi DB chưa có).

### 3.2 Kết nối
1. Bấm **Kết nối** (cùng thẻ). Trình duyệt mở trang đăng nhập Google; Hub hiện "Đang chờ xác nhận trên trình duyệt…". Hub chờ tối đa 10 phút (phía server) và giao diện theo dõi khoảng 5 phút; nếu quá hạn, bấm **Kết nối** lại.
2. Chọn đúng tài khoản Google, đồng ý quyền xem/sửa lịch (Hub luôn hiện màn hình đồng ý vì dùng `prompt=consent` để chắc chắn lấy refresh token; nguồn về `access_type=offline` / `prompt=consent`: <https://developers.google.com/identity/protocols/oauth2/web-server>).
3. Trang `127.0.0.1` báo "Đã kết nối Google Calendar. Bạn có thể đóng tab này." Quay lại Hub: huy hiệu **Đang hoạt động**, hiện email tài khoản.

### 3.3 Màn hình "Google hasn't verified this app"
Với app cá nhân chưa xác minh, Google hiện cảnh báo trước màn hình đồng ý. Đây là bình thường: <https://support.google.com/cloud/answer/7454865> mô tả màn hình "unverified app" cho app dùng scope nhạy cảm chưa được xác minh. Cách bấm qua (theo hướng dẫn 0.2.0): **Advanced** → **Go to Productivity Hub (unsafe)** (tên theo App name bạn đặt) → **Continue/Allow**. Chữ chính xác của các nút này: **Chưa xác minh** trên tài liệu Google (trang trên không trích nguyên văn; giao diện có thể thay đổi, và có thể bằng tiếng Việt theo ngôn ngữ tài khoản).
Chỉ bấm qua khi **chính bạn** vừa bấm **Kết nối** và app tên đúng là app của bạn.

### 3.4 Chọn lịch tính giờ bận và giờ làm việc
- Khi trạng thái không còn **Chưa kết nối**, khung **Lịch dùng để tính giờ bận** hiện danh sách lịch (lịch chính có nhãn **Chính**). Tick các lịch cần tính (bỏ Sinh nhật/Ngày lễ nếu muốn) → **Lưu** (cần chọn ít nhất 1 lịch; thông báo "Đã lưu lịch bận").
- Thẻ **Giờ làm việc**: đặt khung giờ cho từng ngày (Thứ 2 … Chủ nhật; **+ Khung** để thêm, ✕ để xóa, trống = **Nghỉ**) → **Lưu giờ làm việc**. Gợi ý lịch chỉ xếp vào các khung này, trừ đi giờ bận.
- **Đồng bộ ngay**: ép đọc/đẩy ngay. **Ngắt kết nối**: xóa liên kết (hỏi xác nhận "Ngắt kết nối Google Calendar?").

---

## 4. Thử an toàn lần đầu (khuyến nghị)

Hub ghi/sửa/xóa Event trên lịch thật, nên hãy thử trước trên tài khoản phụ:
1. Tạo một tài khoản Google phụ (hoặc dùng tài khoản test sẵn có), có lịch gần như trống.
2. Làm mục 2 với tài khoản phụ (project riêng hoặc cùng project, thêm tài khoản phụ làm test user nếu để Testing).
3. Kết nối, rồi thử: thêm phiên ngày mai 19:00-20:00 cho một Task → Event xuất hiện trên Google trong ≤ 1 phút; kéo Event sang giờ khác trên Google → phiên trong Hub đổi theo sau ≤ 5 phút (hoặc **Đồng bộ ngay**); xóa Event trên Google → phiên bị gỡ và có thông báo; hoàn thành Task → Event có dấu "✓ " (theo checklist 0.2.0).
4. Khi ổn: **Ngắt kết nối**, nhập lại/giữ client, bấm **Kết nối** bằng tài khoản thật. (Cùng client dùng được cho nhiều tài khoản; nếu để Testing cần thêm tài khoản thật vào test user.)
5. Thu hồi quyền tài khoản phụ khi xong thử: <https://myaccount.google.com/permissions>.

---

## 5. Xử lý sự cố

| Triệu chứng | Nguyên nhân thường gặp | Cách xử lý |
|---|---|---|
| Bấm Kết nối báo "Chưa cấu hình OAuth client (client id/secret)" | Chưa lưu Client ID/Secret | Làm mục 3.1 |
| `invalid_client` / `unauthorized_client` (hiện trên trang Google hoặc ở thông báo lỗi) | Dán sai/thiếu ký tự Client ID hoặc Secret; client bị xóa; client không phải loại Desktop app | Kiểm tra lại ở **Google Auth platform → Clients**, dán lại, **Lưu**; cần thì tạo client Desktop app mới |
| `access_denied` / "Google từ chối đăng nhập: access_denied" | Bạn bấm Hủy/Từ chối; app ở **Testing** mà email chưa nằm trong test user; tài khoản Workspace bị quản trị chặn | Thêm email vào test user hoặc chuyển **In production** (mục 2.4); thử lại; với Workspace hỏi quản trị viên |
| Báo "state không khớp" | Mở nhiều tab/lần Kết nối cùng lúc | Đóng tab cũ, chỉ bấm **Kết nối** một lần và dùng đúng tab mở ra |
| Hub báo **Lỗi** (huy hiệu đỏ, "token bị thu hồi/hết hạn", lỗi `invalid_grant`) | Ở **Testing** quá 7 ngày; bạn thu hồi quyền; không dùng > 6 tháng (nguồn: <https://developers.google.com/identity/protocols/oauth2>) | Bấm **Kết nối** lại. Về lâu dài chuyển **In production**. Lưu ý Hub chuyển sang **Lỗi** sau khi lỗi kéo dài ≥ 30 phút (theo thiết kế release 2), trong lúc đó vẫn tự thử lại |
| Trình duyệt tới `127.0.0.1:<cổng>` bị từ chối / không tải được | Tường lửa/antivirus chặn cổng loopback; trình duyệt mở trên máy khác (ví dụ truy cập Hub từ xa); mở link sau khi hết hạn chờ | Chạy trình duyệt trên cùng máy với Hub; cho phép Hub trong tường lửa; thử lại. Cổng được chọn ngẫu nhiên mỗi lần nên không cần mở sẵn cổng cố định (<https://developers.google.com/identity/protocols/oauth2/native-app>: `localhost` có thể gặp rắc rối với tường lửa, Hub dùng `127.0.0.1`) |
| "Hết thời gian chờ đăng nhập Google" | Quá 10 phút chưa hoàn tất | Bấm **Kết nối** lại |
| Event không lên Google | Chưa **Đang hoạt động**; mất mạng; phiên chưa đủ điều kiện; lỗi đang chờ thử lại | Xem huy hiệu đồng bộ trên phiên (PENDING/ERROR), "Chờ đẩy: N" ở thẻ Google Calendar; bấm **Đồng bộ ngay** |
| Sửa trên Google mà Hub không đổi | Chưa đến chu kỳ 5 phút; Event nằm ở lịch không phải lịch của Hub | Bấm **Đồng bộ ngay**; nhớ Hub chỉ tạo Event ở lịch chính |
| Gợi ý lịch vẫn xếp vào giờ bận | Lịch đó chưa tick ở **Lịch dùng để tính giờ bận**; ngoài **Giờ làm việc** | Tick lịch và **Lưu**; kiểm tra giờ làm việc |
| Cảnh báo "chưa xác minh" mỗi lần | Bình thường với app chưa qua xác minh | Mục 3.3 |

---

## 6. Lưu ý bảo mật

- Client ID/Secret và token Google được lưu **mã hóa trong DB cục bộ** của Hub (theo `service.ts`/`secret-store.ts`); giao diện không bao giờ hiển thị lại Secret.
- **Không commit** Client Secret, file JSON tải từ Google, hay token lên Git; không dán vào chat/issue. Nếu dùng biến môi trường, đặt trong cấu hình máy, không đặt trong repo.
- Nếu lỡ lộ Secret: vào **Google Auth platform → Clients**, tạo client mới/đổi secret, xóa client cũ rồi nhập lại vào Hub (cách đổi secret chính xác trên giao diện: **Chưa xác minh**).
- Thu hồi quyền truy cập của app bất cứ lúc nào: <https://myaccount.google.com/permissions> → chọn app → **Xóa quyền truy cập** (tên nút theo giao diện, có thể khác). Sau đó bấm **Ngắt kết nối** trong Hub.
- Scope `calendar` cho phép sửa/xóa mọi lịch; nên dùng tài khoản thật chỉ khi đã thử xong ở mục 4.
- Hub chỉ nên chạy trên máy cá nhân của bạn; luồng đăng nhập chỉ lắng nghe `127.0.0.1` (không mở ra mạng ngoài) và đóng cổng ngay sau khi xong.

---

## Phụ lục: danh sách nguồn chính thức đã dùng
- <https://developers.google.com/identity/protocols/oauth2/native-app> (loopback `http://127.0.0.1:port`, PKCE S256, client secret không bí mật với app desktop)
- <https://developers.google.com/identity/protocols/oauth2> (hết hạn refresh token: 7 ngày ở Testing/External; 6 tháng không dùng; thu hồi)
- <https://developers.google.com/identity/protocols/oauth2/web-server> (`access_type=offline`, `prompt=consent`)
- <https://support.google.com/cloud/answer/15549945> (Audience: External, Testing/In production, Publish app, 100 test user, trần 100 user, Personal mode)
- <https://support.google.com/cloud/answer/15549049> (Branding/Audience/Data Access)
- <https://support.google.com/cloud/answer/7454865> (app chưa xác minh)
- <https://developers.google.com/workspace/guides/create-project>, <https://developers.google.com/workspace/guides/create-credentials>, <https://developers.google.com/workspace/calendar/api/quickstart/nodejs> (tạo project, bật API, Clients → Create Client → Desktop app)
- <https://developers.google.com/workspace/calendar/api/auth> (scope Calendar)
