import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SELF, env, botToken, adminCookie, seedEvent, seedCountdownConfig, mockTelegram, type TelegramMock } from './helpers';
import { today } from '../src/lib/dates';

// Bật mock cho MỌI test trong file: request ra ngoài không phải Telegram sẽ ném lỗi,
// nên "không gọi Telegram" là điều được canh thật chứ không phải một expect trang trí.
let tg: TelegramMock;
beforeEach(() => { tg = mockTelegram(); });
afterEach(() => tg.restore());

// Đích gửi giờ đến từ bảng `variables` chứ không phải secret — test tự seed giá trị và
// so lại đúng giá trị đó.
const CHAT_ID = '-100987654321';
const TOPIC_ID = '19';

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
        await seedCountdownConfig({ chatId: CHAT_ID, topicId: TOPIC_ID });
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
        await seedCountdownConfig({ chatId: CHAT_ID, topicId: TOPIC_ID });
        await seedEvent({ event: 'Đã tắt', startDate: shift(-5), endDate: shift(5), enabled: 0 });
        const body = (await (await run()).json()) as { data: { sent: boolean; reason: string } };
        expect(body.data.reason).toBe('no_active_events');
        expect(tg.calls).toHaveLength(0);
    });

    it('chưa cấu hình key chat id → ok:false, KHÔNG gọi Telegram', async () => {
        // Có event active nhưng không có countdown_config: phải báo lỗi chứ không gửi mù.
        await seedEvent({ event: 'Đang chạy', startDate: shift(-5), endDate: shift(5) });

        const res = await run();
        expect(res.status).toBe(502);
        const body = (await res.json()) as { ok: boolean; summary: string; data: { reason: string } };
        expect(body.ok).toBe(false);
        expect(body.data.reason).toBe('not_configured');
        expect(body.summary).toContain('Cấu hình');
        expect(tg.calls).toHaveLength(0);
    });

    it('key chat id đã trỏ nhưng chưa có giá trị → ok:false', async () => {
        // chatIdKey được set trong config, nhưng không seed dòng variables tương ứng.
        await seedCountdownConfig({ topicIdKey: null });
        await seedEvent({ event: 'Đang chạy', startDate: shift(-5), endDate: shift(5) });

        const body = (await (await run()).json()) as { ok: boolean; data: { reason: string } };
        expect(body.ok).toBe(false);
        expect(body.data.reason).toBe('not_configured');
        expect(tg.calls).toHaveLength(0);
    });

    it('dryRun = true → dựng nội dung + đích gửi nhưng TUYỆT ĐỐI không gọi Telegram', async () => {
        await seedCountdownConfig({ chatId: CHAT_ID, topicId: TOPIC_ID });
        await seedEvent({ event: 'Đang chạy', startDate: shift(-5), endDate: shift(5) });

        const body = (await (await run({ dryRun: true })).json()) as {
            ok: boolean;
            summary: string;
            data: { sent: boolean; reason: string; message: string; chatId: string; topicId: string };
        };
        expect(body.ok).toBe(true);
        expect(body.data.sent).toBe(false);
        expect(body.data.reason).toBe('dry_run');
        expect(body.data.message).toContain('Đang chạy');
        expect(body.data.chatId).toBe(CHAT_ID);
        expect(body.data.topicId).toBe(TOPIC_ID);
        expect(body.summary).toContain('CHẠY THỬ');
        expect(tg.calls).toHaveLength(0);
    });

    it('gửi thật: đúng MỘT tin nhắn gộp mọi event active, tới đích lấy từ variables', async () => {
        await seedCountdownConfig({ chatId: CHAT_ID, topicId: TOPIC_ID });
        await seedEvent({ event: 'Một', startDate: shift(-5), endDate: shift(5) });
        await seedEvent({ event: 'Hai', startDate: shift(-2), endDate: shift(8) });
        await seedEvent({ event: 'Chưa tới', startDate: shift(30), endDate: shift(40) });

        const body = (await (await run()).json()) as { ok: boolean; data: { sent: boolean; count: number } };
        expect(body.ok).toBe(true);
        expect(body.data.sent).toBe(true);
        expect(body.data.count).toBe(2);

        expect(tg.calls).toHaveLength(1);
        expect(tg.calls[0].chat_id).toBe(CHAT_ID);
        // topicIdKey trỏ tới key có giá trị → phải kèm message_thread_id (số, không phải
        // chuỗi), nếu không tin nhắn rơi vào "General". Bỏ spread trong send.ts là test này đỏ.
        expect(tg.calls[0].message_thread_id).toBe(Number(TOPIC_ID));
        expect(tg.calls[0].parse_mode).toBe('MarkdownV2');
        expect(tg.calls[0].text).toContain('Một');
        expect(tg.calls[0].text).toContain('Hai');
        expect(tg.calls[0].text).not.toContain('Chưa tới');
    });

    it('topicIdKey = null → gửi không kèm message_thread_id', async () => {
        await seedCountdownConfig({ chatId: CHAT_ID, topicIdKey: null });
        await seedEvent({ event: 'X', startDate: shift(-1), endDate: shift(1) });

        const body = (await (await run()).json()) as { data: { sent: boolean } };
        expect(body.data.sent).toBe(true);
        expect(tg.calls).toHaveLength(1);
        expect(tg.calls[0].chat_id).toBe(CHAT_ID);
        expect(tg.calls[0].message_thread_id).toBeUndefined();
    });

    it('header / body / footer tuỳ chỉnh trong countdown_config được dùng để dựng nội dung', async () => {
        await seedCountdownConfig({
            chatId: CHAT_ID,
            topicId: TOPIC_ID,
            header: 'CÓ {count} sự kiện đang chạy',
            template: 'SỰ KIỆN {eventName} — còn {remainDays} ngày',
            footer: 'Nguồn: bot',
        });
        await seedEvent({ event: 'Khai trương', startDate: shift(-3), endDate: shift(7) });

        const body = (await (await run()).json()) as { data: { sent: boolean; message: string } };
        expect(body.data.sent).toBe(true);
        expect(tg.calls).toHaveLength(1);
        const text = tg.calls[0].text;
        expect(text).toContain('1 sự kiện đang chạy');
        expect(text).toContain('SỰ KIỆN Khai trương — còn 7 ngày');
        expect(text).toContain('Nguồn: bot');
        // Có mẫu tuỳ chỉnh → không còn dòng mặc định.
        expect(text).not.toContain('Mỗi ngày trôi qua');
        expect(text).not.toContain('⏳');
    });

    it('Telegram trả lỗi → 502, ok:false, giữ nguyên câu giải thích', async () => {
        await seedCountdownConfig({ chatId: CHAT_ID, topicId: TOPIC_ID });
        tg.failNext(400, { ok: false, description: "can't parse entities" });
        await seedEvent({ event: 'X', startDate: shift(-1), endDate: shift(1) });

        const res = await run();
        expect(res.status).toBe(502);
        const body = (await res.json()) as { ok: boolean; summary: string };
        expect(body.ok).toBe(false);
        expect(body.summary).toContain("can't parse entities");
    });

    it('ghi execution_logs sau khi chạy', async () => {
        await seedCountdownConfig({ chatId: CHAT_ID, topicId: TOPIC_ID });
        await seedEvent({ event: 'X', startDate: shift(-1), endDate: shift(1) });
        await run();

        const { results } = await env.assistant_db.prepare('SELECT action_id, status FROM execution_logs').all();
        expect(results).toHaveLength(1);
        expect(results[0]).toMatchObject({ action_id: 'countdown.notify', status: 'ok' });
    });
});

