import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import { eq, desc } from 'drizzle-orm';
import { setCookie, deleteCookie } from 'hono/cookie';
import * as schema from '../db/schema';
import { countdownEvents, executionLogs } from '../db/schema';
import type { Env } from '../types';
import { fail, invalidBody, serverError } from '../lib/respond';
import { Body } from '../lib/validate';
import { issue, secretEquals } from '../auth/session';
import { requireAdmin } from '../auth/guards';

export const adminRoutes = new Hono<Env>();

/** Đăng nhập bằng mật khẩu — chỉ dùng khi ADMIN_AUTH_MODE=password. */
adminRoutes.post('/session', async (c) => {
    if (c.env.ADMIN_AUTH_MODE === 'access') {
        return fail(c, 404, 'NOT_APPLICABLE', 'Đang chạy chế độ Cloudflare Access, không có đăng nhập bằng mật khẩu');
    }

    const ip = c.req.header('CF-Connecting-IP') ?? 'unknown';
    const { success } = await c.env.ADMIN_LOGIN_LIMITER.limit({ key: `admin-login:${ip}` });
    if (!success) return fail(c, 429, 'RATE_LIMITED', 'Thử quá nhiều lần, đợi một phút rồi thử lại');

    let raw: unknown;
    try {
        raw = await c.req.json();
    } catch {
        return fail(c, 400, 'INVALID_BODY', 'Body phải là JSON');
    }

    const f = new Body(raw);
    const password = f.requiredString('password', 512);
    if (f.error) return invalidBody(c, f.error);

    if (!secretEquals(password, c.env.ADMIN_PASSWORD)) {
        return fail(c, 401, 'INVALID_CREDENTIALS', 'Mật khẩu không đúng');
    }

    const { token, expiresAt } = await issue('admin', c.env.SESSION_SECRET);

    // HttpOnly: JS không đọc được, nên XSS trên trang bot cũng không lấy được session
    // admin. SameSite=Strict: không có request cross-site nào mang cookie này đi.
    setCookie(c, 'admin_session', token, {
        httpOnly: true,
        secure: true,
        sameSite: 'Strict',
        path: '/',
        maxAge: expiresAt - Math.floor(Date.now() / 1000),
    });
    return c.json({ ok: true, expiresAt });
});

adminRoutes.post('/logout', (c) => {
    deleteCookie(c, 'admin_session', { path: '/' });
    return c.json({ ok: true });
});

adminRoutes.use('/countdowns', requireAdmin());
adminRoutes.use('/countdowns/*', requireAdmin());
adminRoutes.use('/logs', requireAdmin());
adminRoutes.use('/me', requireAdmin());

adminRoutes.get('/me', (c) => c.json({ ok: true, mode: c.env.ADMIN_AUTH_MODE }));

adminRoutes.get('/countdowns', async (c) => {
    const db = drizzle(c.env.assistant_db, { schema });
    const rows = await db.select().from(countdownEvents).orderBy(desc(countdownEvents.endDate));
    return c.json({ countdowns: rows });
});

adminRoutes.post('/countdowns', async (c) => {
    let raw: unknown;
    try {
        raw = await c.req.json();
    } catch {
        return fail(c, 400, 'INVALID_BODY', 'Body phải là JSON');
    }

    const f = new Body(raw);
    const event = f.requiredString('event', 200);
    const description = f.optionalString('description', 1000);
    const startDate = f.requiredDate('startDate');
    const endDate = f.requiredDate('endDate');
    const enabled = f.optionalBoolean('enabled');

    // Chặn ở đây chứ không để lọt vào DB: một dòng end < start làm mọi lần đọc sau đó
    // phải tự xử lý một trạng thái vô nghĩa.
    if (!f.error && endDate < startDate) f.reject('endDate', 'phải bằng hoặc sau startDate');
    if (f.error) return invalidBody(c, f.error);

    try {
        const db = drizzle(c.env.assistant_db, { schema });
        const id = crypto.randomUUID();
        await db.insert(countdownEvents).values({
            id,
            event,
            description: description ?? null,
            startDate,
            endDate,
            enabled: enabled ?? true,
        });
        return c.json({ id }, 201);
    } catch (err) {
        return serverError(c, err, 'admin.countdown.create');
    }
});

adminRoutes.patch('/countdowns/:id', async (c) => {
    const id = c.req.param('id');
    let raw: unknown;
    try {
        raw = await c.req.json();
    } catch {
        return fail(c, 400, 'INVALID_BODY', 'Body phải là JSON');
    }

    const db = drizzle(c.env.assistant_db, { schema });
    const [existing] = await db.select().from(countdownEvents).where(eq(countdownEvents.id, id)).limit(1);
    if (!existing) return fail(c, 404, 'NOT_FOUND', 'Không có sự kiện này');

    const f = new Body(raw);
    // `undefined` = không gửi = giữ nguyên. Drizzle bỏ qua undefined trong .set(), nên
    // PATCH không xoá trắng field cũ — đừng "chuẩn hoá" chúng thành null.
    const patch = {
        event: raw && typeof raw === 'object' && 'event' in raw ? f.requiredString('event', 200) : undefined,
        description: f.optionalString('description', 1000),
        startDate: f.optionalDate('startDate'),
        endDate: f.optionalDate('endDate'),
        enabled: f.optionalBoolean('enabled'),
    };

    // So trên giá trị SAU khi merge, không phải chỉ trên field vừa gửi: sửa mỗi startDate
    // vẫn có thể làm nó vượt qua endDate cũ.
    const nextStart = patch.startDate ?? existing.startDate;
    const nextEnd = patch.endDate ?? existing.endDate;
    if (!f.error && nextEnd < nextStart) f.reject('endDate', 'phải bằng hoặc sau startDate');
    if (f.error) return invalidBody(c, f.error);

    try {
        await db
            .update(countdownEvents)
            .set({ ...patch, updatedAt: new Date() })
            .where(eq(countdownEvents.id, id));
        return c.json({ ok: true });
    } catch (err) {
        return serverError(c, err, 'admin.countdown.update', { id });
    }
});

adminRoutes.delete('/countdowns/:id', async (c) => {
    const id = c.req.param('id');
    try {
        const db = drizzle(c.env.assistant_db, { schema });
        await db.delete(countdownEvents).where(eq(countdownEvents.id, id));
        return c.json({ ok: true });
    } catch (err) {
        return serverError(c, err, 'admin.countdown.delete', { id });
    }
});

adminRoutes.get('/logs', async (c) => {
    const db = drizzle(c.env.assistant_db, { schema });
    const rows = await db.select().from(executionLogs).orderBy(desc(executionLogs.createdAt)).limit(100);
    return c.json({ logs: rows });
});
