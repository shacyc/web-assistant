/**
 * Số học ngày tháng cho countdown. Thuần, không dependency, không đụng `Date.now()`
 * ngoài đúng một hàm — nhờ vậy test không cần fake timer.
 *
 * ## Vì sao mọi thứ là chuỗi 'YYYY-MM-DD'
 *
 * Worker chạy theo giờ UTC. Nếu để `new Date()` tự parse rồi trừ mili-giây thì mỗi sáng
 * từ 0h đến 7h giờ VN, "hôm nay" theo UTC vẫn là hôm qua — countdown lệch đúng một ngày,
 * và lệch đúng vào khung giờ người ta hay đọc thông báo nhất.
 *
 * Cách chữa: quy mọi thứ về chuỗi ngày ở múi giờ VN, rồi làm số học trên trục UTC (nơi
 * mọi ngày đều dài đúng 86400 giây, không có DST).
 */

const MS_PER_DAY = 86_400_000;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** 'YYYY-MM-DD' của *hôm nay* ở múi giờ đã cho. */
export function today(timeZone: string, now: Date = new Date()): string {
    // 'en-CA' cho ra đúng định dạng ISO 'YYYY-MM-DD'. Đây là thủ thuật rẻ nhất để đổi
    // múi giờ mà không kéo theo thư viện timezone nào.
    return new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).format(now);
}

/**
 * Kiểm chuỗi vừa đúng định dạng vừa là ngày CÓ THẬT.
 *
 * Regex một mình không đủ: '2026-02-31' khớp regex nhưng không tồn tại, và `Date.UTC`
 * sẽ âm thầm cuộn sang 03-03 thay vì báo lỗi. Cách bắt là dựng lại chuỗi từ đối tượng
 * Date rồi so — cuộn ngày thì chuỗi dựng lại sẽ khác chuỗi vào.
 */
export function isValidDate(value: string): boolean {
    if (!ISO_DATE.test(value)) return false;
    const ms = toUtcMs(value);
    if (Number.isNaN(ms)) return false;
    return new Date(ms).toISOString().slice(0, 10) === value;
}

function toUtcMs(value: string): number {
    const [y, m, d] = value.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
}

/** Số ngày từ `from` tới `to`. Âm nếu `to` trước `from`. */
export function diffDays(from: string, to: string): number {
    return Math.round((toUtcMs(to) - toUtcMs(from)) / MS_PER_DAY);
}

export type Phase = 'pending' | 'active' | 'finished';

export interface Countdown {
    totalDays: number;
    elapsedDays: number;
    remainingDays: number;
    percent: number; // 0..100, đã làm tròn
    phase: Phase;
}

/**
 * `today` nằm ngoài [start, end] vẫn tính được, chỉ khác `phase` — người gọi tự quyết
 * có lọc hay không. Trả về null khi dữ liệu vô lý (end trước start), để chỗ gọi không
 * phải đoán ý nghĩa của một con số âm.
 */
export function computeCountdown(startDate: string, endDate: string, todayDate: string): Countdown | null {
    const totalDays = diffDays(startDate, endDate);
    if (totalDays < 0) return null;

    const elapsedRaw = diffDays(startDate, todayDate);
    const remainingRaw = diffDays(todayDate, endDate);

    const phase: Phase = elapsedRaw < 0 ? 'pending' : remainingRaw < 0 ? 'finished' : 'active';

    // Kẹp về [0, totalDays] để 'còn -3 ngày' không bao giờ lọt ra tin nhắn.
    const elapsedDays = Math.min(Math.max(elapsedRaw, 0), totalDays);
    const remainingDays = Math.min(Math.max(remainingRaw, 0), totalDays);

    // totalDays === 0 là hợp lệ: sự kiện gói trong đúng một ngày. Không được chia cho 0
    // ở đây — hôm đó coi như đã trọn vẹn 100%.
    const percent = totalDays === 0
        ? (phase === 'pending' ? 0 : 100)
        : Math.round((elapsedDays / totalDays) * 100);

    return { totalDays, elapsedDays, remainingDays, percent, phase };
}

/** Thanh tiến độ bằng ký tự khối — Telegram không render được HTML/SVG. */
export function progressBar(percent: number, width = 10): string {
    const filled = Math.round((percent / 100) * width);
    return '▓'.repeat(filled) + '░'.repeat(width - filled);
}

/** 'YYYY-MM-DD' → 'DD/MM/YYYY' để hiển thị cho người Việt đọc. */
export function formatVN(date: string): string {
    const [y, m, d] = date.split('-');
    return `${d}/${m}/${y}`;
}
