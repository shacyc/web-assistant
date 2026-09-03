import { executionLogs } from '../db/schema';
import { today } from '../lib/dates';
import type { Bindings, Db } from '../types';
import { getAction } from './registry';

export interface RunOutcome {
    ok: boolean;
    /** Text ngắn cho người/bot đọc. Khi lỗi thì là câu giải thích lỗi. */
    summary: string;
}

/**
 * Chạy một action theo id VÀ ghi execution_logs. Dùng chung cho hai đường không-phải-bot:
 * handler `scheduled` (cron) và nút "Chạy ngay" ở màn Lịch.
 *
 * KHÔNG dùng cho /api/bot/actions/:id/run — đường đó có xử lý lỗi + rate limit riêng, và
 * gộp lại chỉ để tiết kiệm vài dòng thì lại buộc hai đường tiến hoá cùng nhau.
 *
 * `source` đứng đầu `detail` để đọc log biết được ai gọi: '[cron]' hay '[chạy tay]'.
 * Lỗi ghi log bị nuốt: một tin nhắn đã gửi đi rồi không được biến thành thất bại chỉ vì
 * insert hỏng.
 */
export async function runActionById(
    db: Db,
    env: Bindings,
    actionId: string,
    payload: Record<string, unknown>,
    source: string,
): Promise<RunOutcome> {
    const action = getAction(actionId);
    if (!action) {
        const summary = `Không có action '${actionId}' trong registry`;
        await writeLog(db, actionId, 'error', `${source} ${summary}`);
        return { ok: false, summary };
    }

    try {
        const result = await action.run({ db, env, today: today(env.TIMEZONE) }, payload);
        await writeLog(db, actionId, result.ok ? 'ok' : 'error', `${source} ${result.summary}`);
        return { ok: result.ok, summary: result.summary };
    } catch (err) {
        const summary = err instanceof Error ? err.message : 'Lỗi không rõ';
        await writeLog(db, actionId, 'error', `${source} ${summary}`);
        return { ok: false, summary };
    }
}

async function writeLog(db: Db, actionId: string, status: string, detail: string): Promise<void> {
    await db
        .insert(executionLogs)
        .values({ id: crypto.randomUUID(), actionId, status, detail: detail.slice(0, 1000) })
        .catch((e) => console.error('[runActionById] log.insert', e));
}
