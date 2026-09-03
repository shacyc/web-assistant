import { describe, it, expect } from 'vitest';
import { SELF, env, botToken } from './helpers';

const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
    SELF.fetch(`https://x${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...headers },
        body: JSON.stringify(body),
    });

describe('POST /api/bot/session', () => {
    it('secret đúng → trả token', async () => {
        const res = await post('/api/bot/session', { secret: env.BOT_SECRET });
        expect(res.status).toBe(200);
        const body = (await res.json()) as { token: string; expiresAt: number };
        expect(body.token).toBeTruthy();
        expect(body.expiresAt).toBeGreaterThan(Math.floor(Date.now() / 1000));
    });

    it('secret sai → 401 INVALID_SECRET, KHÔNG trả token', async () => {
        const res = await post('/api/bot/session', { secret: 'sai-hoan-toan' });
        expect(res.status).toBe(401);
        const body = (await res.json()) as { code: string; token?: string };
        expect(body.code).toBe('INVALID_SECRET');
        expect(body.token).toBeUndefined();
    });

    it('secret dài khác nhưng cùng tiền tố → vẫn 401', async () => {
        // Canh cái bẫy của so sánh sớm: nếu ai đó thay secretEquals bằng startsWith
        // hoặc so từng phần thì test này đỏ.
        const res = await post('/api/bot/session', { secret: env.BOT_SECRET.slice(0, -1) });
        expect(res.status).toBe(401);
    });

    it('thiếu field secret → 400', async () => {
        const res = await post('/api/bot/session', {});
        expect(res.status).toBe(400);
        expect(((await res.json()) as { code: string }).code).toBe('INVALID_BODY');
    });
});

describe('cổng bot', () => {
    it('GET /api/bot/actions không token → 401', async () => {
        const res = await SELF.fetch('https://x/api/bot/actions');
        expect(res.status).toBe(401);
    });

    it('token rác → 401', async () => {
        const res = await SELF.fetch('https://x/api/bot/actions', {
            headers: { Authorization: 'Bearer khong-phai-jwt' },
        });
        expect(res.status).toBe(401);
    });

    it('token hợp lệ → liệt kê action kèm metadata form', async () => {
        const res = await SELF.fetch('https://x/api/bot/actions', {
            headers: { Authorization: `Bearer ${await botToken()}` },
        });
        expect(res.status).toBe(200);
        const { actions } = (await res.json()) as { actions: Array<{ id: string; fields: unknown[] }> };
        expect(actions.map((a) => a.id)).toContain('countdown.notify');
        expect(actions[0]).toHaveProperty('label');
        expect(actions[0]).toHaveProperty('fields');
    });

    it('metadata KHÔNG lộ hàm run ra ngoài', async () => {
        const res = await SELF.fetch('https://x/api/bot/actions', {
            headers: { Authorization: `Bearer ${await botToken()}` },
        });
        const { actions } = (await res.json()) as { actions: Array<Record<string, unknown>> };
        expect(actions[0].run).toBeUndefined();
    });

    it('action không tồn tại → 404', async () => {
        const res = await post('/api/bot/actions/khong.co/run', {}, { Authorization: `Bearer ${await botToken()}` });
        expect(res.status).toBe(404);
    });
});
