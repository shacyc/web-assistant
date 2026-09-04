import { eq } from 'drizzle-orm';
import { healthcheckTargets, healthcheckConfig, variables } from '../db/schema';
import { formatHealthcheckMessage, type StateChange } from '../telegram/healthcheckFormat';
import { sendTelegram } from '../telegram/send';
import { formatVNDateTime } from '../lib/dates';
import { TIMEOUT_MS, BODY_MAX, evaluateTarget, probeDetail, type Probe } from '../lib/healthcheck';
import type { Db } from '../types';
import type { BotAction } from './types';

type Target = { chatId: string; topicId?: string } | { error: string };

/** Đọc `healthcheck_config` + `variables` → đích gửi. Bản sao `resolveTarget` của
 *  `countdownNotify.ts`: mẫu và đích gửi độc lập nhau nên trả cả hai, chỗ gọi cần
 *  `template` để dựng nội dung trước khi quyết định có gửi hay không. */
async function resolveHealthTarget(db: Db): Promise<{ template: string | null; target: Target }> {
    const [cfg] = await db.select().from(healthcheckConfig).where(eq(healthcheckConfig.id, 1)).limit(1);
    const template = cfg?.template ?? null;
    if (!cfg?.chatIdKey) {
        return { template, target: { error: 'Chưa chọn key chứa Telegram chat id — vào màn Cấu hình để thiết lập.' } };
    }
    const rows = await db.select().from(variables);
    const byKey = new Map(rows.map((r) => [r.key, r.value]));
    const chatId = byKey.get(cfg.chatIdKey)?.trim();
    if (!chatId) {
        return { template, target: { error: `Key "${cfg.chatIdKey}" chưa có giá trị (màn Variables).` } };
    }
    // topicIdKey tuỳ chọn: trỏ key rỗng/không tồn tại → gửi vào "General" thay vì chặn.
    const topicId = cfg.topicIdKey ? byKey.get(cfg.topicIdKey)?.trim() || undefined : undefined;
    return { template, target: { chatId, topicId } };
}

/**
 * Gọi thử một URL. Không bao giờ ném — lỗi mạng / timeout trả về dạng `Probe` có
 * `error` để nhánh quyết định xử lý đồng nhất. `AbortController` cắt ở 10s; chỉ đọc
 * body khi target có `checkScript` (đọc + escape body mới tốn CPU).
 */
async function probe(target: { url: string; label: string; checkScript: string | null }): Promise<Probe> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const t0 = Date.now();
    try {
        const res = await fetch(target.url, { method: 'GET', redirect: 'follow', signal: controller.signal });
        const body = target.checkScript && target.checkScript.trim() ? (await res.text()).slice(0, BODY_MAX) : '';
        return {
            url: target.url,
            label: target.label,
            ok: res.ok,
            status: res.status,
            statusText: res.statusText,
            body,
            durationMs: Date.now() - t0,
            error: null,
        };
    } catch (err) {
        const aborted = err instanceof Error && err.name === 'AbortError';
        return {
            url: target.url,
            label: target.label,
            ok: false,
            status: null,
            statusText: '',
            body: '',
            durationMs: Date.now() - t0,
            error: aborted
                ? `timeout sau ${TIMEOUT_MS / 1000}s`
                : `lỗi mạng: ${err instanceof Error ? err.message : String(err)}`,
        };
    } finally {
        clearTimeout(timer);
    }
}

