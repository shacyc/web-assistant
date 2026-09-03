import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import * as schema from '../db/schema';
import { executionLogs } from '../db/schema';
import type { Env } from '../types';
import { fail, invalidBody, serverError } from '../lib/respond';
import { Body } from '../lib/validate';
import { today } from '../lib/dates';
import { issue, secretEquals } from '../auth/session';
import { requireBot } from '../auth/guards';
import { getAction, listActions } from '../actions/registry';

export const botRoutes = new Hono<Env>();

/** Cổng vào: đổi secret key lấy một session token ngắn hạn. */
botRoutes.post('/session', async (c) => {
    // Endpoint duy nhất không cần token, nên cũng là endpoint duy nhất bị dò. Rate limit
    // theo IP đứng TRƯỚC mọi thứ khác, kể cả parse body.
    const ip = c.req.header('CF-Connecting-IP') ?? 'unknown';
    const { success } = await c.env.BOT_LOGIN_LIMITER.limit({ key: `bot-login:${ip}` });
    if (!success) return fail(c, 429, 'RATE_LIMITED', 'Thử quá nhiều lần, đợi một phút rồi thử lại');

    let raw: unknown;
    try {
        raw = await c.req.json();
    } catch {
        return fail(c, 400, 'INVALID_BODY', 'Body phải là JSON');
    }

    const f = new Body(raw);
    const secret = f.requiredString('secret', 512);
    if (f.error) return invalidBody(c, f.error);

    if (!secretEquals(secret, c.env.BOT_SECRET)) {
        return fail(c, 401, 'INVALID_SECRET', 'Secret key không đúng');
    }

    const { token, expiresAt } = await issue('bot', c.env.SESSION_SECRET);
    return c.json({ token, expiresAt });
});

botRoutes.use('/actions', requireBot());
botRoutes.use('/actions/*', requireBot());

/** Trang bot render form từ đây — không hardcode tính năng nào ở frontend. */
botRoutes.get('/actions', (c) => c.json({ actions: listActions() }));

botRoutes.post('/actions/:id/run', async (c) => {
    const id = c.req.param('id');
    const action = getAction(id);
    if (!action) return fail(c, 404, 'UNKNOWN_ACTION', `Không có action '${id}'`);

    const ip = c.req.header('CF-Connecting-IP') ?? 'unknown';
    const { success } = await c.env.BOT_RUN_LIMITER.limit({ key: `bot-run:${ip}` });
    if (!success) return fail(c, 429, 'RATE_LIMITED', 'Gọi quá nhanh, đợi một phút');

    let raw: unknown = {};
    try {
        raw = await c.req.json();
    } catch {
        // Action không có field thì bot gửi body rỗng là hợp lệ.
    }
    const payload = (raw as { payload?: Record<string, unknown> })?.payload ?? {};

    const db = drizzle(c.env.assistant_db, { schema });

    try {
        const result = await action.run({ db, env: c.env, today: today(c.env.TIMEZONE) }, payload);

        // Log là best-effort: một action đã chạy xong (và có thể đã gửi Telegram) không
        // được biến thành 500 chỉ vì ghi log hỏng.
        c.executionCtx.waitUntil(
            db.insert(executionLogs).values({
                id: crypto.randomUUID(),
                actionId: id,
                status: result.ok ? 'ok' : 'error',
                detail: result.summary.slice(0, 1000),
            }).catch((e) => console.error('[log.insert]', e)),
        );

        return c.json(result, result.ok ? 200 : 502);
    } catch (err) {
        c.executionCtx.waitUntil(
            db.insert(executionLogs).values({
                id: crypto.randomUUID(),
                actionId: id,
                status: 'error',
                detail: err instanceof Error ? err.message.slice(0, 1000) : 'unknown',
            }).catch(() => {}),
        );
        return serverError(c, err, 'bot.run', { actionId: id });
    }
});
