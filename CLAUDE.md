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

`wrangler.jsonc` chốt cứng `account_id` (`01d7b4c8feb6f42134814fa644c8d4b2`) — máy đăng
nhập nhiều tài khoản Cloudflare vẫn `dev`/`deploy` đúng chỗ, không bị hỏi chọn. D1
`database_id` trong cùng file phải thuộc account này.

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
`isDueStructured`/`last_run_date` của lịch (1 đỏ) · `UPDATE` có điều kiện chống cron chạy
đôi (1 đỏ) · chốt `last_run_slot` của kiểu cron (1 đỏ) · ngữ nghĩa "ngày HOẶC thứ" của
cron (1 đỏ) · kẹp `day_of_month` về ngày cuối tháng (1 đỏ) · chốt khoảng của `isDueEvery`
(1 đỏ) · `last_run_at` ghi mốc nhịp chứ không phải lúc chạy xong (1 đỏ) · ngưỡng 4xx của
`defaultState` health-check (1 đỏ) · che `fetch` trong `runCheckScript` (1 đỏ) · chỉ gửi
health-check khi `state` đổi (nhiều đỏ) · không ghi `last_state` khi gửi lỗi / chưa cấu
hình (2 đỏ) · `dryRun` của health-check không ghi DB (1 đỏ) · `on_down` bỏ qua phục hồi
nhưng vẫn ghi `last_state` (3 đỏ) · chốt `last_run_slot` của `isDueTick` (1 đỏ) · nhánh
`tick` trong handler `scheduled` (1 đỏ).

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
đọc bảng `schedules` rồi chạy action nào tới lượt. Cùng tinh thần registry — cron là hạ
tầng, "chạy gì lúc nào" là dữ liệu admin sửa qua `/admin/schedules`, **không deploy**.

- `schedules.kind` chọn kiểu lặp. Bốn kiểu **tối đa một lần/ngày** — `daily` · `weekly`
  (`days_of_week` CSV ISO, 1 = Thứ Hai) · `monthly` (`day_of_month`, kẹp về ngày cuối
  tháng ngắn) · `interval` (`interval_days` + `anchor_date`) — dùng `time_of_day`
  (`'HH:MM'` theo `TIMEZONE`) và chốt bằng `last_run_date`. Kiểu `cron` chạy **nhiều
  lần/ngày**: biểu thức 5 trường (`lib/cron.ts`, viết tay, khớp theo giờ `TIMEZONE`),
  chốt bằng `last_run_slot` (nhịp 5 phút, UTC). Kiểu `every` chạy sau **mỗi
  `interval_seconds`** trôi qua, chốt bằng `last_run_at`. Kiểu `tick` chạy **mọi nhịp
  trigger** (5 phút), không xét giờ/biểu thức, không field nào — chốt bằng `last_run_slot`
  như `cron`. `time_of_day` cột NOT NULL nên `cron`/`every`/`tick` lưu `'00:00'` làm chỗ giữ.
- Logic "có tới lượt không" nằm gọn trong `lib/schedule.ts` (`isDueStructured`,
  `isDueCron`, `isDueEvery`, `isDueTick`, `matchesDay`) — thuần, test riêng, không cần
  dựng worker. Handler gộp `cron` + `tick` vào một nhánh claim (cùng chốt `last_run_slot`).
- `last_run_at` LUÔN ghi = mốc nhịp (`event.scheduledTime`), KHÔNG phải lúc action chạy
  xong — nếu không, khoảng của `every` trôi thêm vài giây mỗi vòng, lệch khỏi lưới 5 phút
  và "mỗi 1 giờ" biến thành "mỗi 1 giờ 5 phút".
- Job lỗi **không tự thử lại** trong ngày/nhịp (admin thấy lỗi ở màn Lịch + Nhật ký) —
  đổi lấy việc không bao giờ gửi trùng. Nhịp cron bị bỏ lỡ thì nhịp sau vẫn vớt lại
  được (điều kiện là `time_of_day <= giờ hiện tại`, không phải cửa sổ hẹp quanh đúng phút).
- Biểu thức cron chỉ khớp được các mốc rơi vào nhịp 5 phút của trigger thật — `31 * * * *`
  không bao giờ chạy. `every` với khoảng < 5 phút thành "mỗi nhịp". Màn Lịch ghi chú cả hai.
- Chốt chống chạy đôi khi hai lần cron chồng nhau: `UPDATE schedules SET <cột chốt> =
  <giá trị> WHERE ... AND <cột chốt> chưa = <giá trị>`, rồi kiểm `meta.changes`.
- Handler dùng `event.scheduledTime` (mốc nhịp) làm "bây giờ", không phải `Date.now()`.
- `POST /api/admin/schedules/:id/run` chạy job ngay để thử, **cố ý không đụng**
  `last_run_date` — lịch tự động vẫn chạy đúng giờ sau đó.
