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

async function api(method: string, path: string, body?: unknown) {
    return SELF.fetch(`https://x${path}`, {
        method,
        headers: { ...json, cookie: await adminCookie() },
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

    const fire = async () => {
        const ctrl = createScheduledController({ scheduledTime: new Date(), cron: '*/5 * * * *' });
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
