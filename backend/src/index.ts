import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import * as schema from './db/schema';
import { executionLogs } from './db/schema';
import type { Bindings, Env } from './types';
import { fail, serverError } from './lib/respond';
import { today } from './lib/dates';
import { countdownNotify } from './actions/countdownNotify';
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

    // Cron gọi THẲNG action mà bot vẫn bấm — không đi vòng qua HTTP + session token.
    // Kết quả ghi vào cùng bảng execution_logs với tiền tố [cron] để admin phân biệt
    // được lần chạy tự động với lần bot bấm tay. Lịch: triggers.crons trong wrangler.jsonc.
    async scheduled(_event: ScheduledController, env: Bindings, _ctx: ExecutionContext) {
        const db = drizzle(env.assistant_db, { schema });

        let summary: string;
        let status: 'ok' | 'error';
        try {
            const result = await countdownNotify.run(
                { db, env, today: today(env.TIMEZONE) },
                {},
            );
            summary = result.summary;
            status = result.ok ? 'ok' : 'error';
            console.log('[cron] countdown.notify:', summary);
        } catch (err) {
            summary = err instanceof Error ? err.message : 'unknown';
            status = 'error';
            console.error('[cron] countdown.notify threw:', summary);
        }

        // Ghi log là best-effort: tin nhắn có thể đã gửi đi rồi, đừng để lỗi insert
        // che mất điều đó.
        await db
            .insert(executionLogs)
            .values({
                id: crypto.randomUUID(),
                actionId: 'countdown.notify',
                status,
                detail: `[cron] ${summary}`.slice(0, 1000),
            })
            .catch((e) => console.error('[cron] log.insert', e));
    },
};
