# KB Mail — Hệ thống quản lý kiến thức & hỗ trợ trả lời email tự động

Quy trình: **đọc mail theo folder → gom full luồng → đánh tag / AI tự phân loại → job quét mail gắn cờ → kiến thức khớp + AI chat soạn trả lời → Duyệt OK → gửi mail vào đúng luồng → lịch sử & báo cáo**.

## Cài đặt

```bash
npm install
cp .env.example .env   # điền GRAPH_TOKEN, MAIL_FOLDER, cấu hình LLM, AUTH_SECRET
node -e "console.log('AUTH_SECRET='+require('crypto').randomBytes(32).toString('hex'))" >> .env  # sinh khóa ký phiên
npm run user add admin 'MatKhauManh' 'Quản trị viên'   # tạo tài khoản đăng nhập đầu tiên
npm run dev            # mở http://localhost:3000 (sẽ chuyển tới /login)
```

**GRAPH_TOKEN**: access token Microsoft Graph (delegated), scope `Mail.Read` + `Mail.Send`. Lấy nhanh từ [Graph Explorer](https://developer.microsoft.com/graph/graph-explorer) (tab Access token). Token sống ~1 giờ; chạy production nên đăng ký Azure AD app + refresh token.

**LLM** (AI chat + tự phân loại): mọi API tương thích OpenAI.

| Provider | LLM_BASE_URL | Ghi chú |
| --- | --- | --- |
| LM Studio | `http://localhost:1234/v1` | Bật Local Server, LLM_API_KEY tùy ý |
| Ollama | `http://localhost:11434/v1` | LLM_MODEL = tên model đã pull |
| OpenAI/OpenRouter... | URL của provider | Cần API key thật |

## 1. Lấy dữ liệu email — nhiều file import

```bash
npm run fetch-emails
```

Mỗi lần fetch (hoặc nạp file trên giao diện) lưu thành **một file riêng** `data/imports/emails-<thời điểm>-<folder>.json`. Hệ thống tự **gộp mọi file**, khử trùng lặp theo `conversationId` (giữ bản nhiều mail nhất); tag/summary/solution không bị mất khi nạp thêm dữ liệu mới.

## 2. Quản lý kiến thức (`/`)

- Xem danh sách file import đã nạp, nạp thêm file mới
- **Nạp thủ công** — thả/chọn file **`.msg`** (Outlook) hoặc **`.eml`** (chuẩn RFC 822/MIME): hệ thống tự parse, giải mã tiêu đề/nội dung (UTF-8, base64, quoted-printable, đa charset), gom luồng theo chủ đề và lưu thành file import. Hoặc nạp trực tiếp `emails.json`.
- Xem full luồng mail (from/to/cc/body), đánh tag tay
- **🤖 AI phân loại**: LLM tự sinh tag + tóm tắt + giải pháp cho 1 luồng hoặc mọi luồng chưa có tag (ưu tiên dùng lại tag có sẵn, không ghi đè giải pháp đã nhập tay)
- **🗑 Xóa kiến thức**: gỡ một luồng khỏi kho (ẩn khỏi danh sách + xóa tag/tóm tắt/giải pháp). Luồng đã xóa được ghi nhận theo `conversationId` trong `data/deleted.json` nên **không hiện lại** sau các lần nạp/quét sau.

## 3. Job quét mail gắn cờ

```bash
npm run job          # 1 lần (cron/Task Scheduler)
npm run job:watch    # lặp mỗi JOB_INTERVAL_MINUTES phút (chiếm terminal)
```

### Chạy nền với pm2 (background)

[pm2](https://pm2.keymetrics.io/) là trình quản lý tiến trình Node giúp job chạy ngầm, không chiếm terminal, tự bật lại khi crash. Cấu hình nằm ở [`ecosystem.config.cjs`](ecosystem.config.cjs) (tên tiến trình: `kb-mail-job`).

**1. Cài pm2 (1 lần duy nhất, toàn máy):**

```bash
npm i -g pm2
pm2 -v        # kiểm tra đã cài
```

**2. Bật / dừng job nền** — dùng script npm cho gọn:

| Lệnh npm | Tương đương pm2 | Tác dụng |
| --- | --- | --- |
| `npm run job:bg` | `pm2 start ecosystem.config.cjs` | Bật chạy nền |
| `npm run job:bg:logs` | `pm2 logs kb-mail-job` | Xem log realtime |
| `npm run job:bg:stop` | `pm2 stop kb-mail-job` | Tạm dừng (giữ trong danh sách) |

**3. Theo dõi & quản lý:**

```bash
pm2 list                  # trạng thái các tiến trình (online/stopped, RAM, CPU)
pm2 logs kb-mail-job      # xem log realtime
pm2 monit                 # bảng theo dõi trực quan
pm2 restart kb-mail-job   # nạp lại sau khi sửa code hoặc .env
pm2 delete kb-mail-job    # xoá hẳn khỏi pm2
```

**4. Tự khởi động lại khi reboot máy (tùy chọn):**

```bash
npm run job:bg            # đảm bảo job đang chạy
pm2 startup               # in ra 1 lệnh — copy & chạy lại lệnh đó (cần quyền sudo)
pm2 save                  # lưu danh sách tiến trình hiện tại
```

**Chu kỳ chạy:** ưu tiên **"⏱ Chu kỳ quét tự động"** đặt trên trang [Cấu hình rule tự động](#4b-cấu-hình-rule-tự-động-rules) (lưu ở `rules.json`) — job watch đọc lại mỗi vòng nên **đổi là áp dụng ngay vòng kế tiếp, không cần restart**. Nếu chưa đặt thì dùng `JOB_INTERVAL_MINUTES` trong `.env` (mặc định 10 phút).

**Log:** ghi vào `data/logs/job-out.log` (stdout) và `data/logs/job-err.log` (stderr), có gắn timestamp. Thư mục `data/logs/` đã được `.gitignore`.

**Xử lý sự cố:**

- `pm2 list` thấy `status` là `errored` hoặc số `↺` (restart) tăng liên tục → xem `pm2 logs kb-mail-job` để tìm lỗi (thường do `GRAPH_TOKEN` hết hạn hoặc cấu hình LLM sai trong `.env`).
- Sửa `.env` xong job vẫn dùng giá trị cũ → phải `pm2 restart kb-mail-job` (pm2 nạp env lúc khởi động).

Lấy mail **gắn cờ (flagged)** qua Graph API, so khớp kho kiến thức (tag + từ khóa subject/summary), ghi vào lịch sử hỗ trợ với trạng thái `pending`. Nháp trả lời được điền sẵn từ giải pháp khớp nhất.

## 4. Hỗ trợ trả lời (`/suggestions`)

- Mỗi mail gắn cờ: kiến thức khớp kèm điểm số + **AI chat** hỏi đáp dựa trên các lần hỗ trợ trước (nút nhanh: *Soạn mail trả lời*, *Đã xử lý thế nào?*; câu trả lời AI có nút *Dùng làm nội dung trả lời*)
- Quy trình duyệt: sửa nháp → **✔ Duyệt OK** → nút **📧 Gửi mail** mới mở → reply vào đúng luồng qua Graph
- Trạng thái: `pending` → `approved` → `sent`

## 4b. Cấu hình rule tự động (`/rules`)

Trang **⚙️ Cấu hình rule tự động** cho phép đặt các **rule**: khi job quét mail gắn cờ, mỗi mail được xét lần lượt theo danh sách rule (từ trên xuống) — **rule khớp đầu tiên** quyết định hành động. Áp dụng cho **cả job nền (pm2) lẫn nút quét trên trang Hỗ trợ trả lời**.

**📥 Quét thêm Inbox** — mail gắn cờ **luôn được xử lý**; bật thêm tùy chọn này (checkbox) để quét cả mail **chưa đọc** trong folder cấu hình (mặc định `Inbox`) và áp rule. Ràng buộc an toàn ở chế độ inbox: rule **chỉ soạn + lưu nháp** (không bao giờ tự gửi, kể cả rule "GỬI THẬT"); chỉ xét mail **chưa đọc nhận trong hôm nay** (từ 0h theo giờ máy chủ); **mỗi mail xử lý 1 lần** (dedup theo `messageId`); tối đa **15 mail/vòng** (phần dư xử lý ở vòng sau, có log).

**⏱ Chu kỳ quét tự động** — đặt job nền quét 1 lần mỗi bao nhiêu phút. Job watch đọc lại mỗi vòng nên đổi là áp dụng ngay vòng kế tiếp (không cần restart pm2). Bỏ trống/để mặc định thì dùng `JOB_INTERVAL_MINUTES` trong `.env`.

**Điều kiện của một rule** (chỉ xét nhóm có nhập; kết hợp `BẤT KỲ` / `TẤT CẢ`):

- **🏷 Tag (AI phân loại)** — khớp khi mail khớp kiến thức mang một trong các tag chỉ định
- **📌 Chủ đề (subject)** — tiêu đề mail chứa một trong các từ khóa
- **👤 Người gửi / email** — địa chỉ người gửi chứa chuỗi (vd `@fpt.com`, `hr@`)

**Hành động khi khớp:**

- **Không tự xử lý** — giữ ở `pending` để duyệt tay như cũ
- **📝 Tự soạn AI + lưu nháp** — LLM soạn nội dung trả lời, lưu nháp vào Outlook (trạng thái `ai_drafted`); người dùng vẫn Duyệt OK rồi gửi
- **📧 Tự soạn AI + GỬI THẬT** — soạn rồi **gửi reply vào luồng ngay, không cần Duyệt OK**

**An toàn:**

- Hành động do **chính rule** quyết định: để mặc định là *lưu nháp*; chỉ chọn *GỬI THẬT* cho rule đã kiểm thử kỹ (trên trang có cảnh báo đỏ).
- Mỗi rule có **"Chỉ tự xử lý khi có kiến thức khớp"** (mặc định bật) và (với gửi thật) **"Bỏ cờ sau khi gửi"**.
- Mọi lần tự xử lý ghi `ruleName` + `autoSent` vào lịch sử (xem ở `/history`) và in log ở job nền (`data/logs/`).
- Đã xử lý rồi sẽ không lặp lại ở lần quét sau (idempotent theo `messageId`).

Cấu hình lưu ở `data/rules.json`. API: `GET /api/rules`, `PUT /api/rules`.

## 5. Lịch sử & báo cáo (`/history`)

- Thống kê: tổng số, chờ xử lý, đã duyệt, đã gửi, có kiến thức khớp, **tự xử lý bởi rule**, **rule tự gửi thật**, theo tháng
- **🤖 Hỗ trợ theo rule**: mỗi rule kèm số mail đã xử lý (📝 nháp / 📤 gửi); bấm vào để lọc ra **danh sách email do rule đó xử lý**. Nút "Xem tất cả mail do rule xử lý" gộp mọi rule.
- Mỗi mail do rule xử lý có badge `🤖 <tên rule> · 📝 nháp / 📤 tự gửi`
- Tìm kiếm theo tiêu đề / người gửi / nội dung / tag / **tên rule**, lọc theo trạng thái
- Xem lại nội dung đã trả lời từng mail

## 5b. Báo cáo trực quan (`/report`)

Biểu đồ thanh trực quan trên toàn bộ kho mail (đã gộp, khử trùng lặp), có **lọc theo khoảng thời gian** (ngày nhận mail):

- **📤 Người gửi nhiều nhất** — top theo số mail đã gửi (`from`)
- **📥 Người nhận nhiều nhất** — top theo số mail nhận được (`To` + `CC`, mỗi địa chỉ tính 1 lần/mail)
- **📈 Số mail theo tháng** — phân bố mail trong khoảng đã chọn
- Thẻ tổng quan: tổng số mail, số luồng, khoảng lọc đang áp dụng

Chọn *Từ / Đến* rồi **🔍 Xem báo cáo** để lọc; **↺ Toàn bộ thời gian** để xem tất cả. API tương ứng: `GET /api/report?from=YYYY-MM-DD&to=YYYY-MM-DD`.

## 5c. Bot gia sư (trợ lý nổi 🎓)

Nút chat nổi ở góc dưới-phải **mọi trang**. Hỏi đáp tự nhiên về kho kiến thức:

- Câu hỏi được so khớp với kho (cùng thuật toán của job) để lấy các luồng liên quan nhất, đưa vào ngữ cảnh LLM → trả lời **bám dữ liệu thật**, kèm danh sách **nguồn** (các luồng đã dùng).
- Nếu kho chưa có thông tin, bot nói thẳng và gợi ý nạp thêm/đánh tag (không bịa).
- Có sẵn vài câu hỏi gợi ý khi mở lần đầu. Dùng chung cấu hình LLM trong `.env`. API: `POST /api/tutor` `{ question, chatHistory }`.
- **Phóng to/thu nhỏ** (🗖/🗗) cửa sổ chat; **nhiều hội thoại** lưu trong trình duyệt (localStorage): ✚ mở hội thoại mới, 🕘 xem lịch sử, xóa từng hội thoại hoặc **🗑 Xóa tất cả**.

## 6. MCP server — tra cứu bằng Claude Code

[`mcp/server.mjs`](mcp/server.mjs) là một **MCP server** (JSON-RPC qua stdio, không thêm dependency) cho phép Claude Code (hoặc client MCP bất kỳ) truy vấn trực tiếp kho kiến thức, lịch sử hỗ trợ và thông tin job quét cờ.

Project đã có sẵn [`.mcp.json`](.mcp.json) ở thư mục gốc — mở Claude Code tại thư mục này, nó sẽ tự nhận server tên `kb-mail` (lần đầu cần xác nhận tin tưởng). Kiểm tra/thêm thủ công:

```bash
claude mcp list                              # xem server đã kết nối
claude mcp add kb-mail -- node mcp/server.mjs  # thêm tay nếu cần
npm run mcp                                  # chạy thử server (đọc JSON-RPC từ stdin)
```

**Các tool cung cấp:**

| Tool | Công dụng |
| --- | --- |
| `kb_search` | Tìm kho kiến thức theo từ khóa → luồng khớp nhất kèm điểm, tag, tóm tắt, giải pháp |
| `kb_list` | Liệt kê mục kiến thức (lọc theo tag) |
| `kb_get` | Chi tiết 1 mục kiến thức theo `conversationId` (gồm toàn bộ luồng mail) |
| `kb_tags` | Tất cả tag kèm số luồng dùng mỗi tag |
| `history_search` | Tra cứu lịch sử hỗ trợ theo từ khóa / trạng thái |
| `history_get` | Chi tiết 1 mục lịch sử theo `messageId` (đề xuất khớp + nháp) |
| `flag_status` | Lần quét cờ gần nhất + thống kê (tổng, theo trạng thái, theo tháng) |

Server đọc trực tiếp `data/*.json` nên dữ liệu luôn cập nhật theo lần fetch/job gần nhất. Tất cả tool **chỉ đọc**, không sửa dữ liệu.

> Ví dụ hỏi Claude Code: *"dùng kb-mail tra cứu kiến thức về lương presale"*, *"thống kê mail gắn cờ tháng này"*, *"lịch sử hỗ trợ nào đang ở trạng thái pending"*.

### Kết nối từ client MCP

Server giao tiếp **stdio** (lệnh `node mcp/server.mjs`). Server tự đổi cwd về gốc project nên chạy từ đâu cũng được, nhưng client GUI thường **không có `node` của nvm trong PATH** → dùng **đường dẫn tuyệt đối** cho cả `node` lẫn `server.mjs`. Trên máy này:

```text
node:   /Users/linhnvv2/.nvm/versions/node/v22.16.0/bin/node
server: /Users/linhnvv2/Projects/Me/kb-mail/mcp/server.mjs
```

(kiểm tra lại bằng `which node` — đổi version nvm sẽ đổi đường dẫn này.)

**Claude Code (CLI / VS Code extension):** đã có sẵn [`.mcp.json`](.mcp.json) ở gốc project (scope `project`) — mở Claude Code tại thư mục này là tự nhận. Hoặc thêm thủ công theo scope mong muốn:

```bash
claude mcp add kb-mail -- node mcp/server.mjs              # scope local (chỉ máy bạn, mặc định)
claude mcp add -s user kb-mail -- node mcp/server.mjs      # scope user (mọi project)
claude mcp list                                            # kiểm tra kết nối
```

**Claude Desktop:** sửa file
`~/Library/Application Support/Claude/claude_desktop_config.json` (macOS), thêm:

```json
{
  "mcpServers": {
    "kb-mail": {
      "command": "/Users/linhnvv2/.nvm/versions/node/v22.16.0/bin/node",
      "args": ["/Users/linhnvv2/Projects/Me/kb-mail/mcp/server.mjs"]
    }
  }
}
```

Lưu file rồi **khởi động lại Claude Desktop**. Server hiện trong menu 🔌 (Search and tools).

**Cursor:** tạo `.cursor/mcp.json` trong project (hoặc `~/.cursor/mcp.json` cho toàn cục) với **đúng nội dung JSON như Claude Desktop** ở trên, rồi bật server trong *Settings → MCP*.

**Client khác (Windsurf, Cline, Zed…):** đều dùng chung khai báo stdio — `command` = đường dẫn node, `args` = `["<.../mcp/server.mjs>"]`. Nếu client cho đặt `cwd`, trỏ về gốc project rồi `args` chỉ cần `["mcp/server.mjs"]`.

**Kiểm tra nhanh không cần client** (gửi JSON-RPC trực tiếp):

```bash
printf '%s\n' \
  '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05"}}' \
  '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' \
  | npm run -s mcp
```

Thấy danh sách 7 tool trả về là server hoạt động.

## Đăng nhập & phân quyền

Toàn bộ trang và API được bảo vệ bằng `middleware.js`: chưa đăng nhập sẽ bị chuyển tới `/login` (API trả `401`). Phiên đăng nhập là cookie `kb_session` **httpOnly**, ký **HMAC-SHA256** bằng `AUTH_SECRET`, mang theo **vai trò + danh sách menu được phép**, mặc định sống 7 ngày.

**Vai trò:**

- **admin** — toàn quyền mọi menu + trang **⚙️ Quản trị** (`/admin`) để tạo/sửa/xóa tài khoản và gán quyền menu cho user.
- **user** — chỉ thấy và vào được các menu (trong 5 menu) được admin gán. Truy cập menu ngoài quyền: trang bị chuyển về menu đầu tiên được phép, API trả `403`.

**Tạo & gán quyền:** dùng trang **/admin** (giao diện) — chọn vai trò, tích các menu cho phép. Hoặc dùng CLI:

```bash
npm run user admin <username> <password> [tên]   # tạo admin (toàn quyền)
npm run user add   <username> <password> [tên]   # tạo user (mặc định đủ 5 menu — chỉnh tại /admin)
npm run user list                                 # liệt kê (kèm vai trò & menu)
npm run user del   <username>                     # xóa
```

- Mật khẩu băm **scrypt + muối**, lưu trong `data/users.json` (không commit).
- Quyền nằm trong token phiên → **đổi quyền có hiệu lực sau khi user đăng nhập lại**.
- Đổi `AUTH_SECRET` trong `.env` sẽ **vô hiệu mọi phiên** đang đăng nhập.
- **Đổi mật khẩu của chính mình**: trang **/admin** có mục **🔑 Đổi mật khẩu của tôi** (nhập mật khẩu hiện tại + mật khẩu mới ≥ 6 ký tự). API: `POST /api/auth/password`. Admin vẫn có thể đặt lại mật khẩu cho bất kỳ tài khoản nào qua form Sửa.
- Đăng xuất bằng nút trên thanh điều hướng (góc phải).

## Dữ liệu

- `data/imports/*.json` — các lần nạp email (mỗi lần một file)
- `data/knowledge.json` — tag/summary/solution theo conversationId
- `data/history.json` — lịch sử hỗ trợ (trạng thái, nháp, thời điểm gửi)
- `data/deleted.json` — danh sách `conversationId` đã xóa khỏi kho kiến thức (để ẩn vĩnh viễn)
- `data/users.json` — tài khoản đăng nhập (mật khẩu băm scrypt)

## Bảo mật

- Không commit `.env` và `data/` (đã có `.gitignore`)
- Token Graph cho quyền đọc/gửi mail — chỉ dán vào `.env` trên máy tin cậy
- Mail chỉ được gửi khi người dùng đã Duyệt OK và xác nhận
- Đăng nhập bắt buộc cho mọi trang/API; mật khẩu băm scrypt, phiên ký HMAC bằng `AUTH_SECRET`


Tài khoản: admin
Mật khẩu:  Admin@123