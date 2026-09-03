import { computeCountdown, progressBar, formatVN } from '../lib/dates';

export interface EventRow {
    event: string;
    description: string | null;
    startDate: string;
    endDate: string;
}

/**
 * Escape cho parse_mode=MarkdownV2.
 *
 * Telegram trả 400 chứ không im lặng bỏ qua, nên một dấu chấm chưa escape trong tên sự
 * kiện là đủ làm hỏng cả tin nhắn. Danh sách ký tự dưới đây là bản đầy đủ theo tài liệu
 * Bot API — thiếu một ký tự nào cũng thành lỗi lúc chạy thật, không phải lúc build.
 */
export function escapeMd(text: string): string {
    return text.replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, (ch) => `\\${ch}`);
}

/**
 * Gộp mọi event active thành MỘT tin nhắn. Trả null khi không có gì để báo — chỗ gọi
 * dựa vào đó để không gửi tin nhắn rỗng.
 */
export function formatCountdownMessage(rows: EventRow[], today: string): string | null {
    const blocks: string[] = [];

    for (const row of rows) {
        const cd = computeCountdown(row.startDate, row.endDate, today);
        // null = dữ liệu vô lý (end trước start). Đã chặn ở tầng validate, nhưng dữ liệu
        // cũ có thể lọt — bỏ qua chứ không làm hỏng cả tin nhắn của các event khác.
        if (!cd || cd.phase !== 'active') continue;

        const lines = [
            `*${escapeMd(row.event)}*`,
            `Còn ${cd.remainingDays} ngày · đã qua ${cd.elapsedDays}/${cd.totalDays} \\(${cd.percent}%\\)`,
            // Số perDayPercent có dấu chấm thập phân → phải qua escapeMd, không thì Telegram 400.
            escapeMd(`Mỗi ngày trôi qua mất ~${cd.perDayPercent}%`),
            escapeMd(progressBar(cd.percent)),
        ];
        if (row.description) lines.push(`_${escapeMd(row.description)}_`);
        blocks.push(lines.join('\n'));
    }

    if (blocks.length === 0) return null;

    return [`⏳ *Countdown* — ${escapeMd(formatVN(today))}`, '', blocks.join('\n\n')].join('\n');
}
