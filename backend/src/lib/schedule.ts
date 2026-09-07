/**
 * Logic thuần cho lịch chạy — tách khỏi handler `scheduled` để test được mà không cần
 * dựng cả worker. Cùng lý do với lib/dates.ts: không dependency, không đụng `Date.now()`.
 */

import { diffDays, weekdayISO, dayOfMonth, daysInMonth, type ZonedParts } from './dates';
import { parseCron, cronMatches } from './cron';

export type ScheduleKind = 'daily' | 'weekly' | 'monthly' | 'interval' | 'cron' | 'every' | 'tick';

export const SCHEDULE_KINDS: ScheduleKind[] = ['daily', 'weekly', 'monthly', 'interval', 'cron', 'every', 'tick'];

/** Chỉ những field mà việc "có chạy hay không" phụ thuộc vào. */
export interface DueRow {
    enabled: boolean;
    kind: string;
    timeOfDay: string; // 'HH:MM' — dùng cho 4 kiểu đầu, 'cron'/'every' bỏ qua
    daysOfWeek: string | null; // CSV ISO 1..7, chỉ cho 'weekly'
    dayOfMonth: number | null; // 1..31, chỉ cho 'monthly'
    intervalDays: number | null; // >= 1, chỉ cho 'interval'
    anchorDate: string | null; // 'YYYY-MM-DD', mốc đếm cho 'interval'
    cron: string | null; // biểu thức 5 trường, chỉ cho 'cron'
    intervalSeconds: number | null; // khoảng giây, chỉ cho 'every'
    lastRunDate: string | null; // chốt cho 4 kiểu đầu: mỗi ngày một lần
    lastRunSlot: string | null; // chốt cho 'cron': mỗi nhịp 5 phút một lần
    lastRunAt: Date | null; // chốt cho 'every': mốc lần chạy trước
}

/**
 * Hôm nay có phải NGÀY chạy của lịch không — chỉ cho 4 kiểu "tối đa một lần/ngày".
 * Không xét giờ, không xét `last_run_*` ở đây.
 */
export function matchesDay(row: DueRow, todayStr: string): boolean {
    switch (row.kind) {
        case 'daily':
            return true;
        case 'weekly':
            return splitInts(row.daysOfWeek).includes(weekdayISO(todayStr));
        case 'monthly':
            // Ngày 31 ở tháng chỉ có 30 ngày → chạy vào ngày cuối. `min()` gộp cả hai
            // trường hợp: ngày thường và ngày bị kẹp về cuối tháng.
            return (
                row.dayOfMonth != null &&
                dayOfMonth(todayStr) === Math.min(row.dayOfMonth, daysInMonth(todayStr))
            );
        case 'interval': {
            if (row.anchorDate == null || row.intervalDays == null || row.intervalDays < 1) return false;
            const n = diffDays(row.anchorDate, todayStr);
            return n >= 0 && n % row.intervalDays === 0;
        }
        default:
            return false;
    }
}

/**
 * Lịch có cấu trúc (daily/weekly/monthly/interval) tới lượt chạy chưa?
 *
 * - `enabled` tắt → không.
 * - đã chạy hôm nay (thành công hay lỗi) → không. Chốt "mỗi ngày một lần"; job lỗi
 *   KHÔNG tự thử lại trong ngày, đổi lấy việc không bao giờ gửi trùng.
 * - chưa tới giờ (`time_of_day` > giờ hiện tại) → không. Dùng '<=' chứ không phải cửa
 *   sổ hẹp quanh đúng phút: nhịp cron 4:30 bị bỏ lỡ thì nhịp 4:35 vẫn vớt lại.
 * - đúng ngày theo kiểu lặp → chạy.
 */
export function isDueStructured(row: DueRow, todayStr: string, nowHHMM: string): boolean {
    if (!row.enabled) return false;
    if (row.lastRunDate === todayStr) return false;
    if (row.timeOfDay > nowHHMM) return false;
    return matchesDay(row, todayStr);
}

/**
 * Lịch `cron` tới lượt chạy chưa? Chốt theo `last_run_slot` (nhịp 5 phút) thay vì theo
 * ngày, vì kiểu này có thể chạy nhiều lần trong ngày. `parts` là giờ địa phương.
 */
export function isDueCron(row: DueRow, parts: ZonedParts, slot: string): boolean {
    if (!row.enabled) return false;
    if (row.lastRunSlot === slot) return false;
    if (!row.cron) return false;
    const expr = parseCron(row.cron);
    return expr != null && cronMatches(expr, parts);
}

/**
 * Lịch `every` tới lượt chạy chưa? Đếm từ `last_run_at` (mốc nhịp lần trước, KHÔNG phải
 * lúc action chạy xong) nên khoảng đúng bằng bội số nhịp 5 phút không bị trôi.
 * `last_run_at` null = chưa chạy bao giờ → chạy ngay nhịp tới.
 */
export function isDueEvery(row: DueRow, now: Date): boolean {
    if (!row.enabled) return false;
    if (row.intervalSeconds == null || row.intervalSeconds < 1) return false;
    if (row.lastRunAt == null) return true;
    return now.getTime() - row.lastRunAt.getTime() >= row.intervalSeconds * 1000;
}

/**
 * Lịch `tick` — chạy MỌI nhịp trigger (5 phút), không xét giờ, ngày, hay biểu thức.
 * Chốt theo `last_run_slot` như `cron` để hai lần trigger chồng nhau không chạy đôi.
 * Không có field cấu hình: bật là chạy mỗi nhịp.
 */
export function isDueTick(row: DueRow, slot: string): boolean {
    if (!row.enabled) return false;
    return row.lastRunSlot !== slot;
}

function splitInts(csv: string | null): number[] {
    return (csv ?? '')
        .split(',')
        .filter(Boolean)
        .map(Number);
}

/**
 * `payload` lưu trong DB là chuỗi JSON. Hỏng, không phải object, hay là mảng → coi như
 * không có field nào, KHÔNG ném lỗi: một dòng lịch gõ sai không được làm chết cả lượt
 * quét khiến mọi job khác cũng không chạy.
 */
export function parsePayload(raw: string): Record<string, unknown> {
    try {
        const v: unknown = JSON.parse(raw);
        return v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
    } catch {
        return {};
    }
}
