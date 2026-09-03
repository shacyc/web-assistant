// `SELF` là worker thật dựng từ wrangler.jsonc, không phải app import trực tiếp — nên
// test đi qua đúng middleware và binding như production.
import { SELF, env as rawEnv, applyD1Migrations, type D1Migration } from 'cloudflare:test';
import { beforeAll, beforeEach } from 'vitest';
import type { Bindings } from '../src/types';

// Từ pool 0.22, `env` có kiểu `Cloudflare.Env` (rỗng nếu không sinh
// `worker-configuration.d.ts`). Ta KHÔNG sinh file đó: nó phụ thuộc `.dev.vars` của
// từng máy — máy chưa có `.dev.vars` sẽ sinh ra Env thiếu secret và typecheck đỏ vì lý
// do chẳng liên quan gì tới code. Thay vào đó ép về `Bindings` viết tay trong
// src/types.ts, vốn đã là nguồn sự thật cho toàn bộ backend.
export const env = rawEnv as unknown as Bindings & { TEST_MIGRATIONS: D1Migration[] };

beforeAll(async () => {
    await applyD1Migrations(env.assistant_db, env.TEST_MIGRATIONS);
});

// Mỗi test bắt đầu từ bảng rỗng — test nào dựa vào dữ liệu của test trước là test giả.
beforeEach(async () => {
    await env.assistant_db.exec('DELETE FROM countdown_events');
    await env.assistant_db.exec('DELETE FROM execution_logs');
});

export { SELF };

export async function botToken(): Promise<string> {
    const res = await SELF.fetch('https://x/api/bot/session', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ secret: env.BOT_SECRET }),
    });
    const { token } = (await res.json()) as { token: string };
    return token;
}

export async function adminCookie(): Promise<string> {
    const res = await SELF.fetch('https://x/api/admin/session', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password: env.ADMIN_PASSWORD }),
    });
    return (res.headers.get('set-cookie') ?? '').split(';')[0];
}

export interface TelegramCall {
    chat_id: string;
    text: string;
    parse_mode: string;
    message_thread_id?: number;
}

export interface TelegramMock {
    /** Mọi lần worker gọi sendMessage, theo thứ tự. */
    readonly calls: TelegramCall[];
    /** Ép lần gọi tiếp theo trả lỗi, để kiểm đường thất bại. */
    failNext(status: number, body: unknown): void;
    restore(): void;
}

/**
 * Chặn request ra ngoài bằng cách thay `globalThis.fetch`.
 *
 * Pool 0.22 đã BỎ `fetchMock` (undici MockAgent) khỏi `cloudflare:test`, nên không còn
 * `disableNetConnect()` nữa. Hàm này dựng lại đúng tính chất quan trọng nhất của nó:
 * **mọi URL không phải Telegram đều ném lỗi**. Nhờ vậy "dryRun không gửi Telegram" là
 * thứ được canh thật — code lỡ gọi thì test đỏ, chứ không phải chỉ sai một biến đếm.
 *
 * Chạy được vì `SELF` dispatch vào worker trong CÙNG isolate với test, nên `fetch` trần
 * trong code worker phân giải đúng `globalThis.fetch` đã bị thay ở đây.
 */
export function mockTelegram(): TelegramMock {
    const original = globalThis.fetch;
    const calls: TelegramCall[] = [];
    let failure: { status: number; body: unknown } | null = null;

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input instanceof Request ? input.url : input);
        if (!url.startsWith(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`)) {
            throw new Error(`Request ra ngoài ngoài dự kiến trong test: ${url}`);
        }
        calls.push(JSON.parse(String(init?.body ?? (input as Request).body)) as TelegramCall);
        const f = failure;
        failure = null;
        return new Response(JSON.stringify(f ? f.body : { ok: true }), {
            status: f ? f.status : 200,
            headers: { 'content-type': 'application/json' },
        });
    }) as typeof fetch;

    return {
        calls,
        failNext: (status, body) => {
            failure = { status, body };
        },
        restore: () => {
            globalThis.fetch = original;
        },
    };
}

export interface SeedOverrides {
    event?: string;
    description?: string | null;
    startDate?: string;
    endDate?: string;
    enabled?: number;
}

export async function seedEvent(over: SeedOverrides = {}) {
    const row = {
        id: crypto.randomUUID(),
        event: 'Sự kiện',
        description: null as string | null,
        startDate: '2026-09-01',
        endDate: '2026-10-01',
        enabled: 1,
        ...over,
    };
    await env.assistant_db
        .prepare('INSERT INTO countdown_events (id, event, description, start_date, end_date, enabled) VALUES (?, ?, ?, ?, ?, ?)')
        .bind(row.id, row.event, row.description, row.startDate, row.endDate, row.enabled)
        .run();
    return row;
}
