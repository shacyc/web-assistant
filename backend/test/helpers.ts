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
// Kể cả các dòng do migration 0001 seed: test nào cần chúng thì tự seedVariable().
beforeEach(async () => {
    await env.assistant_db.exec('DELETE FROM countdown_events');
    await env.assistant_db.exec('DELETE FROM execution_logs');
    await env.assistant_db.exec('DELETE FROM variables');
    await env.assistant_db.exec('DELETE FROM countdown_config');
    await env.assistant_db.exec('DELETE FROM schedules');
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

/** Đặt một dòng vào kho key-value. Ghi đè nếu key đã có. */
export async function seedVariable(key: string, value: string) {
    await env.assistant_db
        .prepare('INSERT INTO variables (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
        .bind(key, value)
        .run();
}

/**
 * Trỏ countdown_config tới các key cho trước VÀ seed luôn giá trị của chúng. Mặc định
 * dựng một cấu hình chạy được để test countdown.notify không phải lặp lại 4 dòng seed.
 */
export async function seedCountdownConfig(
    over: {
        chatIdKey?: string;
        chatId?: string;
        topicIdKey?: string | null;
        topicId?: string;
        header?: string | null;
        template?: string | null;
        footer?: string | null;
    } = {},
) {
    const chatIdKey = over.chatIdKey ?? 'secretary telegram chat id';
    const topicIdKey = over.topicIdKey === undefined ? 'secretary daily topic id' : over.topicIdKey;
    const header = over.header ?? null;
    const template = over.template ?? null;
    const footer = over.footer ?? null;
    if (over.chatId !== undefined) await seedVariable(chatIdKey, over.chatId);
    if (topicIdKey && over.topicId !== undefined) await seedVariable(topicIdKey, over.topicId);
    await env.assistant_db
        .prepare(
            'INSERT INTO countdown_config (id, chat_id_key, topic_id_key, header, template, footer) VALUES (1, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET chat_id_key = excluded.chat_id_key, topic_id_key = excluded.topic_id_key, header = excluded.header, template = excluded.template, footer = excluded.footer',
        )
        .bind(chatIdKey, topicIdKey, header, template, footer)
        .run();
    return { chatIdKey, topicIdKey, header, template, footer };
}

export interface ScheduleOverrides {
    id?: string;
    actionId?: string;
    payload?: string;
    kind?: string;
    timeOfDay?: string;
    daysOfWeek?: string | null;
    dayOfMonth?: number | null;
    intervalDays?: number | null;
    anchorDate?: string | null;
    cron?: string | null;
    intervalSeconds?: number | null;
    enabled?: number;
    lastRunDate?: string | null;
    lastRunSlot?: string | null;
    lastRunAt?: Date | null;
}

export async function seedSchedule(over: ScheduleOverrides = {}) {
    const row = {
        id: over.id ?? crypto.randomUUID(),
        actionId: over.actionId ?? 'countdown.notify',
        payload: over.payload ?? '{}',
        kind: over.kind ?? 'daily',
        timeOfDay: over.timeOfDay ?? '00:00',
        daysOfWeek: over.daysOfWeek ?? null,
        dayOfMonth: over.dayOfMonth ?? null,
        intervalDays: over.intervalDays ?? null,
        anchorDate: over.anchorDate ?? null,
        cron: over.cron ?? null,
        intervalSeconds: over.intervalSeconds ?? null,
        enabled: over.enabled ?? 1,
        lastRunDate: over.lastRunDate ?? null,
        lastRunSlot: over.lastRunSlot ?? null,
        // Cột mode:'timestamp' của drizzle = giây kể từ epoch.
        lastRunAt: over.lastRunAt ? Math.floor(over.lastRunAt.getTime() / 1000) : null,
    };
    await env.assistant_db
        .prepare(
            'INSERT INTO schedules (id, action_id, payload, kind, time_of_day, days_of_week, day_of_month, interval_days, anchor_date, cron, interval_seconds, enabled, last_run_date, last_run_slot, last_run_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        )
        .bind(
            row.id,
            row.actionId,
            row.payload,
            row.kind,
            row.timeOfDay,
            row.daysOfWeek,
            row.dayOfMonth,
            row.intervalDays,
            row.anchorDate,
            row.cron,
            row.intervalSeconds,
            row.enabled,
            row.lastRunDate,
            row.lastRunSlot,
            row.lastRunAt,
        )
        .run();
    return row;
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
