import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createScheduledController, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import worker from '../src/index';
import {
    SELF,
    env,
    adminCookie,
    seedSchedule,
    seedEvent,
    seedCountdownConfig,
    mockTelegram,
    type TelegramMock,
} from './helpers';
import { today } from '../src/lib/dates';

const json = { 'content-type': 'application/json' };

// Đăng nhập MỘT lần cho cả file: ADMIN_LOGIN_LIMITER là 10 lần/60s, mà file này gọi API
// nhiều hơn thế — login mỗi lần sẽ bị 429 rồi rơi về 401.
let cookie: string | undefined;
async function api(method: string, path: string, body?: unknown) {
    if (!cookie) cookie = await adminCookie();
    return SELF.fetch(`https://x${path}`, {
        method,
        headers: { ...json, cookie },
        body: body === undefined ? undefined : JSON.stringify(body),
    });
}

describe('admin /schedules CRUD', () => {
    it('cần đăng nhập', async () => {
        const res = await SELF.fetch('https://x/api/admin/schedules');
        expect(res.status).toBe(401);
    });

    it('tạo → hiện trong danh sách, kèm metadata action', async () => {
        const created = await api('POST', '/api/admin/schedules', {
            actionId: 'countdown.notify',
            timeOfDay: '04:30',
            payload: { dryRun: false },
        });
        expect(created.status).toBe(201);

        const res = await api('GET', '/api/admin/schedules');
        const body = (await res.json()) as {
            schedules: { actionId: string; timeOfDay: string; payload: string; enabled: boolean }[];
            actions: { id: string }[];
        };
        expect(body.schedules).toHaveLength(1);
        expect(body.schedules[0]).toMatchObject({ actionId: 'countdown.notify', timeOfDay: '04:30', enabled: true });
        expect(body.schedules[0].payload).toBe('{"dryRun":false}');
        // metadata để màn Lịch dựng form mà không phải gọi /api/bot
        expect(body.actions.some((a) => a.id === 'countdown.notify')).toBe(true);
    });

    it('từ chối actionId không có trong registry', async () => {
        const res = await api('POST', '/api/admin/schedules', { actionId: 'khong.ton.tai', timeOfDay: '04:30' });
        expect(res.status).toBe(400);
        expect((await res.json() as { field: string }).field).toBe('actionId');
    });

    it('từ chối giờ sai định dạng', async () => {
        const res = await api('POST', '/api/admin/schedules', { actionId: 'countdown.notify', timeOfDay: '4:30' });
        expect(res.status).toBe(400);
        expect((await res.json() as { field: string }).field).toBe('timeOfDay');
    });

    it('từ chối payload không phải object', async () => {
        const res = await api('POST', '/api/admin/schedules', {
            actionId: 'countdown.notify',
            timeOfDay: '04:30',
            payload: [1, 2, 3],
        });
        expect(res.status).toBe(400);
        expect((await res.json() as { field: string }).field).toBe('payload');
    });

    it('tạo được mọi kiểu lặp; chỉ điền cột hợp với kind', async () => {
        const mk = (b: Record<string, unknown>) =>
            api('POST', '/api/admin/schedules', { actionId: 'countdown.notify', ...b });

        expect((await mk({ kind: 'weekly', timeOfDay: '04:30', daysOfWeek: [1, 3, 5] })).status).toBe(201);
        expect((await mk({ kind: 'monthly', timeOfDay: '09:00', dayOfMonth: 1 })).status).toBe(201);
        expect((await mk({ kind: 'interval', timeOfDay: '08:00', intervalDays: 3, anchorDate: '2026-09-01' })).status).toBe(201);
        expect((await mk({ kind: 'cron', cron: '*/15 9-17 * * 1-5' })).status).toBe(201);
        expect((await mk({ kind: 'every', intervalSeconds: 5400 })).status).toBe(201);
        // 'tick' không cần field nào — chỉ actionId + kind.
        expect((await mk({ kind: 'tick' })).status).toBe(201);

        const { schedules } = (await (await api('GET', '/api/admin/schedules')).json()) as {
            schedules: Array<Record<string, unknown>>;
        };
        const weekly = schedules.find((s) => s.kind === 'weekly')!;
        expect(weekly.daysOfWeek).toBe('1,3,5');
        expect(weekly.cron).toBe(null);
        const cron = schedules.find((s) => s.kind === 'cron')!;
        expect(cron.cron).toBe('*/15 9-17 * * 1-5');
        expect(cron.daysOfWeek).toBe(null);
        const every = schedules.find((s) => s.kind === 'every')!;
        expect(every.intervalSeconds).toBe(5400);
        expect(every.cron).toBe(null);
        const tick = schedules.find((s) => s.kind === 'tick')!;
        expect(tick.timeOfDay).toBe('00:00'); // chỗ giữ cho cột NOT NULL
        expect(tick.cron).toBe(null);
        expect(tick.intervalSeconds).toBe(null);
    });

    it('từ chối cấu hình lặp sai', async () => {
        const bad = (b: Record<string, unknown>) =>
            api('POST', '/api/admin/schedules', { actionId: 'countdown.notify', ...b });
        expect((await bad({ kind: 'bừa', timeOfDay: '04:30' })).status).toBe(400);
        expect((await bad({ kind: 'weekly', timeOfDay: '04:30', daysOfWeek: [] })).status).toBe(400);
        expect((await bad({ kind: 'weekly', timeOfDay: '04:30', daysOfWeek: [0, 9] })).status).toBe(400);
        expect((await bad({ kind: 'monthly', timeOfDay: '04:30', dayOfMonth: 32 })).status).toBe(400);
        expect((await bad({ kind: 'interval', timeOfDay: '04:30', intervalDays: 0, anchorDate: '2026-09-01' })).status).toBe(400);
        expect((await bad({ kind: 'cron', cron: '61 4 * * *' })).status).toBe(400);
        expect((await bad({ kind: 'every', intervalSeconds: 30 })).status).toBe(400); // < 60s
        expect((await bad({ kind: 'every', intervalSeconds: 999999999 })).status).toBe(400); // > 7 ngày
        expect((await bad({ kind: 'every' })).status).toBe(400); // thiếu intervalSeconds
        const r = await bad({ kind: 'cron', cron: 'rác rến' });
        expect(r.status).toBe(400);
        expect((await r.json() as { field: string }).field).toBe('cron');
    });

    it('PATCH có kind → ghi đè cả cụm, null hoá cột không hợp kiểu mới', async () => {
        const row = await seedSchedule({ kind: 'weekly', daysOfWeek: '1,2,3', timeOfDay: '04:30' });
        const res = await api('PATCH', `/api/admin/schedules/${row.id}`, { kind: 'daily', timeOfDay: '05:00' });
        expect(res.status).toBe(200);
        const { results } = await env.assistant_db
            .prepare('SELECT kind, time_of_day, days_of_week FROM schedules WHERE id = ?')
            .bind(row.id)
            .all();
        expect(results[0]).toMatchObject({ kind: 'daily', time_of_day: '05:00', days_of_week: null });
    });

    it('PATCH đổi giờ + tắt, không đụng field không gửi', async () => {
        const row = await seedSchedule({ timeOfDay: '04:30', payload: '{"dryRun":true}' });
        const res = await api('PATCH', `/api/admin/schedules/${row.id}`, { timeOfDay: '06:00', enabled: false });
        expect(res.status).toBe(200);

        const { results } = await env.assistant_db
            .prepare('SELECT time_of_day, enabled, payload FROM schedules WHERE id = ?')
            .bind(row.id)
            .all();
        expect(results[0]).toMatchObject({ time_of_day: '06:00', enabled: 0, payload: '{"dryRun":true}' });
    });

    it('PATCH giờ sai → 400, không đổi gì', async () => {
        const row = await seedSchedule({ timeOfDay: '04:30' });
        const res = await api('PATCH', `/api/admin/schedules/${row.id}`, { timeOfDay: '99:99' });
        expect(res.status).toBe(400);
        const { results } = await env.assistant_db
            .prepare('SELECT time_of_day FROM schedules WHERE id = ?')
            .bind(row.id)
            .all();
        expect(results[0].time_of_day).toBe('04:30');
    });

    it('DELETE', async () => {
        const row = await seedSchedule();
        expect((await api('DELETE', `/api/admin/schedules/${row.id}`)).status).toBe(200);
        const { results } = await env.assistant_db.prepare('SELECT id FROM schedules').all();
        expect(results).toHaveLength(0);
    });
});

