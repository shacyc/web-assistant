import { describe, it, expect } from 'vitest';
import { SELF, env, adminCookie, seedEvent } from './helpers';

const req = (path: string, init: RequestInit & { cookie?: string } = {}) => {
    const { cookie, ...rest } = init;
    return SELF.fetch(`https://x${path}`, {
        ...rest,
        headers: { 'content-type': 'application/json', ...(cookie ? { Cookie: cookie } : {}), ...(rest.headers ?? {}) },
    });
};

describe('đăng nhập admin', () => {
    it('mật khẩu đúng → set cookie HttpOnly + Secure + SameSite=Strict', async () => {
        const res = await req('/api/admin/session', { method: 'POST', body: JSON.stringify({ password: env.ADMIN_PASSWORD }) });
        expect(res.status).toBe(200);
        const cookie = res.headers.get('set-cookie') ?? '';
        expect(cookie).toContain('admin_session=');
        expect(cookie).toContain('HttpOnly');
        expect(cookie).toContain('Secure');
        expect(cookie).toContain('SameSite=Strict');
    });

    it('mật khẩu sai → 401, không set cookie', async () => {
        const res = await req('/api/admin/session', { method: 'POST', body: JSON.stringify({ password: 'sai' }) });
        expect(res.status).toBe(401);
        expect(res.headers.get('set-cookie')).toBeNull();
    });
});

describe('cổng admin', () => {
    it('không cookie → 401 trên mọi endpoint admin', async () => {
        for (const path of ['/api/admin/countdowns', '/api/admin/logs', '/api/admin/me']) {
            expect((await req(path)).status).toBe(401);
        }
    });

    it('token bot KHÔNG mở được cổng admin', async () => {
        // Hai scope khác nhau ký bằng cùng SESSION_SECRET. Nếu bỏ kiểm `scope` trong
        // session.read thì test này đỏ — và đó là leo thang quyền thật sự.
        const bot = await SELF.fetch('https://x/api/bot/session', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ secret: env.BOT_SECRET }),
        });
        const { token } = (await bot.json()) as { token: string };
        const res = await req('/api/admin/countdowns', { cookie: `admin_session=${token}` });
        expect(res.status).toBe(401);
    });
});

describe('CRUD countdown', () => {
    it('tạo và đọc lại', async () => {
        const cookie = await adminCookie();
        const create = await req('/api/admin/countdowns', {
            method: 'POST',
            cookie,
            body: JSON.stringify({ event: 'Sinh nhật mẹ', description: 'Đặt bánh', startDate: '2026-09-01', endDate: '2026-10-01' }),
        });
        expect(create.status).toBe(201);

        const list = await req('/api/admin/countdowns', { cookie });
        const { countdowns } = (await list.json()) as { countdowns: Array<{ event: string; enabled: boolean }> };
        expect(countdowns).toHaveLength(1);
        expect(countdowns[0].event).toBe('Sinh nhật mẹ');
        expect(countdowns[0].enabled).toBe(true);
    });

    it('endDate trước startDate → 400 chứ không phải 500', async () => {
        const res = await req('/api/admin/countdowns', {
            method: 'POST',
            cookie: await adminCookie(),
            body: JSON.stringify({ event: 'Ngược', startDate: '2026-10-01', endDate: '2026-09-01' }),
        });
        expect(res.status).toBe(400);
        expect(((await res.json()) as { field: string }).field).toBe('endDate');
    });

    it('ngày không có thật → 400', async () => {
        const res = await req('/api/admin/countdowns', {
            method: 'POST',
            cookie: await adminCookie(),
            body: JSON.stringify({ event: 'X', startDate: '2026-02-31', endDate: '2026-03-01' }),
        });
        expect(res.status).toBe(400);
    });

    it('PATCH thiếu field KHÔNG xoá trắng field cũ', async () => {
        const cookie = await adminCookie();
        const seeded = await seedEvent({ event: 'Cũ', description: 'Mô tả cũ' });

        const res = await req(`/api/admin/countdowns/${seeded.id}`, {
            method: 'PATCH',
            cookie,
            body: JSON.stringify({ event: 'Mới' }),
        });
        expect(res.status).toBe(200);

        const { countdowns } = (await (await req('/api/admin/countdowns', { cookie })).json()) as {
            countdowns: Array<{ event: string; description: string | null; startDate: string }>;
        };
        expect(countdowns[0].event).toBe('Mới');
        expect(countdowns[0].description).toBe('Mô tả cũ'); // ← dòng canh "vắng mặt ≠ null"
        expect(countdowns[0].startDate).toBe('2026-09-01');
    });

    it('PATCH chỉ startDate vẫn bị chặn nếu vượt qua endDate CŨ', async () => {
        const cookie = await adminCookie();
        const seeded = await seedEvent({ startDate: '2026-09-01', endDate: '2026-09-10' });
        const res = await req(`/api/admin/countdowns/${seeded.id}`, {
            method: 'PATCH',
            cookie,
            body: JSON.stringify({ startDate: '2026-12-01' }),
        });
        expect(res.status).toBe(400);
    });

    it('PATCH id không tồn tại → 404', async () => {
        const res = await req('/api/admin/countdowns/khong-co', {
            method: 'PATCH',
            cookie: await adminCookie(),
            body: JSON.stringify({ event: 'X' }),
        });
        expect(res.status).toBe(404);
    });

    it('xoá', async () => {
        const cookie = await adminCookie();
        const seeded = await seedEvent();
        expect((await req(`/api/admin/countdowns/${seeded.id}`, { method: 'DELETE', cookie })).status).toBe(200);
        const { countdowns } = (await (await req('/api/admin/countdowns', { cookie })).json()) as { countdowns: unknown[] };
        expect(countdowns).toHaveLength(0);
    });
});
