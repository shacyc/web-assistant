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

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

function ymd(value: string): [number, number, number] {
    const [y, m, d] = value.split('-').map(Number);
    return [y, m, d];
}

/** Thứ trong tuần theo ISO: 1 = Thứ Hai … 7 = Chủ Nhật. Dùng cho lịch "hằng tuần". */
export function weekdayISO(value: string): number {
    const [y, m, d] = ymd(value);
    const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Chủ Nhật
    return dow === 0 ? 7 : dow;
}

/** Ngày trong tháng của chuỗi 'YYYY-MM-DD', 1..31. */
export function dayOfMonth(value: string): number {
    return ymd(value)[2];
}

/** Số ngày của tháng chứa `value` (28..31). Ngày 0 của tháng sau = ngày cuối tháng này. */
export function daysInMonth(value: string): number {
    const [y, m] = ymd(value);
    return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export interface ZonedParts {
    minute: number; // 0..59
    hour: number; // 0..23
    dom: number; // 1..31
    month: number; // 1..12
    dow: number; // 0..6, 0 = Chủ Nhật (theo quy ước cron)
}

/**
 * Giờ/phút/ngày/tháng/thứ của `now` ở múi giờ đã cho — cho matcher cron. Cùng thủ thuật
 * `Intl` với `today()` để không kéo theo thư viện timezone; `dow` tính lại từ y-m-d qua
 * `Date.UTC` cho chắc, thay vì parse tên thứ theo locale.
 */
export function zonedParts(timeZone: string, now: Date = new Date()): ZonedParts {
    const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone,
        hourCycle: 'h23',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    }).formatToParts(now);
    const g = (t: string) => Number(parts.find((x) => x.type === t)?.value);
    const y = g('year');
    const mo = g('month');
    const d = g('day');
    return {
        minute: g('minute'),
        hour: g('hour'),
        dom: d,
        month: mo,
        dow: new Date(Date.UTC(y, mo - 1, d)).getUTCDay(),
    };
}

/**
 * Khoá "nhịp 5 phút" theo UTC: 'YYYY-MM-DDTHH:MM'. Chốt chống chạy trùng cho lịch `cron`
 * (kiểu này chạy nhiều lần/ngày nên không dùng `last_run_date` được). Làm tròn xuống mốc
 * 5 phút để hai lần cron chồng nhau rơi vào cùng một khoá.
 */
export function slotKeyUTC(now: Date = new Date()): string {
    const t = new Date(now);
    t.setUTCSeconds(0, 0);
    t.setUTCMinutes(t.getUTCMinutes() - (t.getUTCMinutes() % 5));
    return t.toISOString().slice(0, 16);
}

/**
 * 'HH:MM' (24h) của *bây giờ* ở múi giờ đã cho. Dùng cho lịch chạy: so với
 * `schedules.time_of_day` bằng phép so chuỗi.
 *
 * `hourCycle: 'h23'` chứ không phải `hour12: false`: option cũ có engine trả '24:00'
 * lúc nửa đêm thay vì '00:00', lệch nguyên một ngày ở đúng ranh giới.
 */
export function hhmm(timeZone: string, now: Date = new Date()): string {
    return new Intl.DateTimeFormat('en-GB', {
        timeZone,
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
    }).format(now);
}

/** 'HH:MM' 24h, zero-pad. '9:5' hay '24:00' đều trượt. */
export function isValidHHMM(value: string): boolean {
    return HHMM.test(value);
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
    percent: number; // 0..100, làm tròn 2 số lẻ
    perDayPercent: number; // mỗi ngày trôi qua chiếm bao nhiêu % toàn chặng, làm tròn 2 số lẻ
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
    // Giữ 2 số lẻ thay vì làm tròn về số nguyên: chặng dài (vài trăm ngày) thì mỗi ngày
    // nhích chưa tới 1%, làm tròn nguyên là tin nhắn đứng yên nhiều hôm liền.
    const percent = totalDays === 0
        ? (phase === 'pending' ? 0 : 100)
        : Math.round((elapsedDays / totalDays) * 10000) / 100;

    // Mỗi ngày trôi qua "ăn" bao nhiêu phần trăm toàn bộ chặng. Không làm tròn về số
    // nguyên như `percent`: chặng dài hơn ~150 ngày sẽ ra 0% và mất hết ý nghĩa. Giữ 2
    // số lẻ. totalDays === 0 thì đúng một ngày là trọn vẹn 100%.
    const perDayPercent = totalDays === 0 ? 100 : Math.round((100 / totalDays) * 100) / 100;

    return { totalDays, elapsedDays, remainingDays, percent, perDayPercent, phase };
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