describe('admin /schedules/:id/run — chạy tay', () => {
    let tg: TelegramMock;
    beforeEach(() => {
        tg = mockTelegram();
    });
    afterEach(() => tg.restore());

    it('chạy action ngay, KHÔNG đụng last_run_date', async () => {
        await seedCountdownConfig({ chatId: '-100', topicIdKey: null });
        await seedEvent({ event: 'X', startDate: today(env.TIMEZONE), endDate: today(env.TIMEZONE) });
        const row = await seedSchedule({ actionId: 'countdown.notify', timeOfDay: '23:59' });

        const res = await api('POST', `/api/admin/schedules/${row.id}/run`);
        expect(res.status).toBe(200);
        const body = (await res.json()) as { ok: boolean; summary: string };
        expect(body.ok).toBe(true);
        expect(tg.calls).toHaveLength(1);

        // nút "chạy tay" là để thử — lịch tự động vẫn phải chạy đúng giờ sau đó
        const { results } = await env.assistant_db
            .prepare('SELECT last_run_date FROM schedules WHERE id = ?')
            .bind(row.id)
            .all();
        expect(results[0].last_run_date).toBe(null);

        // vẫn ghi execution_logs, tiền tố [chạy tay]
        const logs = await env.assistant_db.prepare('SELECT detail FROM execution_logs').all();
        expect(String(logs.results[0].detail)).toContain('[chạy tay]');
    });

    it('lịch không tồn tại → 404', async () => {
        expect((await api('POST', '/api/admin/schedules/khong-co/run')).status).toBe(404);
    });
});