export const healthcheckRun: BotAction = {
    id: 'healthcheck.run',
    label: 'Kiểm tra health-check',
    description:
        'Gọi thử mọi website đang bật, so trạng thái với lần trước. ' +
        'Chỉ gửi Telegram khi trạng thái đổi (site sập hoặc phục hồi).',
    fields: [
        {
            name: 'dryRun',
            label: 'Chạy thử (không gửi, không lưu trạng thái)',
            type: 'boolean',
            required: false,
            default: false,
            help: 'Bật để xem kết quả kiểm từng site mà không gửi Telegram và không đụng trạng thái đã lưu.',
        },
    ],

    async run(ctx, payload) {
        const dryRun = payload.dryRun === true;
        const now = new Date();
        const checkedAt = formatVNDateTime(ctx.env.TIMEZONE, now);

        const targets = await ctx.db
            .select()
            .from(healthcheckTargets)
            .where(eq(healthcheckTargets.enabled, true));
        if (targets.length === 0) {
            return { ok: true, summary: 'Không có site nào đang bật.', data: { checked: 0, changes: 0, sent: 0 } };
        }

        // Song song: tổng wall-time ≈ fetch chậm nhất, không phải tổng các fetch.
        const probes = await Promise.all(targets.map((t) => probe(t)));

        const evald = targets.map((t, i) => {
            const p = probes[i];
            const { state, scriptError } = evaluateTarget(t, p);
            const prev = t.lastState ?? 'up';
            return {
                t,
                p,
                state,
                scriptError,
                prev,
                // null tính là "đổi" — nhưng chỉ `notify` (so với 'up' mặc định) mới gửi.
                rawChanged: state !== t.lastState,
                notify: state !== prev,
            };
        });

        const changes = evald.filter((e) => e.notify);
        const { template, target } = await resolveHealthTarget(ctx.db);

        if (dryRun) {
            const lines = evald.map(
                (e) =>
                    `${e.t.label}: ${e.prev} → ${e.state}${e.notify ? ' (sẽ báo)' : ''} · ${probeDetail(e.p)}` +
                    (e.scriptError ? ` · ${e.scriptError}` : ''),
            );
            const warn =
                changes.length > 0 && 'error' in target ? `\n\n⚠ ${target.error}` : '';
            return {
                ok: true,
                summary:
                    `[CHẠY THỬ] Đã kiểm ${targets.length} site, ${changes.length} đổi trạng thái. Không gửi, không lưu.` +
                    `\n\n${lines.join('\n')}${warn}`,
                data: { checked: targets.length, changes: changes.length, sent: 0, dryRun: true, results: lines },
            };
        }

        // last_checked_at + last_detail cho MỌI target đã kiểm (kể cả không đổi).
        for (const e of evald) {
            await ctx.db
                .update(healthcheckTargets)
                .set({ lastCheckedAt: now, lastDetail: probeDetail(e.p).slice(0, 500), updatedAt: now })
                .where(eq(healthcheckTargets.id, e.t.id));
        }

        // rawChanged nhưng không notify (điển hình: null → 'up' lần check đầu): chốt
        // state luôn, khỏi gửi gì.
        for (const e of evald.filter((x) => x.rawChanged && !x.notify)) {
            await ctx.db
                .update(healthcheckTargets)
                .set({ lastState: e.state, lastStateAt: now, updatedAt: now })
                .where(eq(healthcheckTargets.id, e.t.id));
        }

        if (changes.length === 0) {
            return {
                ok: true,
                summary: `Đã kiểm ${targets.length} site, không có gì đổi.`,
                data: { checked: targets.length, changes: 0, sent: 0 },
            };
        }

        // Có thay đổi cần báo nhưng chưa cấu hình đích: KHÔNG chốt last_state — lần cron
        // sau vẫn tính là "đổi" và thử gửi lại. Giống countdown.
        if ('error' in target) {
            return {
                ok: false,
                summary: target.error,
                data: {
                    checked: targets.length,
                    changes: changes.length,
                    sent: 0,
                    reason: 'not_configured',
                    error: target.error,
                },
            };
        }

        let sent = 0;
        const errors: string[] = [];
        for (const e of changes) {
            const change: StateChange = {
                label: e.t.label,
                url: e.t.url,
                from: e.prev,
                to: e.state,
                probe: e.p,
                checkedAt,
            };
            const message = formatHealthcheckMessage(change, template);
            const result = await sendTelegram(ctx.env.TELEGRAM_BOT_TOKEN, target.chatId, message, target.topicId);
            if (result.ok) {
                sent++;
                await ctx.db
                    .update(healthcheckTargets)
                    .set({ lastState: e.state, lastStateAt: now, updatedAt: now })
                    .where(eq(healthcheckTargets.id, e.t.id));
            } else {
                // Không chốt last_state → cảnh báo không mất, lần sau gửi lại.
                errors.push(`${e.t.label}: ${result.error}`);
            }
        }

        const ok = errors.length === 0;
        return {
            ok,
            summary: ok
                ? `Đã kiểm ${targets.length} site, gửi ${sent} thông báo đổi trạng thái.`
                : `Đã kiểm ${targets.length} site, gửi ${sent}/${changes.length}; lỗi: ${errors.join('; ')}`,
            data: { checked: targets.length, changes: changes.length, sent, errors },
        };
    },
};
