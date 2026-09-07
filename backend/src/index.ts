import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import { and, eq, isNull, lte, ne, or } from 'drizzle-orm';
import * as schema from './db/schema';
import { schedules } from './db/schema';
import type { Bindings, Env } from './types';
import { fail, serverError } from './lib/respond';
import { hhmm, today, slotKeyUTC, zonedParts } from './lib/dates';
import { isDueStructured, isDueCron, isDueEvery, isDueTick, parsePayload } from './lib/schedule';
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
     * cần deploy — rồi chạy job nào tới lượt.
     *
     * `event.scheduledTime` là mốc nhịp dự kiến (0,5,10,… phút), ổn định hơn `Date.now()`
     * nên dùng nó làm "bây giờ" cho việc so lịch. Bốn kiểu lặp có cấu trúc chốt theo
     * `last_run_date` (mỗi ngày một lần); `cron` chốt theo `last_run_slot` (mỗi nhịp 5
     * phút); `every` chốt theo `last_run_at` (đủ khoảng thời gian trôi qua chưa).
     * `last_run_at` luôn ghi = mốc nhịp (không phải lúc chạy xong) để khoảng của `every`
     * không trôi khỏi lưới 5 phút.
     *
     * Mỗi lần bắn là 1 request và handler có 10ms CPU trên Free. Lọc `enabled` trong SQL;
     * số dòng lịch của một bot cá nhân đủ nhỏ để xét phần còn lại trong JS.
     */
    async scheduled(event: ScheduledController, env: Bindings, _ctx: ExecutionContext) {
        const db = drizzle(env.assistant_db, { schema });
        const now = new Date(event.scheduledTime || Date.now());
        const todayStr = today(env.TIMEZONE, now);
        const nowHHMM = hhmm(env.TIMEZONE, now);
        const slot = slotKeyUTC(now);
        const parts = zonedParts(env.TIMEZONE, now);

        const rows = await db.select().from(schedules).where(eq(schedules.enabled, true));

        for (const row of rows) {
            // Chốt quyền chạy bằng UPDATE có điều kiện: hai lần cron chồng nhau (hiếm
            // nhưng có thể) thì chỉ một cái đổi được cột chốt; cái kia thấy changes = 0
            // và bỏ qua. Ghi chốt TRƯỚC khi chạy nên job lỗi không tự thử lại — đổi lấy
            // việc không bao giờ gửi trùng.
            let claimed: boolean;
            if (row.kind === 'cron' || row.kind === 'tick') {
                // 'tick' chạy mọi nhịp; 'cron' còn phải khớp biểu thức. Cả hai chốt bằng
                // `last_run_slot` (nhịp 5 phút) nên dùng chung đoạn claim.
                const due = row.kind === 'tick' ? isDueTick(row, slot) : isDueCron(row, parts, slot);
                if (!due) continue;
                const claim = await db
                    .update(schedules)
                    .set({ lastRunSlot: slot, lastRunAt: now, updatedAt: new Date() })
                    .where(
                        and(
                            eq(schedules.id, row.id),
                            or(isNull(schedules.lastRunSlot), ne(schedules.lastRunSlot, slot)),
                        ),
                    );
                claimed = (claim.meta?.changes ?? 0) > 0;
            } else if (row.kind === 'every') {
                if (!isDueEvery(row, now)) continue;
                // Chốt = "last_run_at đủ cũ": chỉ một invocation đổi được, phần còn lại
                // thấy changes = 0. Ngưỡng tính bằng ms rồi để drizzle quy về giây.
                const threshold = new Date(now.getTime() - (row.intervalSeconds ?? 0) * 1000);
                const claim = await db
                    .update(schedules)
                    .set({ lastRunAt: now, updatedAt: new Date() })
                    .where(
                        and(
                            eq(schedules.id, row.id),
                            or(isNull(schedules.lastRunAt), lte(schedules.lastRunAt, threshold)),
                        ),
                    );
                claimed = (claim.meta?.changes ?? 0) > 0;
            } else {
                if (!isDueStructured(row, todayStr, nowHHMM)) continue;
                const claim = await db
                    .update(schedules)
                    .set({ lastRunDate: todayStr, lastRunAt: now, updatedAt: new Date() })
                    .where(
                        and(
                            eq(schedules.id, row.id),
                            or(isNull(schedules.lastRunDate), ne(schedules.lastRunDate, todayStr)),
                        ),
                    );
                claimed = (claim.meta?.changes ?? 0) > 0;
            }
            if (!claimed) continue;

            const outcome = await runActionById(db, env, row.actionId, parsePayload(row.payload), '[cron]');
            console.log(`[cron] ${row.actionId} (${row.kind}):`, outcome.summary);

            // KHÔNG đụng last_run_at ở đây — claim đã ghi = mốc nhịp; ghi đè bằng lúc
            // chạy xong sẽ làm khoảng của 'every' trôi thêm vài giây mỗi vòng.
            await db
                .update(schedules)
                .set({
                    lastRunStatus: outcome.ok ? 'ok' : 'error',
                    lastRunDetail: outcome.summary.slice(0, 500),
                    updatedAt: new Date(),
                })
                .where(eq(schedules.id, row.id));
        }
    },
};
