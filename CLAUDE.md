# web-assistant

Trợ lý web hai mặt, chạy trọn trong **một** Cloudflare Worker:

| Mặt | Đường dẫn | Ai dùng | Bảo vệ bằng |
|---|---|---|---|
| Admin | `/admin/*` | chủ dự án | `requireAdmin()` — xem "Hai chế độ auth admin" |
| Bot execute | `/bot` | **AI bot** | secret key nhập ở cổng vào, đổi lấy session token 2 giờ |

Bot không gọi API riêng lẻ — nó **mở trang, điền form, ấn nút** như người. Backend thực
thi và trả kết quả dạng text đọc được.

Tính năng đầu tiên: **countdown**. Admin nhập `event` / `description` / `startDate` /
`endDate`; bot ấn nút; backend quét mọi event đang chạy, tính số ngày đã qua và còn lại,
dựng một tin nhắn tổng hợp và gửi vào Telegram.

## Cấu trúc

| Thư mục | Là gì |
|---|---|
| `backend/` | Hono + Drizzle. Vừa serve SPA (Static Assets) vừa xử lý `/api/*` |
| `web/` | SPA — Vite + React 19 + Tailwind v4 + shadcn/ui. Build ra `web/dist` |

Một pnpm workspace, **một** `pnpm install` ở root. (ummi-reader dùng ba lockfile rời và tự
ghi đó là nợ kỹ thuật — ở đây không lặp lại.)

**Một Worker, một origin.** SPA và API cùng hostname, nên: không CORS, không
`VITE_API_URL`, không proxy `/api` trong vite. `wrangler dev` phục vụ cả hai ở `:8787` —
giống hệt production.

Đánh đổi của cách này: **không có vite dev server nên không có HMR**. `pnpm dev` chạy
`vite build --watch` song song với `wrangler dev`, nên sửa frontend vẫn tự build lại,
nhưng phải tự refresh trình duyệt. Đổi lấy việc dev chạy đúng đường đi của production —
cùng origin, cùng cookie, cùng cách asset được phục vụ — thay vì một môi trường giả có
proxy mà production không có.

## Máy mới thì làm gì

```bash
nvm use          # .nvmrc → Node 24.20.0
corepack enable  # pnpm 11.21.0 theo "packageManager"
pnpm run init    # install + sinh .dev.vars + sinh migration + dựng D1 local
pnpm dev         # http://localhost:8787
```

`scripts/init.sh` sinh `backend/.dev.vars` với `SESSION_SECRET`/`BOT_SECRET` ngẫu nhiên
**mới** cho từng máy. Đó là chủ ý, không phải thiếu sót: secret local không đi qua tay ai.

Bốn thứ không theo git và không cần: `node_modules/` · `backend/.dev.vars` (init sinh
lại) · `backend/.wrangler/` (D1 local, init dựng lại rỗng) ·
`backend/worker-configuration.d.ts` (xem "Kiểu của binding" bên dưới).

`pnpm-workspace.yaml` có khối `allowBuilds` cho `esbuild` và `workerd`. pnpm 11 chặn
build script của dependency theo mặc định — không khai ở đây thì `pnpm install` **dừng
với `ERR_PNPM_IGNORED_BUILDS`**. Khai trong file thay vì chạy `pnpm approve-builds` để
mọi máy dựng lại giống nhau.

## Lệnh hay dùng

```bash
pnpm dev                  # worker + SPA ở :8787 (vite build --watch chạy song song)
pnpm test                 # vitest trong workerd thật
pnpm run typecheck        # tsc --noEmit — chỗ DUY NHẤT strict có hiệu lực (wrangler bundle bằng esbuild)
pnpm run db:generate      # đổi schema.ts → sinh migration SQL
pnpm run db:migrate       # apply lên D1 production
pnpm run deploy           # build web + wrangler deploy  ← lệnh của chủ dự án
```

## Kiểu của binding: `src/types.ts`, không phải `wrangler types`

`wrangler types` sinh `worker-configuration.d.ts` bằng cách đọc `wrangler.jsonc` **cộng
với `.dev.vars` của máy đang chạy**. Mà `.dev.vars` không theo git — nên trên máy chưa
chạy `init`, file sinh ra thiếu hẳn các secret và `pnpm run typecheck` đỏ vì lý do chẳng
liên quan gì tới code. Vì vậy nguồn sự thật là interface `Bindings` viết tay trong
`backend/src/types.ts`; test ép `env` về kiểu đó trong `test/helpers.ts`.