// Handler `scheduled` gọi thẳng, không qua HTTP — dùng createScheduledController như tài
// liệu pool khuyến nghị.
describe('cron scheduled handler', () => {
    let tg: TelegramMock;
    beforeEach(() => {
        tg = mockTelegram();
    });
    afterEach(() => tg.restore());

    const fire = async (scheduledTime: number = Date.now()) => {
        const ctrl = createScheduledController({ scheduledTime, cron: '*/5 * * * *' });
        const ctx = createExecutionContext();
        await worker.scheduled!(ctrl, env, ctx);
        await waitOnExecutionContext(ctx);
    };

    const lastRun = async (id: string) => {
        const { results } = await env.assistant_db
            .prepare('SELECT last_run_date, last_run_status FROM schedules WHERE id = ?')
            .bind(id)
            .all();
        return results[0] as { last_run_date: string | null; last_run_status: string | null };
    };

    it('job tới giờ, hôm nay chưa chạy → chạy action, gửi Telegram, đánh dấu last_run_date', async () => {
        await seedCountdownConfig({ chatId: '-100', topicIdKey: null });
        await seedEvent({ event: 'X', startDate: today(env.TIMEZONE), endDate: today(env.TIMEZONE) });
        const row = await seedSchedule({ actionId: 'countdown.notify', timeOfDay: '00:00', payload: '{"dryRun":false}' });

        await fire();

        expect(tg.calls).toHaveLength(1);
        expect(await lastRun(row.id)).toMatchObject({ last_run_date: today(env.TIMEZONE), last_run_status: 'ok' });

        const logs = await env.assistant_db.prepare('SELECT detail FROM execution_logs').all();
        expect(String(logs.results[0].detail)).toContain('[cron]');
    });

    it('chạy lần hai trong ngày → không gửi lại (canh chốt last_run_date)', async () => {
        await seedCountdownConfig({ chatId: '-100', topicIdKey: null });
        await seedEvent({ event: 'X', startDate: today(env.TIMEZONE), endDate: today(env.TIMEZONE) });
        await seedSchedule({ actionId: 'countdown.notify', timeOfDay: '00:00' });

        await fire();
        await fire();

        expect(tg.calls).toHaveLength(1);
    });

    it('hai lần cron chồng nhau cùng lúc → vẫn chỉ gửi một lần (canh UPDATE có điều kiện)', async () => {
        await seedCountdownConfig({ chatId: '-100', topicIdKey: null });
        await seedEvent({ event: 'X', startDate: today(env.TIMEZONE), endDate: today(env.TIMEZONE) });
        await seedSchedule({ actionId: 'countdown.notify', timeOfDay: '00:00' });

        // Song song: cả hai SELECT được dòng chưa chạy trước khi có cái nào kịp ghi
        // last_run_date. Chỉ dòng `claim` (UPDATE ... WHERE last_run_date chưa = hôm nay)
        // chặn được lần gửi thứ hai — bỏ dòng đó là test này đỏ.
        await Promise.all([fire(), fire()]);

        expect(tg.calls).toHaveLength(1);
    });

    it('enabled = false → bỏ qua', async () => {
        await seedCountdownConfig({ chatId: '-100', topicIdKey: null });
        await seedEvent({ event: 'X', startDate: today(env.TIMEZONE), endDate: today(env.TIMEZONE) });
        const row = await seedSchedule({ timeOfDay: '00:00', enabled: 0 });

        await fire();

        expect(tg.calls).toHaveLength(0);
        expect(await lastRun(row.id)).toMatchObject({ last_run_date: null });
    });

    it('chưa tới giờ → bỏ qua (23:59 gần như luôn ở tương lai)', async () => {
        await seedCountdownConfig({ chatId: '-100', topicIdKey: null });
        await seedEvent({ event: 'X', startDate: today(env.TIMEZONE), endDate: today(env.TIMEZONE) });
        const row = await seedSchedule({ timeOfDay: '23:59' });

        await fire();

        expect(await lastRun(row.id)).toMatchObject({ last_run_date: null });
    });

    it('actionId lạ → ghi log error, đánh dấu last_run_date, KHÔNG làm chết lượt quét', async () => {
        const bad = await seedSchedule({ actionId: 'khong.ton.tai', timeOfDay: '00:00' });
        // job hợp lệ đứng sau vẫn phải chạy
        await seedCountdownConfig({ chatId: '-100', topicIdKey: null });
        await seedEvent({ event: 'X', startDate: today(env.TIMEZONE), endDate: today(env.TIMEZONE) });
        const good = await seedSchedule({ actionId: 'countdown.notify', timeOfDay: '00:01' });

        await fire();

        expect((await lastRun(bad.id)).last_run_status).toBe('error');
        expect(await lastRun(good.id)).toMatchObject({ last_run_status: 'ok' });
        expect(tg.calls).toHaveLength(1);
    });
});

