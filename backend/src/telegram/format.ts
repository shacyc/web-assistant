import { computeCountdown, progressBar, formatVN, type Countdown } from '../lib/dates';

export interface EventRow {
    event: string;
    description: string | null;
    startDate: string;
    endDate: string;
}

/**
 * Ba mảnh mẫu admin tự soạn trong `countdown_config`. Mảnh nào rỗng/null thì KHÔNG ghép
 * vào tin nhắn. Cả ba cùng rỗng = giữ nguyên định dạng mặc định (có dòng "⏳ Countdown").
 */
export interface CountdownMessageParts {
    header?: string | null; // ghép một lần ở đầu; tham số: {today} {count}
    body?: string | null; // mỗi sự kiện đang chạy render một lần
    footer?: string | null; // ghép một lần ở cuối; tham số: {today} {count}
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

/** Làm tròn về tối đa 2 số lẻ. `4.2900` → `4.29`, `5.0` → `5`. */
function round2(n: number): number {
    return Math.round(n * 100) / 100;
}

/**
 * Tham số dùng được trong mẫu NỘI DUNG (`body`) — render một lần cho mỗi sự kiện đang
 * chạy. Chữ trong mẫu là markup của admin, admin TỰ escape; chỉ các giá trị dưới đây
 * được `escapeMd` tự động (số có dấu chấm, tên sự kiện có `#`…).
 *
 * | `{eventName}`         | tên sự kiện                                  |
 * | `{startDate}`         | ngày bắt đầu, dd/MM/yyyy                     |
 * | `{endDate}`           | ngày kết thúc, dd/MM/yyyy                    |
 * | `{totalDays}`         | tổng số ngày của chặng (số nguyên)          |
 * | `{totalWeeks}`        | tổng số tuần của chặng, 2 số lẻ             |
 * | `{passedDays}`        | số ngày đã qua (số nguyên)                   |
 * | `{passedWeeks}`       | số tuần đã qua, 2 số lẻ                     |
 * | `{remainDays}`        | số ngày còn lại (số nguyên)                  |
 * | `{remainWeeks}`       | số tuần còn lại, 2 số lẻ                     |
 * | `{remainDaysPercent}` | phần trăm chặng còn lại, 2 số lẻ            |
 * | `{remainWeeksPercent}`| như trên (tuần rút gọn cho cùng tỉ lệ)      |
 * | `{dailyPercent}`      | mỗi ngày trôi qua mất bao nhiêu %, 2 số lẻ  |
 * | `{progress}`          | thanh tiến độ bằng ký tự khối               |
 * | `{today}`             | hôm nay, dd/MM/yyyy                          |
 */
function bodyVars(row: EventRow, cd: Countdown, today: string): Record<string, string> {
    // "Phần trăm còn lại" theo ngày và theo tuần là cùng một tỉ lệ (chia 7 triệt tiêu),
    // nên hai key trỏ về cùng giá trị — giữ cả hai vì admin có thể quen gọi tên nào.
    const remainPercent = cd.totalDays === 0 ? 0 : round2((cd.remainingDays / cd.totalDays) * 100);
    return {
        eventName: row.event,
        startDate: formatVN(row.startDate),
        endDate: formatVN(row.endDate),
        totalDays: String(cd.totalDays),
        totalWeeks: String(round2(cd.totalDays / 7)),
        passedDays: String(cd.elapsedDays),
        passedWeeks: String(round2(cd.elapsedDays / 7)),
        remainDays: String(cd.remainingDays),
        remainWeeks: String(round2(cd.remainingDays / 7)),
        remainDaysPercent: String(remainPercent),
        remainWeeksPercent: String(remainPercent),
        dailyPercent: String(cd.perDayPercent),
        progress: progressBar(cd.percent),
        today: formatVN(today),
    };
}

/** Tham số dùng được trong mẫu `header` / `footer` — chỉ có thông tin toàn cục. */
function onceVars(today: string, count: number): Record<string, string> {
    return { today: formatVN(today), count: String(count) };
}

/**
 * Thay `{key}` bằng giá trị đã escape. Key lạ giữ nguyên `{key}` thay vì ném lỗi lúc gửi —
 * admin gõ sai tên tham số chỉ thấy chữ `{typo}` trong tin nhắn, không mất cả thông báo.
 */
function fillTemplate(tpl: string, vars: Record<string, string>): string {
    return tpl.replace(/\{(\w+)\}/g, (whole, key: string) =>
        key in vars ? escapeMd(vars[key]) : whole,
    );
}

function defaultBlock(row: EventRow, cd: Countdown): string {
    const lines = [
        `*${escapeMd(row.event)}*`,
        // `percent` giờ có 2 số lẻ → có dấu chấm → phải escape, không thì Telegram 400.
        // Các số còn lại là nguyên nên để thẳng; chỉ dấu ngoặc là markup, escape sẵn.
        `Còn ${cd.remainingDays} ngày · đã qua ${cd.elapsedDays}/${cd.totalDays} \\(${escapeMd(String(cd.percent))}%\\)`,
        // Số perDayPercent có dấu chấm thập phân → phải qua escapeMd, không thì Telegram 400.
        escapeMd(`Mỗi ngày trôi qua mất ~${cd.perDayPercent}%`),
        escapeMd(progressBar(cd.percent)),
    ];
    if (row.description) lines.push(`_${escapeMd(row.description)}_`);
    return lines.join('\n');
}

/**
 * Gộp mọi event active thành MỘT tin nhắn. Trả null khi không có gì để báo — chỗ gọi
 * dựa vào đó để không gửi tin nhắn rỗng.
 *
 * `parts.body` (nếu có) thay phần thân của MỖI event; `parts.header` / `parts.footer`
 * ghép một lần ở đầu/cuối, mảnh nào rỗng thì bỏ. KHÔNG cấu hình mảnh nào = giữ nguyên
 * định dạng mặc định (kèm dòng "⏳ Countdown — <ngày>"). Có ít nhất một mảnh = admin nắm
 * toàn quyền, dòng "⏳" mặc định biến mất (muốn thì đặt vào `header`).
 */
export function formatCountdownMessage(
    rows: EventRow[],
    today: string,
    parts: CountdownMessageParts = {},
): string | null {
    const header = parts.header?.trim() || null;
    const body = parts.body?.trim() || null;
    const footer = parts.footer?.trim() || null;
    const custom = header || body || footer;

    const blocks: string[] = [];
    for (const row of rows) {
        const cd = computeCountdown(row.startDate, row.endDate, today);
        // null = dữ liệu vô lý (end trước start). Đã chặn ở tầng validate, nhưng dữ liệu
        // cũ có thể lọt — bỏ qua chứ không làm hỏng cả tin nhắn của các event khác.
        if (!cd || cd.phase !== 'active') continue;
        blocks.push(body ? fillTemplate(body, bodyVars(row, cd, today)) : defaultBlock(row, cd));
    }

    if (blocks.length === 0) return null;

    if (!custom) {
        return [`⏳ *Countdown* — ${escapeMd(formatVN(today))}`, '', blocks.join('\n\n')].join('\n');
    }

    const once = onceVars(today, blocks.length);
    const out: string[] = [];
    if (header) out.push(fillTemplate(header, once));
    out.push(blocks.join('\n\n'));
    if (footer) out.push(fillTemplate(footer, once));
    return out.join('\n\n');
}
