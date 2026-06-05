# KB Mail — Hệ thống quản lý kiến thức & hỗ trợ trả lời email tự động

Quy trình: **đọc mail theo folder → gom full luồng → đánh tag / AI tự phân loại → job quét mail gắn cờ → kiến thức khớp + AI chat soạn trả lời → Duyệt OK → gửi mail vào đúng luồng → lịch sử & báo cáo**.

## Cài đặt

```bash
npm install
cp .env.example .env   # điền GRAPH_TOKEN, MAIL_FOLDER, cấu hình LLM
npm run dev            # mở http://localhost:3000
```

**GRAPH_TOKEN**: access token Microsoft Graph (delegated), scope `Mail.Read` + `Mail.Send`. Lấy nhanh từ [Graph Explorer](https://developer.microsoft.com/graph/graph-explorer) (tab Access token). Token sống ~1 giờ; chạy production nên đăng ký Azure AD app + refresh token.

**LLM** (AI chat + tự phân loại): mọi API tương thích OpenAI.

| Provider | LLM_BASE_URL | Ghi chú |
|---|---|---|
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
- Xem full luồng mail (from/to/cc/body), đánh tag tay
- **🤖 AI phân loại**: LLM tự sinh tag + tóm tắt + giải pháp cho 1 luồng hoặc mọi luồng chưa có tag (ưu tiên dùng lại tag có sẵn, không ghi đè giải pháp đã nhập tay)

## 3. Job quét mail gắn cờ

```bash
npm run job          # 1 lần (cron/Task Scheduler)
npm run job:watch    # lặp mỗi JOB_INTERVAL_MINUTES phút
```

Lấy mail **gắn cờ (flagged)** qua Graph API, so khớp kho kiến thức (tag + từ khóa subject/summary), ghi vào lịch sử hỗ trợ với trạng thái `pending`. Nháp trả lời được điền sẵn từ giải pháp khớp nhất.

## 4. Hỗ trợ trả lời (`/suggestions`)

- Mỗi mail gắn cờ: kiến thức khớp kèm điểm số + **AI chat** hỏi đáp dựa trên các lần hỗ trợ trước (nút nhanh: *Soạn mail trả lời*, *Đã xử lý thế nào?*; câu trả lời AI có nút *Dùng làm nội dung trả lời*)
- Quy trình duyệt: sửa nháp → **✔ Duyệt OK** → nút **📧 Gửi mail** mới mở → reply vào đúng luồng qua Graph
- Trạng thái: `pending` → `approved` → `sent`

## 5. Lịch sử & báo cáo (`/history`)

- Thống kê: tổng số, chờ xử lý, đã duyệt, đã gửi, có kiến thức khớp, theo tháng
- Tìm kiếm theo tiêu đề / người gửi / nội dung / tag, lọc theo trạng thái
- Xem lại nội dung đã trả lời từng mail

## Dữ liệu

- `data/imports/*.json` — các lần nạp email (mỗi lần một file)
- `data/knowledge.json` — tag/summary/solution theo conversationId
- `data/history.json` — lịch sử hỗ trợ (trạng thái, nháp, thời điểm gửi)

## Bảo mật

- Không commit `.env` và `data/` (đã có `.gitignore`)
- Token Graph cho quyền đọc/gửi mail — chỉ dán vào `.env` trên máy tin cậy
- Mail chỉ được gửi khi người dùng đã Duyệt OK và xác nhận
