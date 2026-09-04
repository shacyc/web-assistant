import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import { eq, desc, asc } from 'drizzle-orm';
import type { BatchItem } from 'drizzle-orm/batch';
import { setCookie, deleteCookie } from 'hono/cookie';
import * as schema from '../db/schema';
import { countdownEvents, executionLogs, variables, countdownConfig, schedules } from '../db/schema';
import type { Env } from '../types';
import { fail, invalidBody, serverError } from '../lib/respond';
import { Body } from '../lib/validate';
import { issue, secretEquals } from '../auth/session';
import { requireAdmin } from '../auth/guards';
import { getAction, listActions } from '../actions/registry';
import { runActionById } from '../actions/run';
import { parsePayload, SCHEDULE_KINDS } from '../lib/schedule';
import { parseCron } from '../lib/cron';

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
adminRoutes.use('/variables', requireAdmin());
adminRoutes.use('/variables/*', requireAdmin());
adminRoutes.use('/countdown-config', requireAdmin());
adminRoutes.use('/schedules', requireAdmin());
adminRoutes.use('/schedules/*', requireAdmin());

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

// Dọn sạch nhật ký. Không có bộ lọc theo ngày: bảng này chỉ để debug gần, xoá hết là
// đủ. Mất hết cũng không sao — bot chạy lần sau lại ghi tiếp.
adminRoutes.delete('/logs', async (c) => {
    try {
        const db = drizzle(c.env.assistant_db, { schema });
        await db.delete(executionLogs);
        return c.json({ ok: true });
    } catch (err) {
        return serverError(c, err, 'admin.logs.clear');
    }
});

/* ---------- Variables: kho key-value dùng chung ---------- */

// Giới hạn để một lần ghi không ăn hết trần 10ms CPU của Workers Free.
const KEY_MAX = 200;
const VALUE_MAX = 4096;
const IMPORT_MAX_ROWS = 500;

adminRoutes.get('/variables', async (c) => {
    const db = drizzle(c.env.assistant_db, { schema });
    const rows = await db.select().from(variables).orderBy(asc(variables.key));
    return c.json({ variables: rows });
});

adminRoutes.put('/variables/:key', async (c) => {
    // Key có thể chứa khoảng trắng ('secretary telegram chat id'); client encodeURIComponent,
    // Hono tự decode. Vẫn trim để '  x ' và 'x' không thành hai dòng khác nhau.
    const key = c.req.param('key').trim();
    if (!key) return fail(c, 400, 'INVALID_BODY', 'key không được rỗng', 'key');
    if (key.length > KEY_MAX) return fail(c, 400, 'INVALID_BODY', `key dài quá ${KEY_MAX} ký tự`, 'key');

    let raw: unknown;
    try {
        raw = await c.req.json();
    } catch {
        return fail(c, 400, 'INVALID_BODY', 'Body phải là JSON');
    }
    const f = new Body(raw);
    const value = f.presentString('value', VALUE_MAX);
    if (f.error) return invalidBody(c, f.error);

    try {
        const db = drizzle(c.env.assistant_db, { schema });
        await db
            .insert(variables)
            .values({ key, value })
            .onConflictDoUpdate({ target: variables.key, set: { value, updatedAt: new Date() } });
        return c.json({ ok: true });
    } catch (err) {
        return serverError(c, err, 'admin.variables.put', { key });
    }
});

adminRoutes.delete('/variables/:key', async (c) => {
    const key = c.req.param('key');
    try {
        const db = drizzle(c.env.assistant_db, { schema });
        await db.delete(variables).where(eq(variables.key, key));
        return c.json({ ok: true });
    } catch (err) {
        return serverError(c, err, 'admin.variables.delete', { key });
    }
});

