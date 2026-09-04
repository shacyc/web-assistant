/**
 * Matcher biểu thức cron 5 trường — viết tay, không dependency (cùng lý do với
 * `validate.ts`: trần 10ms CPU của Workers Free, và một parser cron đủ dùng chỉ ~70 dòng).
 *
 * Mỗi trường hỗ trợ: `*`, `n`, `a-b`, `*​/k`, `a-b/k`, và danh sách ngăn bởi dấu phẩy.
 * Thứ trong tuần: `0` và `7` đều là Chủ Nhật. KHÔNG hỗ trợ tên (JAN, MON) hay ký hiệu
 * mở rộng `L` `W` `#` `?` — cron Vixie tối giản.
 *
 * Ngữ nghĩa ngày: nếu CẢ trường ngày-trong-tháng lẫn ngày-trong-tuần đều bị giới hạn
 * (khác `*`), khớp MỘT trong hai là đủ — giống Vixie/cron của Linux.
 *
 * Lưu ý dùng: trigger thật của Cloudflare bắn mỗi 5 phút, nên chỉ những mốc phút rơi
 * đúng nhịp (0,5,10,…) mới khớp được. `31 * * * *` sẽ không bao giờ chạy.
 */

import type { ZonedParts } from './dates';

export interface CronExpr {
    minute: Set<number>;
    hour: Set<number>;
    dom: Set<number>;
    month: Set<number>;
    dow: Set<number>; // 0..6, 0 = Chủ Nhật
    domRestricted: boolean;
    dowRestricted: boolean;
}

function parseField(raw: string, lo: number, hi: number): Set<number> | null {
    const out = new Set<number>();
    for (const part of raw.split(',')) {
        if (!part) return null;

        let range = part;
        let step = 1;
        const slash = part.indexOf('/');
        if (slash !== -1) {
            range = part.slice(0, slash);
            step = Number(part.slice(slash + 1));
            if (!Number.isInteger(step) || step < 1) return null;
        }

        let start: number;
        let end: number;
        if (range === '*') {
            start = lo;
            end = hi;
        } else {
            const seg = range.split('-');
            if (seg.length === 1) {
                start = end = Number(seg[0]);
            } else if (seg.length === 2) {
                start = Number(seg[0]);
                end = Number(seg[1]);
            } else {
                return null;
            }
            if (!Number.isInteger(start) || !Number.isInteger(end)) return null;
        }
        if (start < lo || end > hi || start > end) return null;
        for (let v = start; v <= end; v += step) out.add(v);
    }
    return out.size ? out : null;
}

/** Chuỗi cron → cấu trúc đã phân tích, hoặc `null` nếu sai cú pháp / ra ngoài khoảng. */
export function parseCron(expr: string): CronExpr | null {
    const f = expr.trim().split(/\s+/);
    if (f.length !== 5) return null;

    const minute = parseField(f[0], 0, 59);
    const hour = parseField(f[1], 0, 23);
    const dom = parseField(f[2], 1, 31);
    const month = parseField(f[3], 1, 12);
    let dow = parseField(f[4], 0, 7);
    if (!minute || !hour || !dom || !month || !dow) return null;

    // 7 = Chủ Nhật → gộp về 0 cho khớp với `Date.getUTCDay()`.
    if (dow.has(7)) {
        dow = new Set(dow);
        dow.delete(7);
        dow.add(0);
    }

    return {
        minute,
        hour,
        dom,
        month,
        dow,
        domRestricted: f[2] !== '*',
        dowRestricted: f[4] !== '*',
    };
}

/** `parts` (giờ địa phương) có khớp biểu thức không? */
export function cronMatches(e: CronExpr, parts: ZonedParts): boolean {
    if (!e.minute.has(parts.minute) || !e.hour.has(parts.hour) || !e.month.has(parts.month)) {
        return false;
    }
    const domOk = e.dom.has(parts.dom);
    const dowOk = e.dow.has(parts.dow);
    return e.domRestricted && e.dowRestricted ? domOk || dowOk : domOk && dowOk;
}
