import { and, eq, lte, gte, asc } from 'drizzle-orm';
import { countdownEvents, countdownConfig, variables } from '../db/schema';
import { formatCountdownMessage, type CountdownMessageParts } from '../telegram/format';
import { sendTelegram } from '../telegram/send';
import type { Db } from '../types';
import type { BotAction } from './types';

/**
 * Đích gửi (chat id / topic id) KHÔNG còn là secret của Worker: admin trỏ `countdown_config`
 * tới key nào trong bảng `variables`, rồi sửa giá trị qua UI mà không cần deploy. Đổi lại,
 * action phải tự kiểm cấu hình lúc chạy và báo lỗi cụ thể — thiếu bước này thì tin nhắn
 * âm thầm rơi vào "General" hoặc 400.
 */
type Target = { chatId: string; topicId?: string } | { error: string };

/**
 * Trả về cả `parts` (ba mảnh mẫu admin tự soạn) lẫn `target`. Tách `parts` ra ngoài
 * nhánh lỗi: mẫu và đích gửi độc lập nhau, và chỗ gọi cần `parts` để dựng nội dung
 * TRƯỚC khi quyết định "không có event nào → không gửi" hay "chưa cấu hình đích".
 */
async function resolveTarget(db: Db): Promise<{ parts: CountdownMessageParts; target: Target }> {
    const [cfg] = await db.select().from(countdownConfig).where(eq(countdownConfig.id, 1)).limit(1);
    const parts: CountdownMessageParts = {
        header: cfg?.header ?? null,
        body: cfg?.template ?? null,
        footer: cfg?.footer ?? null,
    };
    if (!cfg?.chatIdKey) {
        return { parts, target: { error: 'Chưa chọn key chứa Telegram chat id — vào màn Cấu hình để thiết lập.' } };
    }

    const rows = await db.select().from(variables);
    const byKey = new Map(rows.map((r) => [r.key, r.value]));

    const chatId = byKey.get(cfg.chatIdKey)?.trim();
    if (!chatId) {
        return { parts, target: { error: `Key "${cfg.chatIdKey}" chưa có giá trị (màn Variables).` } };
    }

    // topicIdKey là tuỳ chọn. Có trỏ key nhưng key rỗng/không tồn tại → gửi vào "General"
    // thay vì chặn: nhóm không bật Topics là trường hợp hợp lệ.
    const topicId = cfg.topicIdKey ? byKey.get(cfg.topicIdKey)?.trim() || undefined : undefined;
    return { parts, target: { chatId, topicId } };
}

export const countdownNotify: BotAction = {
    id: 'countdown.notify',
    label: 'Gửi thông báo countdown',
    description:
        'Quét mọi sự kiện đang chạy hôm nay, tính số ngày đã qua và còn lại, ' +
        'gộp thành một tin nhắn rồi gửi vào Telegram.',
    fields: [
        {
            name: 'dryRun',
            label: 'Chạy thử (không gửi Telegram)',
            type: 'boolean',
            required: false,
            default: false,
            help: 'Bật để xem trước nội dung tin nhắn mà không gửi đi.',
        },
    ],

    async run(ctx, payload) {
        const dryRun = payload.dryRun === true;

        // Lọc ngay trong SQL được là nhờ ngày lưu dạng 'YYYY-MM-DD': so sánh từ điển
        // trùng khớp với so sánh thời gian. Nếu lưu epoch thì phải kéo hết về JS mà lọc.
        const rows = await ctx.db
            .select({
                event: countdownEvents.event,
                description: countdownEvents.description,
                startDate: countdownEvents.startDate,
                endDate: countdownEvents.endDate,
            })
            .from(countdownEvents)
            .where(
                and(
                    eq(countdownEvents.enabled, true),
                    lte(countdownEvents.startDate, ctx.today),
                    gte(countdownEvents.endDate, ctx.today),
                ),
            )
            .orderBy(asc(countdownEvents.endDate));

        // Đọc mẫu + đích gửi một lượt. Cần `parts` ngay để dựng nội dung đúng định dạng
        // admin chọn; `target` để lát nữa kiểm cấu hình.
        const { parts, target } = await resolveTarget(ctx.db);
        const message = formatCountdownMessage(rows, ctx.today, parts);

        // Ngày trống thì im lặng. Bot ấn nút mỗi ngày không nên đẻ ra tin nhắn rác.
        if (!message) {
            return { ok: true, summary: 'Không có sự kiện nào đang chạy hôm nay — không gửi gì.', data: { sent: false, reason: 'no_active_events', count: 0 } };
        }

        // Kiểm đích gửi TRƯỚC cả dryRun: "chạy thử" là để xem sẽ gửi gì VÀ gửi đi đâu,
        // nên cấu hình hỏng phải lộ ra ở đây chứ không đợi tới lần gửi thật.
        if ('error' in target) {
            return { ok: false, summary: target.error, data: { sent: false, reason: 'not_configured', error: target.error } };
        }

        if (dryRun) {
            return {
                ok: true,
                summary: `[CHẠY THỬ] ${rows.length} sự kiện → chat ${target.chatId}${target.topicId ? ` / topic ${target.topicId}` : ''}. Nội dung sẽ gửi:\n\n${message}`,
                data: { sent: false, reason: 'dry_run', count: rows.length, message, chatId: target.chatId, topicId: target.topicId },
            };
        }

        const result = await sendTelegram(
            ctx.env.TELEGRAM_BOT_TOKEN,
            target.chatId,
            message,
            target.topicId,
        );
        if (!result.ok) {
            return { ok: false, summary: `Gửi Telegram thất bại: ${result.error}`, data: { sent: false, error: result.error } };
        }

        return {
            ok: true,
            summary: `Đã gửi Telegram ${rows.length} sự kiện.`,
            data: { sent: true, count: rows.length, message },
        };
    },
};