## Header bảo mật nằm ở HAI chỗ

`run_worker_first: ["/api/*"]` nghĩa là **chỉ** `/api/*` đi qua worker. Mọi đường khác do
Static Assets phục vụ thẳng, không chạm middleware trong `src/index.ts`. Nên:

- header cho API → middleware trong `backend/src/index.ts`
- header cho trang HTML/JS/CSS (CSP, `X-Frame-Options`, `X-Robots-Tag`) → `web/public/_headers`

Sửa một chỗ mà quên chỗ kia là để hở đúng nửa còn lại.

## Quy ước

**Chú thích viết bằng tiếng Việt, và giải thích *tại sao*, không phải *cái gì*.** Nhiều
đoạn ở đây trông thừa mà thật ra là lớp phòng thủ thứ hai; chú thích là chỗ duy nhất ghi
lại điều đó.

**Thêm dependency là chuyện phải cân nhắc, không phải phản xạ.** Workers Free cho 10ms
CPU mỗi request. Vì trần đó mà `lib/validate.ts` viết tay thay vì dùng zod. Muốn thêm gói
mới thì phải trả lời được nó tốn bao nhiêu CPU.

**Mọi API call phải nằm trong `web/src/lib/apiClient.ts`.** Tuyệt đối không rải
`fetch('/api/...')` trong component.

**Test phải chứng minh được là nó đang canh thứ gì đó.** Viết xong thì cố ý phá code (bỏ
một dòng kiểm tra) và đếm xem mấy test đỏ. Không đỏ = test không canh gì cả. Các lớp
phòng thủ đã soi bằng cách này, mỗi lớp phá là có đỏ: `escapeMd` (3 đỏ) ·
`secretEquals` (3 đỏ) · lọc `enabled` (1 đỏ) · nhánh `dryRun` (1 đỏ) · chốt
`isDue`/`last_run_date` của lịch (1 đỏ) · `UPDATE` có điều kiện chống cron chạy đôi (1 đỏ).

**Chặn request ra ngoài trong test bằng `mockTelegram()` trong `test/helpers.ts`**, không
phải `fetchMock` của `cloudflare:test` — pool 0.22 đã bỏ export đó (cùng với
`disableNetConnect`). Hàm thay thế giữ đúng tính chất quan trọng nhất: **URL nào không
phải Telegram thì ném lỗi**, nên "dryRun không gửi Telegram" là điều được canh thật.

**Không animation.** Bỏ `transition-*`, `animate-*` của Tailwind.

**Không tự deploy.** `pnpm run deploy` là lệnh của chủ dự án.

## Trang `/bot` là một hợp đồng, không phải UI

AI bot đọc DOM để thao tác. Nên trên trang bot:

- mỗi input có `id` + `name` + `<label for>` **ổn định**
- mỗi button có `data-action="<action-id>"`
- kết quả render vào `data-testid="action-result"` dạng text đọc được

Đổi những tên đó = breaking change với mọi con bot đang chạy. Coi như đổi chữ ký API.

## Thêm một tính năng cho bot

Trang bot tự render UI từ registry, **không hardcode** tính năng nào. Thêm tính năng =
thêm một file trong `backend/src/actions/` + đăng ký một dòng trong `registry.ts`.
Frontend không phải sửa.

```ts
export const myAction: BotAction = {
  id: 'my.action',
  label: 'Nhãn hiện trên nút',
  description: 'Bot đọc dòng này để biết nút làm gì',
  fields: [{ name: 'dryRun', label: 'Chạy thử', type: 'boolean', required: false, default: false }],
  async run(ctx, payload) { /* ... */ },
};
```

## Lịch chạy tự động (cron)

Cloudflare chỉ có **một** cron trigger (`wrangler.jsonc` → `triggers.crons`), bắn mỗi 5
phút, **giờ UTC**. Handler `scheduled` trong `src/index.ts` không hardcode việc gì: nó
đọc bảng `schedules` rồi chạy action nào tới giờ. Cùng tinh thần registry — cron là hạ
tầng, "chạy gì lúc nào" là dữ liệu admin sửa qua `/admin/schedules`, **không deploy**.

