---
name: web-assistant-bot
description: >
  Thao tác trang /bot của web-assistant như người dùng thật — tự mở khoá bằng bot key đã
  cấu hình sẵn, rồi chạy công việc mà người dùng nêu tên (hiện có: countdown). Người dùng
  chỉ cần đưa tên công việc.
---

# Skill: chạy công việc trên trang `/bot`

Trang `/bot` là một **hợp đồng DOM**: mỗi input có `id` ổn định, mỗi nút có `data-action`,
kết quả nằm trong `data-testid="action-result"` dạng text đọc được. Thao tác theo đúng
các tên đó, không suy diễn từ giao diện.

## Cấu hình (điền một lần, KHÔNG commit file này lên git)

> File này chứa bot secret sau khi điền → giữ ngoài repo dùng chung, ngoài lịch sử git.

- **SITE**: `https://web-assistant.<subdomain>.workers.dev`  ← thay bằng URL thật
- **BOT_KEY**: `<<dán secret key ở cổng /bot vào đây>>`

Mọi bước bên dưới dùng thẳng hai giá trị này. Người dùng **không** cần cung cấp chúng.

## Người dùng gọi skill này như thế nào

Người dùng chỉ đưa **tên công việc** (và tuỳ chọn nếu có). Ví dụ:

> "Gửi countdown" · "Chạy countdown" · "Notify countdown"
> "Chạy thử countdown" · "Xem trước countdown" (chỉ xem, không gửi Telegram)

Từ câu đó, xác định:

- `JOB` — tên công việc, khớp với một mục trong [Danh sách công việc](#danh-sách-công-việc).
  Không khớp → báo "chưa hỗ trợ việc này" và liệt kê các việc có.
- Tuỳ chọn theo JOB (ví dụ `countdown` có cờ "chạy thử").

## Hợp đồng DOM (chung cho mọi JOB)

**Cổng vào** (`/bot` khi chưa có session):

- Ô secret: `input#secret` (`name="secret"`, type password)
- Nút mở khoá: `button[data-action="bot.unlock"]` — nhãn "Mở khoá" / khi bận "Đang kiểm tra…"
- Vùng lỗi cổng: `[data-testid="gate-error"]`

**Bảng điều khiển** (sau khi mở khoá): mỗi công việc render thành một thẻ.

- Tiêu đề thẻ: `<h2>` = nhãn công việc
- Ô nhập của field: `input#<action-id>.<field-name>` (text/number/date), hoặc checkbox cùng id đó
- Nút chạy: `button[data-action="<action-id>"]` — nhãn "Thực thi" / khi bận "Đang chạy…"
- Kết quả: `pre[data-testid="action-result"][data-action-id="<action-id>"]`
  - thuộc tính `data-status` = `ok` | `failed` | `error`
  - nội dung text của `pre` = tóm tắt kết quả để đọc
- Nút "Khoá lại": `button[data-action="bot.lock"]` — **không ấn** trừ khi người dùng yêu cầu

Session bot sống trong `sessionStorage` của tab. Mở `/bot` mà **không thấy** `input#secret`
nghĩa là session còn hiệu lực → bỏ qua bước mở khoá.

## Quy trình chung

1. Mở `SITE` + `/bot`.
2. **Mở khoá nếu cần.** Thấy `input#secret`:
   - Nhập chính xác `BOT_KEY` (từ mục Cấu hình) vào `input#secret`.
   - Ấn `button[data-action="bot.unlock"]`.
   - Nếu `[data-testid="gate-error"]` xuất hiện → **dừng**, chép nguyên văn lỗi, báo người
     dùng. **Không thử lại** — cổng có rate limit (10 lần / phút).
   - Không thấy `input#secret` → session còn hiệu lực, sang bước 3.
3. Chờ bảng điều khiển hiện các thẻ công việc.
4. Làm **phần riêng của `JOB`** (bên dưới): tìm đúng thẻ, đặt các tuỳ chọn, ấn nút chạy.
5. Chờ `pre[data-testid="action-result"][data-action-id="<action-id của JOB>"]` xuất hiện,
   rồi đọc `data-status`:
   - `ok` → chép nguyên văn text trong `pre`, báo **thành công** (kèm diễn giải ở phần JOB).
   - `failed` hoặc `error` → chép nguyên văn text, báo **thất bại**. **Không thử lại.**
6. Không ấn nút nào ngoài các nút skill nêu tên. Không mở `/admin`, không đổi cấu hình,
   không chạy công việc khác "cho chắc".

## Danh sách công việc

### `countdown` — Gửi thông báo countdown

| | |
|---|---|
| Từ khoá người dùng | "countdown", "gửi countdown", "notify countdown", "nhắc countdown" |
| Action id | `countdown.notify` |
| Nhãn thẻ trên trang | "Gửi thông báo countdown" |

**Tuỳ chọn**

- `dryRun` — mặc định **tắt**. Checkbox `input#countdown.notify.dryRun`, nhãn "Chạy thử
  (không gửi Telegram)". Bật khi người dùng nói "chạy thử", "xem trước", "dry run",
  "đừng gửi thật". Bật thì backend chỉ trả về nội dung tin nhắn dự kiến, **không** gọi Telegram.

**Các bước**

1. Tìm thẻ "Gửi thông báo countdown".
2. Muốn chạy thử → tick `input#countdown.notify.dryRun`. Ngược lại để trống (mặc định đã trống).
3. Ấn `button[data-action="countdown.notify"]`.
4. Đọc kết quả theo bước 5 của Quy trình chung, với action id `countdown.notify`.

**Diễn giải kết quả**

| `data-status` | Nội dung text | Nghĩa |
|---|---|---|
| `ok` | "Đã gửi Telegram N sự kiện." | Gửi thật thành công, N sự kiện đang chạy. |
| `ok` | "Không có sự kiện nào đang chạy hôm nay — không gửi gì." | Bình thường, **không phải lỗi**. Hôm nay không có event active. |
| `ok` | Bắt đầu bằng "[CHẠY THỬ] …" | Chỉ xem trước (dryRun). Chưa gửi gì. Chép lại phần nội dung tin nhắn cho người dùng. |
| `failed` | "Chưa chọn key chứa Telegram chat id …" | Cấu hình admin thiếu. Báo người dùng vào `/admin/config` để chọn key. |
| `failed` | "Key \"…\" chưa có giá trị (màn Variables)." | Báo người dùng vào `/admin/variables` điền giá trị cho key đó. |
| `failed` | "Gửi Telegram thất bại: …" | Lỗi phía Telegram. Chép nguyên văn cho người dùng. |

## Thêm một công việc mới vào skill

Backend thêm action = thêm một file trong `backend/src/actions/` + một dòng trong
`registry.ts`; trang `/bot` tự mọc thêm thẻ. Skill này chỉ cần thêm một mục trong
[Danh sách công việc](#danh-sách-công-việc) gồm: từ khoá người dùng, action id, nhãn thẻ,
các tuỳ chọn (field + id), các bước, bảng diễn giải kết quả. **Cấu hình và Quy trình
chung không đổi.**