describe('POST /api/admin/countdown-config/test — nút "Gửi thử"', () => {
    const testReq = async () =>
        SELF.fetch('https://x/api/admin/countdown-config/test', {
            method: 'POST',
            headers: { Cookie: await adminCookie() },
        });

    it('không cookie admin → 401, KHÔNG gọi Telegram', async () => {
        const res = await SELF.fetch('https://x/api/admin/countdown-config/test', { method: 'POST' });
        expect(res.status).toBe(401);
        expect(tg.calls).toHaveLength(0);
    });

    it('có sự kiện active + cấu hình đủ → gửi Telegram THẬT (dryRun=false), ghi log [test]', async () => {
        await seedCountdownConfig({ chatId: CHAT_ID, topicId: TOPIC_ID });
        await seedEvent({ event: 'X', startDate: shift(-1), endDate: shift(1) });

        const res = await testReq();
        expect(res.status).toBe(200);
        const body = (await res.json()) as { ok: boolean; summary: string };
        expect(body.ok).toBe(true);
        expect(tg.calls).toHaveLength(1);

        const { results } = await env.assistant_db
            .prepare('SELECT status, detail FROM execution_logs')
            .all();
        expect(results).toHaveLength(1);
        expect(results[0].status).toBe('ok');
        expect(String(results[0].detail)).toContain('[test]');
    });

    it('không có sự kiện active → ok:true, KHÔNG gọi Telegram', async () => {
        await seedCountdownConfig({ chatId: CHAT_ID, topicId: TOPIC_ID });
        const body = (await (await testReq()).json()) as { ok: boolean };
        expect(body.ok).toBe(true);
        expect(tg.calls).toHaveLength(0);
    });
});