adminRoutes.post('/variables/import', async (c) => {
    let raw: unknown;
    try {
        raw = await c.req.json();
    } catch {
        return fail(c, 400, 'INVALID_BODY', 'Body phải là JSON');
    }

    const body = (raw ?? {}) as { mode?: unknown; variables?: unknown };
    const mode = body.mode === 'replace' ? 'replace' : body.mode === 'merge' ? 'merge' : null;
    if (!mode) return fail(c, 400, 'INVALID_BODY', "mode phải là 'merge' hoặc 'replace'", 'mode');

    const data = body.variables;
    if (typeof data !== 'object' || data === null || Array.isArray(data)) {
        return fail(c, 400, 'INVALID_BODY', 'variables phải là object { "key": "value" }', 'variables');
    }

    // Kiểm sạch TOÀN BỘ trước khi ghi dòng nào: import nửa vời tệ hơn là từ chối cả gói.
    const entries = Object.entries(data as Record<string, unknown>);
    if (entries.length > IMPORT_MAX_ROWS) {
        return fail(c, 400, 'TOO_LARGE', `Tối đa ${IMPORT_MAX_ROWS} dòng mỗi lần import`, 'variables');
    }
    for (const [k, v] of entries) {
        if (!k.trim() || k.length > KEY_MAX) {
            return fail(c, 400, 'INVALID_BODY', `key không hợp lệ: "${k.slice(0, 50)}"`, 'variables');
        }
        if (typeof v !== 'string' || v.length > VALUE_MAX) {
            return fail(c, 400, 'INVALID_BODY', `value phải là chuỗi ≤ ${VALUE_MAX} ký tự (key "${k}")`, 'variables');
        }
    }

    try {
        const db = drizzle(c.env.assistant_db, { schema });
        const now = new Date();
        const stmts: BatchItem<'sqlite'>[] = [];
        // replace: xoá sạch trước — người dùng đã chủ động chọn cách này ở UI.
        if (mode === 'replace') stmts.push(db.delete(variables));
        for (const [key, value] of entries as [string, string][]) {
            stmts.push(
                db
                    .insert(variables)
                    .values({ key: key.trim(), value })
                    .onConflictDoUpdate({ target: variables.key, set: { value, updatedAt: now } }),
            );
        }
        // db.batch chạy nguyên khối trong một round-trip: replace không bao giờ để lại
        // bảng rỗng nếu insert lỗi. Nó đòi tuple non-empty nên phải chặn mảng rỗng.
        if (stmts.length) await db.batch(stmts as [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]]);
        return c.json({ ok: true, mode, count: entries.length });
    } catch (err) {
        return serverError(c, err, 'admin.variables.import', { mode });
    }
});

/* ---------- Cấu hình countdown: trỏ tới key nào chứa chat id / topic id ---------- */

adminRoutes.get('/countdown-config', async (c) => {
    const db = drizzle(c.env.assistant_db, { schema });
    const [row] = await db.select().from(countdownConfig).where(eq(countdownConfig.id, 1)).limit(1);
    return c.json({
        chatIdKey: row?.chatIdKey ?? null,
        topicIdKey: row?.topicIdKey ?? null,
        header: row?.header ?? null,
        template: row?.template ?? null,
        footer: row?.footer ?? null,
    });
});

// Mỗi mảnh mẫu nằm gọn trong một tin Telegram (4096 ký tự) — chặn ở đây để một dòng
// config không nuốt hết 10ms CPU lúc render.
const TEMPLATE_MAX = 4096;

adminRoutes.put('/countdown-config', async (c) => {
    let raw: unknown;
    try {
        raw = await c.req.json();
    } catch {
        return fail(c, 400, 'INVALID_BODY', 'Body phải là JSON');
    }
    const f = new Body(raw);
    // Bảng một dòng, không có khái niệm "giữ nguyên field": vắng mặt hay null đều = bỏ chọn.
    const chatIdKey = f.optionalString('chatIdKey', KEY_MAX) ?? null;
    const topicIdKey = f.optionalString('topicIdKey', KEY_MAX) ?? null;
    const header = f.optionalString('header', TEMPLATE_MAX) ?? null;
    const template = f.optionalString('template', TEMPLATE_MAX) ?? null;
    const footer = f.optionalString('footer', TEMPLATE_MAX) ?? null;
    if (f.error) return invalidBody(c, f.error);

    try {
        const db = drizzle(c.env.assistant_db, { schema });
        await db
            .insert(countdownConfig)
            .values({ id: 1, chatIdKey, topicIdKey, header, template, footer })
            .onConflictDoUpdate({
                target: countdownConfig.id,
                set: { chatIdKey, topicIdKey, header, template, footer, updatedAt: new Date() },
            });
        return c.json({ ok: true });
    } catch (err) {
        return serverError(c, err, 'admin.countdownConfig.put');
    }
});

/* ---------- Lịch chạy tự động: bảng cron trong DB ---------- */

// payload là JSON của các field truyền vào action. Trần để một dòng lịch không nuốt hết
// 10ms CPU lúc handler `scheduled` parse nó mỗi 5 phút.
const PAYLOAD_MAX = 2000;

