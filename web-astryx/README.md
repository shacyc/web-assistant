# web-astryx

Bản dựng lại của `web/` bằng **Astryx** (design system của Meta, React + StyleX) thay cho
shadcn/ui + Tailwind. Cùng backend, cùng hợp đồng API (`src/lib/apiClient.ts` là bản sao
nguyên văn), cùng hợp đồng DOM của trang `/bot`.

Đây là gói **đứng riêng**: `pnpm dev`, `pnpm run deploy` và `backend/wrangler.jsonc` vẫn
trỏ vào `web/`. Muốn chạy thử bản này:

```bash
pnpm --filter web-astryx run build
# rồi tạm trỏ backend/wrangler.jsonc  "assets.directory" → "../web-astryx/dist"
pnpm --filter backend run dev
```

Hoặc xem SPA rời (không có API) bằng cấu hình `web-astryx-preview` trong `.claude/launch.json`.

## Khác biệt so với `web/`

| Việc | `web/` (shadcn) | `web-astryx/` |
|---|---|---|
| Component | shadcn/ui + Radix/Base UI, tự dán vào `components/ui` | `@astryxdesign/core` (import thẳng từ package) |
| Style | Tailwind v4, token shadcn trong `index.css` | CSS dựng sẵn của Astryx + `@astryxdesign/theme-neutral`, token `var(--color-*)` |
| Dark mode | `<html class="dark">` cứng | `<Theme mode="dark">` |
| Icon | `@tabler/icons-react` | `lucide-react` (qua `<Icon>` của Astryx) |
| Ngày | `DatePicker` tự ráp (Popover + Calendar) | `<DateInput>` sẵn có |
| Điều hướng | `react-router` + `NavLink` | như cũ, thêm `<LinkProvider>` để `<Link>`/`<SideNavItem>` của Astryx định tuyến phía client |
| Layout admin | sidebar tự dựng | `<AppShell>` + `<SideNav>` |

## Trang `/bot` — vẫn là hợp đồng DOM

`@astryxdesign/core` `<TextInput>` tự sinh `id` bằng `useId()` và **không cho ghi đè**, phá
yêu cầu "id ổn định" mà AI bot dựa vào. Nên các trang bot dùng `<input>`/`<label>`/`<pre>`
native với đúng `id` / `name` / `data-action` / `data-testid` như bản cũ, chỉ mượn token
Astryx để hợp tông (`src/pages/bot/bot.css`). Nút bấm dùng `<Button>` của Astryx vì nó
truyền thẳng `data-action` xuống thẻ `<button>` thật.
