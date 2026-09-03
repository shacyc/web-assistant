import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import { and, eq, isNull, lte, ne, or } from 'drizzle-orm';
import * as schema from './db/schema';
import { schedules } from './db/schema';
import type { Bindings, Env } from './types';
import { fail, serverError } from './lib/respond';
import { hhmm, today } from './lib/dates';
import { isDue, parsePayload } from './lib/schedule';
import { runActionById } from './actions/run';
import { botRoutes } from './routes/bot';
import { adminRoutes } from './routes/admin';

const app = new Hono<Env>();

// Không CORS ở đây, và đó là chủ ý: SPA và API cùng một Worker, cùng một origin. Ngày
// nào phải thêm cors() lại thì tức là kiến trúc đã tách origin — xem lại CLAUDE.md trước.

app.use('*', async (c, next) => {
    await next();
    // Trang /bot buộc phải public để AI bot vào được, nhưng không có lý do gì để nó nằm
    // trong index của search engine.
    c.header('X-Robots-Tag', 'noindex, nofollow');
    c.header('X-Content-Type-Options', 'nosniff');
    c.header('Referrer-Policy', 'no-referrer');
});

app.route('/api/bot', botRoutes);
app.route('/api/admin', adminRoutes);

// Chỉ bắt /api/*. Mọi path khác do Static Assets phục vụ (SPA fallback) và không bao giờ
// chạm tới worker — nhờ `run_worker_first: ["/api/*"]` trong wrangler.jsonc.
app.all('/api/*', (c) => fail(c, 404, 'NOT_FOUND', 'Không có endpoint này'));

app.onError((err, c) => serverError(c, err, 'unhandled', { path: c.req.path }));

export default {
    fetch: app.fetch,

    /**
     * Cron thật (wrangler.jsonc `triggers.crons`) bắn mỗi 5 phút, GIỜ UTC. Nó KHÔNG
     * hardcode việc gì: đọc bảng `schedules` — admin sửa qua /admin/schedules mà không
     * cần deploy — rồi chạy job nào tới giờ mà hôm nay chưa chạy.
     *
     * Mỗi lần bắn là 1 request tính vào hạn mức, và handler này có 10ms CPU trên Free.
     * Vì vậy: lọc "đang bật + đã tới giờ" ngay trong SQL, phần còn lại chạy tuần tự và
     * nhẹ (query D1 + fetch Telegram là thời gian mạng, không phải CPU).
     */
    async scheduled(_event: ScheduledController, env: Bindings, _ctx: ExecutionContext) {
        const db = drizzle(env.assistant_db, { schema });
        const todayStr = today(env.TIMEZONE);
        const nowHHMM = hhmm(env.TIMEZONE);

        const candidates = await db
            .select()
            .from(schedules)
            .where(and(eq(schedules.enabled, true), lte(schedules.timeOfDay, nowHHMM)));

        for (const row of candidates) {
            // `isDue` lặp lại điều kiện SQL + thêm chốt "chưa chạy hôm nay". Giữ cả hai:
            // SQL để không kéo về những dòng chắc chắn không chạy, `isDue` để logic đầy
            // đủ nằm một chỗ test được.
            if (!isDue(row, todayStr, nowHHMM)) continue;

            // Chốt quyền chạy bằng UPDATE có điều kiện: hai lần cron chồng nhau (hiếm,
            // nhưng có thể) thì chỉ một cái đổi được last_run_date sang hôm nay; cái kia
            // thấy changes = 0 và bỏ qua. Ghi last_run_date TRƯỚC khi chạy nên job lỗi
            // không tự thử lại trong ngày — đổi lấy việc không bao giờ gửi trùng.
            const claim = await db
                .update(schedules)
                .set({ lastRunDate: todayStr, updatedAt: new Date() })
                .where(
                    and(
                        eq(schedules.id, row.id),
                        or(isNull(schedules.lastRunDate), ne(schedules.lastRunDate, todayStr)),
                    ),
                );
            if ((claim.meta?.changes ?? 0) === 0) continue;

            const outcome = await runActionById(db, env, row.actionId, parsePayload(row.payload), '[cron]');
            console.log(`[cron] ${row.actionId} @ ${row.timeOfDay}:`, outcome.summary);

            await db
                .update(schedules)
                .set({
                    lastRunAt: new Date(),
                    lastRunStatus: outcome.ok ? 'ok' : 'error',
                    lastRunDetail: outcome.summary.slice(0, 500),
                    updatedAt: new Date(),
                })
                .where(eq(schedules.id, row.id));
        }
    },
};
