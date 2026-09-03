import { describe, it, expect, beforeAll } from 'vitest';
import { SELF, adminCookie, seedVariable } from './helpers';

// Lấy cookie MỘT lần cho cả file: ADMIN_LOGIN_LIMITER chặn 10 lần đăng nhập / 60s mỗi IP,
// gọi adminCookie() trong từng test sẽ vượt trần và các test cuối nhận 429.
let cookie: string;
beforeAll(async () => {
    cookie = await adminCookie();
});

const req = (path: string, init: RequestInit & { cookie?: string } = {}) => {
    const { cookie: c, ...rest } = init;
    return SELF.fetch(`https://x${path}`, {
        ...rest,
        headers: { 'content-type': 'application/json', ...(c ? { Cookie: c } : {}), ...(rest.headers ?? {}) },
    });
};

const list = async (cookie: string) =>
    (await (await req('/api/admin/variables', { cookie })).json()) as {
        variables: Array<{ key: string; value: string }>;
    };

describe('kho variables', () => {
    it('GET trả danh sách sắp theo key', async () => {
        await seedVariable('zeta', '1');
        await seedVariable('alpha', '2');

        const { variables } = await list(cookie);
        expect(variables.map((v) => v.key)).toEqual(['alpha', 'zeta']);
    });

    it('PUT tạo mới rồi PUT lại là cập nhật (upsert), không đẻ dòng thứ hai', async () => {
        const key = 'secretary telegram chat id';

        expect((await req(`/api/admin/variables/${encodeURIComponent(key)}`, {
            method: 'PUT', cookie, body: JSON.stringify({ value: '-100111' }),
        })).status).toBe(200);

        await req(`/api/admin/variables/${encodeURIComponent(key)}`, {
            method: 'PUT', cookie, body: JSON.stringify({ value: '-100222' }),
        });

        const { variables } = await list(cookie);
        expect(variables).toHaveLength(1);
        expect(variables[0]).toMatchObject({ key, value: '-100222' });
    });

    it('PUT cho phép value rỗng nhưng từ chối value không phải chuỗi', async () => {
        expect((await req('/api/admin/variables/k', {
            method: 'PUT', cookie, body: JSON.stringify({ value: '' }),
        })).status).toBe(200);

        const bad = await req('/api/admin/variables/k', {
            method: 'PUT', cookie, body: JSON.stringify({ value: 123 }),
        });
        expect(bad.status).toBe(400);
        expect(((await bad.json()) as { field: string }).field).toBe('value');
    });

    it('DELETE xoá đúng dòng', async () => {
        await seedVariable('a', '1');
        await seedVariable('b', '2');

        expect((await req(`/api/admin/variables/a`, { method: 'DELETE', cookie })).status).toBe(200);
        const { variables } = await list(cookie);
        expect(variables.map((v) => v.key)).toEqual(['b']);
    });

    it('import merge: ghi đè key trùng, GIỮ key không có trong file', async () => {
        await seedVariable('keep', 'cũ');
        await seedVariable('over', 'cũ');

        const res = await req('/api/admin/variables/import', {
            method: 'POST', cookie,
            body: JSON.stringify({ mode: 'merge', variables: { over: 'mới', add: 'thêm' } }),
        });
        expect(res.status).toBe(200);

        const { variables } = await list(cookie);
        expect(Object.fromEntries(variables.map((v) => [v.key, v.value]))).toEqual({
            keep: 'cũ', // ← dòng canh: merge KHÔNG được xoá key ngoài file
            over: 'mới',
            add: 'thêm',
        });
    });

    it('import replace: xoá sạch bảng rồi nạp lại đúng nội dung file', async () => {
        await seedVariable('gone', 'sẽ mất');
        await seedVariable('over', 'cũ');

        const res = await req('/api/admin/variables/import', {
            method: 'POST', cookie,
            body: JSON.stringify({ mode: 'replace', variables: { over: 'mới', add: 'thêm' } }),
        });
        expect(res.status).toBe(200);

        const { variables } = await list(cookie);
        expect(Object.fromEntries(variables.map((v) => [v.key, v.value]))).toEqual({
            over: 'mới',
            add: 'thêm',
        });
        // ← dòng canh: 'gone' phải biến mất. Bỏ nhánh db.delete trong 'replace' là test này đỏ.
        expect(variables.some((v) => v.key === 'gone')).toBe(false);
    });

    it('import mode lạ → 400', async () => {
        const res = await req('/api/admin/variables/import', {
            method: 'POST', cookie, body: JSON.stringify({ mode: 'wipe', variables: {} }),
        });
        expect(res.status).toBe(400);
        expect(((await res.json()) as { field: string }).field).toBe('mode');
    });

    it('import variables không phải object → 400', async () => {
        const res = await req('/api/admin/variables/import', {
            method: 'POST', cookie, body: JSON.stringify({ mode: 'merge', variables: ['a', 'b'] }),
        });
        expect(res.status).toBe(400);
    });

    it('import chặn value không phải chuỗi trước khi ghi bất cứ dòng nào', async () => {
        await seedVariable('untouched', 'nguyên');

        const res = await req('/api/admin/variables/import', {
            method: 'POST', cookie,
            body: JSON.stringify({ mode: 'replace', variables: { ok: 'x', bad: 42 } }),
        });
        expect(res.status).toBe(400);

        // replace đã bị chặn TRƯỚC khi xoá — dòng cũ còn nguyên.
        const { variables } = await list(cookie);
        expect(variables.some((v) => v.key === 'untouched')).toBe(true);
    });
});

describe('countdown-config', () => {
    it('mặc định (chưa có dòng) → cả hai key là null', async () => {
        const cfg = (await (await req('/api/admin/countdown-config', { cookie })).json()) as {
            chatIdKey: string | null; topicIdKey: string | null;
        };
        expect(cfg).toEqual({ chatIdKey: null, topicIdKey: null });
    });

    it('PUT đặt mapping, GET đọc lại đúng; PUT lần hai ghi đè', async () => {

        await req('/api/admin/countdown-config', {
            method: 'PUT', cookie,
            body: JSON.stringify({ chatIdKey: 'secretary telegram chat id', topicIdKey: 'secretary daily topic id' }),
        });
        let cfg = (await (await req('/api/admin/countdown-config', { cookie })).json()) as Record<string, unknown>;
        expect(cfg).toEqual({ chatIdKey: 'secretary telegram chat id', topicIdKey: 'secretary daily topic id' });

        await req('/api/admin/countdown-config', {
            method: 'PUT', cookie,
            body: JSON.stringify({ chatIdKey: 'secretary telegram chat id', topicIdKey: null }),
        });
        cfg = (await (await req('/api/admin/countdown-config', { cookie })).json()) as Record<string, unknown>;
        expect(cfg).toEqual({ chatIdKey: 'secretary telegram chat id', topicIdKey: null });
    });
});
