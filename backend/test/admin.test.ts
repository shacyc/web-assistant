import { describe, it, expect, beforeAll } from 'vitest';
import { SELF, env, adminCookie, seedEvent } from './helpers';

// Lấy cookie MỘT lần cho cả file: `/api/admin/session` bị ADMIN_LOGIN_LIMITER chặn ở
// 10 lần/phút/IP. Cookie là JWT stateless hạn 2h, `beforeEach` chỉ xoá bảng chứ không
// vô hiệu hoá nó — dùng lại xuyên suốt được. Test nào cần kiểm chính đường đăng nhập
// thì tự gọi lại.
let COOKIE: string;
beforeAll(async () => {
    COOKIE = await adminCookie();
});

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
        for (const path of ['/api/admin/countdowns', '/api/admin/logs', '/api/admin/me', '/api/admin/variables', '/api/admin/countdown-config', '/api/admin/countdown-config/test', '/api/admin/healthchecks', '/api/admin/healthchecks/run', '/api/admin/healthcheck-config', '/api/admin/healthcheck-config/test']) {
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
        const cookie = COOKIE;
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
            cookie: COOKIE,
            body: JSON.stringify({ event: 'Ngược', startDate: '2026-10-01', endDate: '2026-09-01' }),
        });
        expect(res.status).toBe(400);
        expect(((await res.json()) as { field: string }).field).toBe('endDate');
    });

    it('ngày không có thật → 400', async () => {
        const res = await req('/api/admin/countdowns', {
            method: 'POST',
            cookie: COOKIE,
            body: JSON.stringify({ event: 'X', startDate: '2026-02-31', endDate: '2026-03-01' }),
        });
        expect(res.status).toBe(400);
    });

    it('PATCH thiếu field KHÔNG xoá trắng field cũ', async () => {
        const cookie = COOKIE;
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
        const cookie = COOKIE;
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
            cookie: COOKIE,
            body: JSON.stringify({ event: 'X' }),
        });
        expect(res.status).toBe(404);
    });

    it('xoá', async () => {
        const cookie = COOKIE;
        const seeded = await seedEvent();
        expect((await req(`/api/admin/countdowns/${seeded.id}`, { method: 'DELETE', cookie })).status).toBe(200);
        const { countdowns } = (await (await req('/api/admin/countdowns', { cookie })).json()) as { countdowns: unknown[] };
        expect(countdowns).toHaveLength(0);
    });
});

describe('nhật ký', () => {
    it('DELETE /logs dọn sạch bảng — bỏ dòng db.delete thì test này đỏ', async () => {
        const cookie = COOKIE;
        await env.assistant_db
            .prepare("INSERT INTO execution_logs (id, action_id, status, detail) VALUES (?, 'countdown.notify', 'ok', 'x')")
            .bind(crypto.randomUUID())
            .run();

        const before = (await (await req('/api/admin/logs', { cookie })).json()) as { logs: unknown[] };
        expect(before.logs).toHaveLength(1);

        expect((await req('/api/admin/logs', { method: 'DELETE', cookie })).status).toBe(200);

        const after = (await (await req('/api/admin/logs', { cookie })).json()) as { logs: unknown[] };
        expect(after.logs).toHaveLength(0);
    });

    it('DELETE /logs không cookie → 401', async () => {
        expect((await req('/api/admin/logs', { method: 'DELETE' })).status).toBe(401);
    });
});

describe('CRUD health-check', () => {
    it('tạo, đọc lại, PATCH toggle, xoá', async () => {
        const cookie = COOKIE;

        const create = await req('/api/admin/healthchecks', {
            method: 'POST',
            cookie,
            body: JSON.stringify({ label: 'API prod', url: 'https://api.example/health', checkScript: 'return "up"' }),
        });
        expect(create.status).toBe(201);
        const { id } = (await create.json()) as { id: string };

        const list = (await (await req('/api/admin/healthchecks', { cookie })).json()) as {
            healthchecks: { id: string; label: string; url: string; enabled: boolean }[];
        };
        expect(list.healthchecks).toHaveLength(1);
        expect(list.healthchecks[0]).toMatchObject({ label: 'API prod', url: 'https://api.example/health', enabled: true });

        expect(
            (await req(`/api/admin/healthchecks/${id}`, { method: 'PATCH', cookie, body: JSON.stringify({ enabled: false }) })).status,
        ).toBe(200);
        const after = (await (await req('/api/admin/healthchecks', { cookie })).json()) as {
            healthchecks: { enabled: boolean }[];
        };
        expect(after.healthchecks[0].enabled).toBe(false);

        expect((await req(`/api/admin/healthchecks/${id}`, { method: 'DELETE', cookie })).status).toBe(200);
        const empty = (await (await req('/api/admin/healthchecks', { cookie })).json()) as { healthchecks: unknown[] };
        expect(empty.healthchecks).toHaveLength(0);
    });

    it('thiếu label → 400', async () => {
        const res = await req('/api/admin/healthchecks', {
            method: 'POST',
            cookie: COOKIE,
            body: JSON.stringify({ url: 'https://x.example' }),
        });
        expect(res.status).toBe(400);
        expect((await res.json() as { field: string }).field).toBe('label');
    });

    it('url không phải http(s) → 400 field url', async () => {
        const cookie = COOKIE;
        for (const url of ['ftp://x.example', 'not-a-url', 'javascript:alert(1)']) {
            const res = await req('/api/admin/healthchecks', {
                method: 'POST',
                cookie,
                body: JSON.stringify({ label: 'X', url }),
            });
            expect(res.status).toBe(400);
            expect((await res.json() as { field: string }).field).toBe('url');
        }
    });

    it('checkScript quá 4000 ký tự → 400', async () => {
        const res = await req('/api/admin/healthchecks', {
            method: 'POST',
            cookie: COOKIE,
            body: JSON.stringify({ label: 'X', url: 'https://x.example', checkScript: 'a'.repeat(4001) }),
        });
        expect(res.status).toBe(400);
    });

    it('PATCH id không tồn tại → 404', async () => {
        const res = await req('/api/admin/healthchecks/khong-co', {
            method: 'PATCH',
            cookie: COOKIE,
            body: JSON.stringify({ enabled: false }),
        });
        expect(res.status).toBe(404);
    });
});

describe('cấu hình health-check', () => {
    it('GET trả null khi chưa set; PUT rồi GET lại đúng giá trị', async () => {
        const cookie = COOKIE;

        const before = (await (await req('/api/admin/healthcheck-config', { cookie })).json()) as {
            chatIdKey: string | null;
            topicIdKey: string | null;
            template: string | null;
        };
        expect(before).toEqual({ chatIdKey: null, topicIdKey: null, template: null });

        await env.assistant_db.prepare("INSERT INTO variables (key, value) VALUES ('hc chat', '-100')").run();
        const put = await req('/api/admin/healthcheck-config', {
            method: 'PUT',
            cookie,
            body: JSON.stringify({ chatIdKey: 'hc chat', topicIdKey: null, template: '{stateEmoji} {label}' }),
        });
        expect(put.status).toBe(200);

        const after = (await (await req('/api/admin/healthcheck-config', { cookie })).json()) as {
            chatIdKey: string | null;
            template: string | null;
        };
        expect(after.chatIdKey).toBe('hc chat');
        expect(after.template).toBe('{stateEmoji} {label}');
    });
});
