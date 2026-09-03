import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SELF, env, botToken, seedEvent, mockTelegram, type TelegramMock } from './helpers';
import { today } from '../src/lib/dates';

// Bật mock cho MỌI test trong file: request ra ngoài không phải Telegram sẽ ném lỗi,
// nên "không gọi Telegram" là điều được canh thật chứ không phải một expect trang trí.
let tg: TelegramMock;
beforeEach(() => { tg = mockTelegram(); });
afterEach(() => tg.restore());

const run = async (payload: Record<string, unknown> = {}) =>
    SELF.fetch('https://x/api/bot/actions/countdown.notify/run', {
        method: 'POST',
        headers: { 'content-type': 'application/json', Authorization: `Bearer ${await botToken()}` },
        body: JSON.stringify({ payload }),
    });

// Seed quanh ngày THẬT, vì action tự tính 'hôm nay' từ đồng hồ worker.
const shift = (days: number) => {
    const d = new Date(`${today(env.TIMEZONE)}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
};

describe('countdown.notify', () => {
    it('không có event active → không gọi Telegram', async () => {
        await seedEvent({ startDate: shift(10), endDate: shift(20) }); // pending
        await seedEvent({ startDate: shift(-20), endDate: shift(-10) }); // finished

        const res = await run();
        expect(res.status).toBe(200);
        const body = (await res.json()) as { ok: boolean; data: { sent: boolean; reason: string } };
        expect(body.ok).toBe(true);
        expect(body.data.sent).toBe(false);
        expect(body.data.reason).toBe('no_active_events');
        expect(tg.calls).toHaveLength(0);
    });

    it('bỏ qua event enabled = false', async () => {
        await seedEvent({ event: 'Đã tắt', startDate: shift(-5), endDate: shift(5), enabled: 0 });
        const body = (await (await run()).json()) as { data: { sent: boolean; reason: string } };
        expect(body.data.reason).toBe('no_active_events');
        expect(tg.calls).toHaveLength(0);
    });

    it('dryRun = true → dựng nội dung nhưng TUYỆT ĐỐI không gọi Telegram', async () => {
        await seedEvent({ event: 'Đang chạy', startDate: shift(-5), endDate: shift(5) });

        const body = (await (await run({ dryRun: true })).json()) as {
            ok: boolean;
            summary: string;
            data: { sent: boolean; reason: string; message: string };
        };
        expect(body.ok).toBe(true);
        expect(body.data.sent).toBe(false);
        expect(body.data.reason).toBe('dry_run');
        expect(body.data.message).toContain('Đang chạy');
        expect(body.summary).toContain('CHẠY THỬ');
        expect(tg.calls).toHaveLength(0);
    });

    it('gửi thật: đúng MỘT tin nhắn gộp mọi event active', async () => {
        await seedEvent({ event: 'Một', startDate: shift(-5), endDate: shift(5) });
        await seedEvent({ event: 'Hai', startDate: shift(-2), endDate: shift(8) });
        await seedEvent({ event: 'Chưa tới', startDate: shift(30), endDate: shift(40) });

        const body = (await (await run()).json()) as { ok: boolean; data: { sent: boolean; count: number } };
        expect(body.ok).toBe(true);
        expect(body.data.sent).toBe(true);
        expect(body.data.count).toBe(2);

        expect(tg.calls).toHaveLength(1);
        expect(tg.calls[0].chat_id).toBe(env.TELEGRAM_CHAT_ID);
        // Có TELEGRAM_TOPIC_ID → phải kèm message_thread_id (số, không phải chuỗi),
        // nếu không tin nhắn rơi vào "General". Bỏ spread trong send.ts là test này đỏ.
        expect(tg.calls[0].message_thread_id).toBe(Number(env.TELEGRAM_TOPIC_ID));
        expect(tg.calls[0].parse_mode).toBe('MarkdownV2');
        expect(tg.calls[0].text).toContain('Một');
        expect(tg.calls[0].text).toContain('Hai');
        expect(tg.calls[0].text).not.toContain('Chưa tới');
    });

    it('Telegram trả lỗi → 502, ok:false, giữ nguyên câu giải thích', async () => {
        tg.failNext(400, { ok: false, description: "can't parse entities" });
        await seedEvent({ event: 'X', startDate: shift(-1), endDate: shift(1) });

        const res = await run();
        expect(res.status).toBe(502);
        const body = (await res.json()) as { ok: boolean; summary: string };
        expect(body.ok).toBe(false);
        expect(body.summary).toContain("can't parse entities");
    });

    it('ghi execution_logs sau khi chạy', async () => {
        await seedEvent({ event: 'X', startDate: shift(-1), endDate: shift(1) });
        await run();

        const { results } = await env.assistant_db.prepare('SELECT action_id, status FROM execution_logs').all();
        expect(results).toHaveLength(1);
        expect(results[0]).toMatchObject({ action_id: 'countdown.notify', status: 'ok' });
    });
});
