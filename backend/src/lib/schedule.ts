/**
 * Logic thuần cho lịch chạy — tách khỏi handler `scheduled` để test được mà không cần
 * dựng cả worker. Cùng lý do với lib/dates.ts: không dependency, không đụng `Date.now()`.
 */

/** Chỉ những field mà việc "có chạy hay không" phụ thuộc vào. */
export interface DueInput {
    enabled: boolean;
    timeOfDay: string; // 'HH:MM'
    lastRunDate: string | null; // 'YYYY-MM-DD' | null
}

/**
 * Một job tới lượt chạy chưa?
 *
 * - `enabled` tắt → không.
 * - đã chạy hôm nay (thành công hay lỗi) → không. Đây là chốt "mỗi ngày một lần";
 *   job lỗi KHÔNG tự thử lại trong ngày, đổi lấy việc không bao giờ gửi trùng.
 * - `time_of_day` <= giờ hiện tại → chạy. Dùng '<=' chứ không phải cửa sổ hẹp quanh
 *   đúng phút: nhịp cron 4:30 bị bỏ lỡ thì nhịp 4:35 vẫn vớt lại được.
 */
export function isDue(row: DueInput, todayStr: string, nowHHMM: string): boolean {
    if (!row.enabled) return false;
    if (row.lastRunDate === todayStr) return false;
    return row.timeOfDay <= nowHHMM;
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
