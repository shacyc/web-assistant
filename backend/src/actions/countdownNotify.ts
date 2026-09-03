import { and, eq, lte, gte, asc } from 'drizzle-orm';
import { countdownEvents } from '../db/schema';
import { formatCountdownMessage } from '../telegram/format';
import { sendTelegram } from '../telegram/send';
import type { BotAction } from './types';

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

        const message = formatCountdownMessage(rows, ctx.today);

        // Ngày trống thì im lặng. Bot ấn nút mỗi ngày không nên đẻ ra tin nhắn rác.
        if (!message) {
            return { ok: true, summary: 'Không có sự kiện nào đang chạy hôm nay — không gửi gì.', data: { sent: false, reason: 'no_active_events', count: 0 } };
        }

        if (dryRun) {
            return {
                ok: true,
                summary: `[CHẠY THỬ] ${rows.length} sự kiện. Nội dung sẽ gửi:\n\n${message}`,
                data: { sent: false, reason: 'dry_run', count: rows.length, message },
            };
        }

        const result = await sendTelegram(
            ctx.env.TELEGRAM_BOT_TOKEN,
            ctx.env.TELEGRAM_CHAT_ID,
            message,
            ctx.env.TELEGRAM_TOPIC_ID,
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