- Cron và nút "Chạy ngay" đi qua `actions/run.ts` (`runActionById`) — ghi `execution_logs`
  với tiền tố `[cron]` / `[chạy tay]`. Đường `/api/bot` **không** dùng chung hàm này: nó
  có rate limit + xử lý lỗi riêng.

Test handler `scheduled` bằng `createScheduledController` + `worker.scheduled(...)` (xem
`test/schedules.test.ts`), không qua `SELF`. Local: `wrangler dev` rồi
`curl localhost:8787/cdn-cgi/local/scheduled`.

## Health-check

Theo dõi vài website "còn sống hay không". Cùng khuôn countdown: bảng `healthcheck_targets`
(mỗi URL một dòng, bật/tắt được, có `check_script` tuỳ chọn) + bảng một dòng
`healthcheck_config` trỏ tới key chat/topic trong `variables` + action `healthcheck.run`
trong registry. Màn `/admin/healthchecks` (danh sách + nút "Cấu hình gửi"); màn
`/admin/config` có thêm khối cấu hình.

- `healthcheck.run` fetch **song song** mọi target đang bật (timeout 10s), so `state` với
  `last_state`. `last_state` null lần đầu coi như `'up'`: site đang khoẻ thì chốt im
  lặng, site đang sập thì báo ngay.
- **Tần suất gửi** = `healthcheck_config.notify_mode` (`lib/healthcheck.ts` `shouldNotify`):
  `always` (mọi lần kiểm, kể cả không đổi) · `on_change` (mặc định — khi state đổi, cả
  hai chiều) · `on_down` (chỉ khi đổi SANG sập, bỏ qua phục hồi). Dù mode nào, một
  target = một tin (không gộp). Với `on_down`, lần phục hồi vẫn **ghi `last_state`** qua
  nhánh `rawChanged && !notify` — im lặng nhưng không bỏ sót lần sập kế tiếp. `{transition}`
  trong template rút gọn `'up → up'` thành `'up'` cho mode `always`.
- Luật `state` mặc định (`lib/healthcheck.ts` `defaultState`): lỗi mạng / timeout /
  **HTTP ≥ 400** → `'down'`. 4xx tính là sập — chủ dự án chọn phương án này.
- `check_script`: thân một hàm JS admin tự viết, nhận `probe` (dữ liệu thuần: `url`,
  `status`, `ok`, `body`, `durationMs`, `error`) và `return` một chuỗi state (`'up'` =
  khoẻ, chuỗi khác = sập). Chạy bằng `new Function` với `fetch` / `globalThis` / … bị che
  thành `undefined`. **KHÔNG phải sandbox thật** — một `new Function` vẫn chạm được
  globalThis qua đường vòng; chỉ chặn đường thẳng và ghi rõ chủ ý. Chấp nhận được vì chỉ
  admin (chủ dự án, cùng người chạy `wrangler deploy`) lưu được script. Script ném lỗi /
  return không phải chuỗi → `state = 'down'` ("kêu còn hơn bỏ sót").
- **CPU 10ms là CPU time, không phải wall-clock.** `await fetch` là I/O nên chờ 10s không
  tốn CPU. Cái tốn CPU: đọc body + escape + `new Function`. Nên chỉ đọc `.text()` khi
  target có `check_script`, cắt body ở 100KB (`BODY_MAX`), fetch song song.
- Subrequest: N fetch + tối đa N lần gửi Telegram ≤ **50** (trần Free). "Vài site" thì dư.
- Gửi Telegram lỗi **hoặc** chưa cấu hình đích → **không** ghi `last_state`; nhịp cron sau
  vẫn tính là "đổi" và thử gửi lại (cảnh báo không mất). `last_checked_at`/`last_detail`
  vẫn ghi cho mọi target.
- `dryRun` (field của action, và nút Chạy ngay ở /bot) → không gửi, **không ghi DB nào**.
- Migration `0007` seed một dòng `schedules` cho `healthcheck.run` (`*/5 * * * *`,
  `kind='cron'`) **`enabled = 0`** — admin bật ở `/admin/schedules` sau khi thêm URL +
  cấu hình đích.
- Hai nút chạy `healthcheck.run` thật ngay (dryRun=false), đều qua `runActionById`:
  `POST /api/admin/healthchecks/run` — nút "Kiểm tra ngay" ở màn danh sách, log `[chạy tay]`;
  `POST /api/admin/healthcheck-config/test` — nút "Chạy thử" ở form cấu hình, log `[test]`.
- Test chặn request ra ngoài bằng `mockHttp()` trong `test/helpers.ts` (không phải
  `mockTelegram()`): ghi lại call Telegram, cho `on(url, res)` giả response health-check,
  **URL lạ chưa `on()` vẫn ném lỗi**. `admin.test.ts` + `healthcheck.test.ts` cache
  cookie/token trong `beforeAll` — `/session` bị rate-limit 10/phút.

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