// Kiểu lặp: kiểm bằng scheduledTime CỐ ĐỊNH nên hoàn toàn tất định.
// 2026-09-06T21:30:00Z = Thứ Hai 07/09/2026, 04:30 giờ VN.
describe('cron scheduled handler — kiểu lặp', () => {
    let tg: TelegramMock;
    beforeEach(() => {
        tg = mockTelegram();
    });
    afterEach(() => tg.restore());

    const MON_0430 = Date.parse('2026-09-06T21:30:00Z');

    const fireAt = async (t: number) => {
        const ctrl = createScheduledController({ scheduledTime: t, cron: '*/5 * * * *' });
        const ctx = createExecutionContext();
        await worker.scheduled!(ctrl, env, ctx);
        await waitOnExecutionContext(ctx);
    };

    const stamp = async (id: string) => {
        const { results } = await env.assistant_db
            .prepare('SELECT last_run_date, last_run_slot, last_run_status FROM schedules WHERE id = ?')
            .bind(id)
            .all();
        return results[0] as { last_run_date: string | null; last_run_slot: string | null; last_run_status: string | null };
    };

    it('weekly: chạy đúng thứ được chọn, bỏ thứ khác', async () => {
        const mon = await seedSchedule({ kind: 'weekly', daysOfWeek: '1', timeOfDay: '04:30' });
        const tue = await seedSchedule({ kind: 'weekly', daysOfWeek: '2', timeOfDay: '04:30' });

        await fireAt(MON_0430);

        expect((await stamp(mon.id)).last_run_date).toBe('2026-09-07');
        expect((await stamp(tue.id)).last_run_date).toBe(null);
    });

    it('monthly: chạy đúng ngày trong tháng', async () => {
        const d7 = await seedSchedule({ kind: 'monthly', dayOfMonth: 7, timeOfDay: '04:30' });
        const d8 = await seedSchedule({ kind: 'monthly', dayOfMonth: 8, timeOfDay: '04:30' });

        await fireAt(MON_0430);

        expect((await stamp(d7.id)).last_run_date).toBe('2026-09-07');
        expect((await stamp(d8.id)).last_run_date).toBe(null);
    });

    it('interval: mỗi N ngày tính từ anchor', async () => {
        const every3 = await seedSchedule({ kind: 'interval', intervalDays: 3, anchorDate: '2026-09-04', timeOfDay: '04:30' });
        const every2 = await seedSchedule({ kind: 'interval', intervalDays: 2, anchorDate: '2026-09-04', timeOfDay: '04:30' });

        await fireAt(MON_0430); // 07/09 = anchor + 3 ngày

        expect((await stamp(every3.id)).last_run_date).toBe('2026-09-07');
        expect((await stamp(every2.id)).last_run_date).toBe(null);
    });

    it('cron: khớp biểu thức → chạy, chốt bằng last_run_slot, không chạy lại trong nhịp', async () => {
        const hit = await seedSchedule({ kind: 'cron', cron: '30 4 * * 1', timeOfDay: '00:00' });
        const miss = await seedSchedule({ kind: 'cron', cron: '30 5 * * 1', timeOfDay: '00:00' });

        await fireAt(MON_0430);
        await fireAt(MON_0430); // cùng nhịp → không chạy lại

        const h = await stamp(hit.id);
        expect(h.last_run_slot).toBe('2026-09-06T21:30');
        expect(h.last_run_status).toBe('ok');
        expect((await stamp(miss.id)).last_run_slot).toBe(null);

        const logs = await env.assistant_db.prepare("SELECT COUNT(*) n FROM execution_logs WHERE detail LIKE '[cron]%'").all();
        expect(logs.results[0].n).toBe(1);
    });

    it('cron: nhịp kế tiếp (slot khác) thì chạy lại', async () => {
        const job = await seedSchedule({ kind: 'cron', cron: '*/30 * * * *', timeOfDay: '00:00' });

        await fireAt(MON_0430);
        await fireAt(Date.parse('2026-09-06T22:00:00Z')); // 05:00 VN, slot mới, vẫn khớp */30

        const logs = await env.assistant_db.prepare("SELECT COUNT(*) n FROM execution_logs WHERE detail LIKE '[cron]%'").all();
        expect(logs.results[0].n).toBe(2);
        expect((await stamp(job.id)).last_run_slot).toBe('2026-09-06T22:00');
    });

    it('tick: chạy MỌI nhịp — không xét giờ/biểu thức, chốt bằng last_run_slot', async () => {
        const job = await seedSchedule({ kind: 'tick', timeOfDay: '00:00' });

        await fireAt(MON_0430);
        await fireAt(MON_0430); // cùng nhịp → không chạy lại
        await fireAt(Date.parse('2026-09-06T22:00:00Z')); // slot mới → chạy tiếp

        const logs = await env.assistant_db.prepare("SELECT COUNT(*) n FROM execution_logs WHERE detail LIKE '[cron]%'").all();
        expect(logs.results[0].n).toBe(2);
        const s = await stamp(job.id);
        expect(s.last_run_slot).toBe('2026-09-06T22:00');
        expect(s.last_run_status).toBe('ok');
    });

    it('tick: enabled = false → bỏ qua', async () => {
        const off = await seedSchedule({ kind: 'tick', timeOfDay: '00:00', enabled: 0 });
        await fireAt(MON_0430);
        expect((await stamp(off.id)).last_run_slot).toBe(null);
        const logs = await env.assistant_db.prepare("SELECT COUNT(*) n FROM execution_logs WHERE detail LIKE '[cron]%'").all();
        expect(logs.results[0].n).toBe(0);
    });

    it('every: chạy khi đủ khoảng, bỏ khi chưa đủ, không trôi khỏi lưới 5 phút', async () => {
        // đủ khoảng: last_run_at cách MON_0430 đúng 30 phút, interval 30 phút
        const due = await seedSchedule({
            kind: 'every',
            intervalSeconds: 1800,
            lastRunAt: new Date(MON_0430 - 1800_000),
        });
        // chưa đủ: mới chạy 10 phút trước, interval 1 ngày → không due trong cả test
        const notYet = await seedSchedule({
            kind: 'every',
            intervalSeconds: 86_400,
            lastRunAt: new Date(MON_0430 - 600_000),
        });

        await fireAt(MON_0430);

        expect((await stamp(due.id)).last_run_status).toBe('ok');
        expect((await stamp(notYet.id)).last_run_status).toBe(null);

        // last_run_at ghi = mốc nhịp (MON_0430), KHÔNG phải lúc chạy xong → nhịp kế +30
        // phút vẫn đúng đủ khoảng, không bị lệch.
        const { results } = await env.assistant_db
            .prepare('SELECT last_run_at FROM schedules WHERE id = ?')
            .bind(due.id)
            .all();
        expect(results[0].last_run_at).toBe(Math.floor(MON_0430 / 1000));

        await fireAt(MON_0430 + 1800_000); // đúng +30 phút
        const logs = await env.assistant_db.prepare("SELECT COUNT(*) n FROM execution_logs WHERE detail LIKE '[cron]%'").all();
        expect(logs.results[0].n).toBe(2); // due chạy lần 1 + lần 2
    });

    it('every: chưa chạy bao giờ (last_run_at null) → chạy ngay nhịp tới', async () => {
        const fresh = await seedSchedule({ kind: 'every', intervalSeconds: 3600, lastRunAt: null });
        await fireAt(MON_0430);
        expect((await stamp(fresh.id)).last_run_status).toBe('ok');
    });
});