// Các cột "recurrence" của một dòng lịch. Chỉ những cột hợp với `kind` được điền, phần
// còn lại là null — để handler `scheduled` không phải đoán và `isDue*` không nhập nhằng.
interface Recurrence {
    kind: string;
    timeOfDay: string;
    daysOfWeek: string | null;
    dayOfMonth: number | null;
    intervalDays: number | null;
    anchorDate: string | null;
    cron: string | null;
    intervalSeconds: number | null;
}

// 60s tối thiểu (dưới nhịp cron thì vô nghĩa, nhưng cho phép + cảnh báo ở UI), 7 ngày tối đa.
const EVERY_MIN_SEC = 60;
const EVERY_MAX_SEC = 7 * 24 * 3600;

/**
 * Đọc + kiểm phần lịch lặp từ body, chuẩn hoá về `Recurrence`. Ghi lỗi vào `f` như mọi
 * validator khác; caller chỉ kiểm `f.error` một lần.
 *
 * `time_of_day` là cột NOT NULL nên kiểu 'cron' (không dùng giờ) vẫn phải có giá trị —
 * lưu '00:00' làm chỗ giữ, handler kiểu 'cron' không đọc cột này.
 */
function parseRecurrence(f: Body, raw: Record<string, unknown>): Recurrence {
    const out: Recurrence = {
        kind: 'daily',
        timeOfDay: '00:00',
        daysOfWeek: null,
        dayOfMonth: null,
        intervalDays: null,
        anchorDate: null,
        cron: null,
        intervalSeconds: null,
    };

    // Vắng `kind` = 'daily' (hành vi cũ, và là mặc định hợp lý). Có thì phải hợp lệ.
    const kind = raw.kind === undefined ? 'daily' : f.requiredString('kind', 20);
    if (f.error) return out;
    if (!SCHEDULE_KINDS.includes(kind as (typeof SCHEDULE_KINDS)[number])) {
        f.reject('kind', `phải là một trong: ${SCHEDULE_KINDS.join(', ')}`);
        return out;
    }
    out.kind = kind;

    if (kind === 'cron') {
        const expr = f.requiredString('cron', 120);
        if (!f.error && !parseCron(expr)) {
            f.reject('cron', 'biểu thức không hợp lệ — cần 5 trường: phút giờ ngày tháng thứ');
        }
        out.cron = expr;
        return out;
    }

    if (kind === 'every') {
        out.intervalSeconds = f.requiredInt('intervalSeconds', EVERY_MIN_SEC, EVERY_MAX_SEC);
        return out;
    }

    // 4 kiểu còn lại đều cần giờ chạy.
    out.timeOfDay = f.requiredTime('timeOfDay');

    if (kind === 'weekly') {
        const arr = Array.isArray(raw.daysOfWeek) ? (raw.daysOfWeek as unknown[]) : null;
        if (!arr || arr.length === 0) {
            f.reject('daysOfWeek', 'chọn ít nhất một thứ trong tuần');
        } else if (!arr.every((n) => Number.isInteger(n) && (n as number) >= 1 && (n as number) <= 7)) {
            f.reject('daysOfWeek', 'mỗi phần tử phải là số 1..7 (1 = Thứ Hai)');
        } else {
            out.daysOfWeek = [...new Set(arr as number[])].sort((a, b) => a - b).join(',');
        }
    } else if (kind === 'monthly') {
        out.dayOfMonth = f.requiredInt('dayOfMonth', 1, 31);
    } else if (kind === 'interval') {
        out.intervalDays = f.requiredInt('intervalDays', 1, 365);
        out.anchorDate = f.requiredDate('anchorDate');
    }
    return out;
}

adminRoutes.get('/schedules', async (c) => {
    const db = drizzle(c.env.assistant_db, { schema });
    const rows = await db.select().from(schedules).orderBy(asc(schedules.timeOfDay));
    // Kèm metadata action để màn Lịch dựng form payload + đổi id sang nhãn mà không phải
    // gọi thêm một lượt. Cùng nguồn với trang /bot (listActions), chỉ khác đường auth.
    return c.json({ schedules: rows, actions: listActions() });
});