- `time_of_day` là `'HH:MM'` theo `TIMEZONE` (không phải UTC — chỉ biểu thức cron mới UTC).
- **Mỗi ngày một lần**: handler bỏ qua dòng có `last_run_date` = hôm nay. Job lỗi **không
  tự thử lại** trong ngày (admin thấy lỗi ở màn Lịch + Nhật ký) — đổi lấy việc không bao
  giờ gửi trùng. Nhịp cron bị bỏ lỡ thì nhịp sau vẫn vớt lại được (điều kiện là
  `time_of_day <= giờ hiện tại`, không phải cửa sổ hẹp quanh đúng phút).
- Chốt chống chạy đôi khi hai lần cron chồng nhau: `UPDATE schedules SET last_run_date =
  hôm nay WHERE ... AND last_run_date chưa = hôm nay`, rồi kiểm `meta.changes`.
- `POST /api/admin/schedules/:id/run` chạy job ngay để thử, **cố ý không đụng**
  `last_run_date` — lịch tự động vẫn chạy đúng giờ sau đó.
- Cron và nút "Chạy ngay" đi qua `actions/run.ts` (`runActionById`) — ghi `execution_logs`
  với tiền tố `[cron]` / `[chạy tay]`. Đường `/api/bot` **không** dùng chung hàm này: nó
  có rate limit + xử lý lỗi riêng.

Test handler `scheduled` bằng `createScheduledController` + `worker.scheduled(...)` (xem
`test/schedules.test.ts`), không qua `SELF`. Local: `wrangler dev` rồi
`curl localhost:8787/cdn-cgi/local/scheduled`.

## Secret

Nạp bằng `wrangler secret put`, **không bao giờ** đặt vào `vars` của `wrangler.jsonc`.

| Secret | Dùng để |
|---|---|
| `BOT_SECRET` | key bot nhập ở cổng vào `/bot` |
| `SESSION_SECRET` | ký JWT session |
| `TELEGRAM_BOT_TOKEN` | gọi Telegram Bot API |
| `ADMIN_PASSWORD` | chỉ dùng khi `ADMIN_AUTH_MODE=password` |

Đây không phải quy ước cho vui. ummi-reader từng commit `TELEGRAM_BOT_TOKEN` thẳng vào
`[vars]` của `wrangler.toml`; token nằm lại trong git history và phải revoke qua
@BotFather. Mọi key trong `vars` sẽ bị `wrangler deploy` push lên và **ghi đè** giá trị
set qua dashboard.

**Chat id / topic id KHÔNG phải secret.** Chúng nằm trong bảng `variables` (kho key-value
admin sửa qua `/admin/variables`), không phải `wrangler secret`. Lý do: admin cần đổi đích
gửi mà không phải deploy, và giá trị này lộ ra cũng chỉ là "gửi nhầm nhóm" chứ không phải
chiếm quyền bot. `countdown_config` (bảng một dòng) trỏ tới key nào chứa chat id / topic id;
màn `/admin/config` chỉnh mapping đó. `countdown.notify` đọc chúng lúc chạy, thiếu thì báo
lỗi rõ ràng chứ không gửi nhầm. Migration `0001` seed sẵn hai key mặc định + mapping.

## Hai chế độ auth admin

`requireAdmin()` là **một hàm**, chọn chiến lược theo biến `ADMIN_AUTH_MODE`:

- **`password`** (mặc định hiện nay) — `ADMIN_PASSWORD` đổi lấy cookie session ký HS256,
  `HttpOnly` + `Secure` + `SameSite=Strict`.
- **`access`** — verify header `Cf-Access-Jwt-Assertion` (RS256, JWKS của team).

Vì sao chưa dùng Access: Cloudflare cho gắn Access **trực tiếp vào Worker**, kể cả trên
`workers.dev` — nhưng đó là công tắc cho **cả Worker**. Bật lên thì `/bot` cũng bị chặn,
mà `/bot` bắt buộc phải public để AI bot vào được. Access cắt theo path chỉ làm được với
self-hosted application trên hostname thuộc zone mình sở hữu.

Nên: khi nào có custom domain trỏ về Cloudflare → tạo Access app cho `/admin*` +
`/api/admin/*` → đổi `ADMIN_AUTH_MODE=access`. Một biến, không phải viết lại route.

## Ranh giới không được vượt

- **Không nhận secret của người dùng.** Chủ dự án tự chạy `wrangler secret put` — giá trị
  không đi qua tay trợ lý.
- **Không tự deploy**, không tự tạo/xoá tài nguyên production (D1, Worker).
- **Xoá dữ liệu production là việc của chủ dự án.**