adminRoutes.post('/schedules', async (c) => {
    let raw: unknown;
    try {
        raw = await c.req.json();
    } catch {
        return fail(c, 400, 'INVALID_BODY', 'Body phải là JSON');
    }

    const f = new Body(raw);
    const actionId = f.requiredString('actionId', 100);
    const rec = parseRecurrence(f, (raw ?? {}) as Record<string, unknown>);
    const payload = f.optionalJsonObjectString('payload', PAYLOAD_MAX);
    const enabled = f.optionalBoolean('enabled');

    // actionId phải trỏ tới một action CÓ THẬT trong registry: một dòng lịch gõ sai id
    // chỉ lộ ra lúc 4h sáng khi cron bỏ qua nó thì quá muộn.
    if (!f.error && !getAction(actionId)) f.reject('actionId', 'không có trong registry');
    if (f.error) return invalidBody(c, f.error);

    try {
        const db = drizzle(c.env.assistant_db, { schema });
        const id = crypto.randomUUID();
        await db.insert(schedules).values({
            id,
            actionId,
            ...rec,
            payload: payload ?? '{}',
            enabled: enabled ?? true,
        });
        return c.json({ id }, 201);
    } catch (err) {
        return serverError(c, err, 'admin.schedule.create');
    }
});

adminRoutes.patch('/schedules/:id', async (c) => {
    const id = c.req.param('id');
    let raw: unknown;
    try {
        raw = await c.req.json();
    } catch {
        return fail(c, 400, 'INVALID_BODY', 'Body phải là JSON');
    }

    const db = drizzle(c.env.assistant_db, { schema });
    const [existing] = await db.select().from(schedules).where(eq(schedules.id, id)).limit(1);
    if (!existing) return fail(c, 404, 'NOT_FOUND', 'Không có lịch này');

    const f = new Body(raw);
    const body = (raw ?? {}) as Record<string, unknown>;
    // `undefined` = không gửi = giữ nguyên (drizzle bỏ qua undefined trong .set()).
    const has = (k: string) => raw !== null && typeof raw === 'object' && k in (raw as object);

    // Có `kind` = form sửa gửi lại toàn bộ lịch lặp → ghi đè cả cụm, null hoá cột không
    // hợp kiểu mới (weekly → daily phải xoá days_of_week). Không có `kind` = sửa lẻ, chỉ
    // cho vài field an toàn (toggle bật/tắt, đổi payload…).
    const rec = has('kind') ? parseRecurrence(f, body) : null;

    const patch = {
        actionId: has('actionId') ? f.requiredString('actionId', 100) : undefined,
        payload: f.optionalJsonObjectString('payload', PAYLOAD_MAX),
        enabled: f.optionalBoolean('enabled'),
        ...(rec ? rec : { timeOfDay: f.optionalTime('timeOfDay') }),
    };
    if (!f.error && patch.actionId !== undefined && !getAction(patch.actionId)) {
        f.reject('actionId', 'không có trong registry');
    }
    if (f.error) return invalidBody(c, f.error);

    try {
        await db
            .update(schedules)
            .set({ ...patch, updatedAt: new Date() })
            .where(eq(schedules.id, id));
        return c.json({ ok: true });
    } catch (err) {
        return serverError(c, err, 'admin.schedule.update', { id });
    }
});

adminRoutes.delete('/schedules/:id', async (c) => {
    const id = c.req.param('id');
    try {
        const db = drizzle(c.env.assistant_db, { schema });
        await db.delete(schedules).where(eq(schedules.id, id));
        return c.json({ ok: true });
    } catch (err) {
        return serverError(c, err, 'admin.schedule.delete', { id });
    }
});

// Chạy job NGAY, bỏ qua giờ/enabled/last_run. Cố ý KHÔNG đụng last_run_date: đây là nút
// để thử, không phải để "đánh dấu hôm nay đã gửi" — chạy tay xong thì lịch tự động vẫn
// chạy đúng giờ như thường. Luôn trả 200 kèm {ok, summary} để UI hiện kết quả thay vì
// nuốt vào ApiError.
adminRoutes.post('/schedules/:id/run', async (c) => {
    const id = c.req.param('id');
    const db = drizzle(c.env.assistant_db, { schema });
    const [row] = await db.select().from(schedules).where(eq(schedules.id, id)).limit(1);
    if (!row) return fail(c, 404, 'NOT_FOUND', 'Không có lịch này');

    try {
        const outcome = await runActionById(db, c.env, row.actionId, parsePayload(row.payload), '[chạy tay]');
        return c.json(outcome);
    } catch (err) {
        return serverError(c, err, 'admin.schedule.run', { id });
    }
});
