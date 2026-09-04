import { describe, it, expect } from 'vitest';
import { parseCron, cronMatches } from '../src/lib/cron';
import type { ZonedParts } from '../src/lib/dates';

const at = (over: Partial<ZonedParts>): ZonedParts => ({
    minute: 30,
    hour: 4,
    dom: 7,
    month: 9,
    dow: 1, // Thứ Hai
    ...over,
});

describe('parseCron', () => {
    it('nhận cú pháp hợp lệ', () => {
        expect(parseCron('30 4 * * 1')).not.toBeNull();
        expect(parseCron('*/15 * * * *')).not.toBeNull();
        expect(parseCron('0 9-17 * * 1-5')).not.toBeNull();
        expect(parseCron('0 0 1,15 * *')).not.toBeNull();
        expect(parseCron('  30   4  *  *  0  ')).not.toBeNull(); // thừa khoảng trắng
    });

    it('từ chối cú pháp sai / ngoài khoảng', () => {
        expect(parseCron('30 4 * *')).toBeNull(); // 4 trường
        expect(parseCron('30 4 * * * *')).toBeNull(); // 6 trường
        expect(parseCron('60 4 * * *')).toBeNull(); // phút 60
        expect(parseCron('30 24 * * *')).toBeNull(); // giờ 24
        expect(parseCron('30 4 0 * *')).toBeNull(); // ngày 0
        expect(parseCron('30 4 * 13 *')).toBeNull(); // tháng 13
        expect(parseCron('30 4 * * 8')).toBeNull(); // thứ 8
        expect(parseCron('rác')).toBeNull();
        expect(parseCron('*/0 * * * *')).toBeNull(); // bước 0
        expect(parseCron('5-1 * * * *')).toBeNull(); // đảo khoảng
    });
});

describe('cronMatches', () => {
    it('* khớp mọi giá trị', () => {
        expect(cronMatches(parseCron('* * * * *')!, at({}))).toBe(true);
    });

    it('giá trị đơn + khoảng + bước', () => {
        expect(cronMatches(parseCron('30 4 * * *')!, at({}))).toBe(true);
        expect(cronMatches(parseCron('31 4 * * *')!, at({}))).toBe(false);
        expect(cronMatches(parseCron('0 9-17 * * *')!, at({ hour: 12, minute: 0 }))).toBe(true);
        expect(cronMatches(parseCron('0 9-17 * * *')!, at({ hour: 18, minute: 0 }))).toBe(false);
        expect(cronMatches(parseCron('*/15 * * * *')!, at({ minute: 45 }))).toBe(true);
        expect(cronMatches(parseCron('*/15 * * * *')!, at({ minute: 40 }))).toBe(false);
    });

    it('7 và 0 đều là Chủ Nhật', () => {
        expect(cronMatches(parseCron('30 4 * * 7')!, at({ dow: 0 }))).toBe(true);
        expect(cronMatches(parseCron('30 4 * * 0')!, at({ dow: 0 }))).toBe(true);
        expect(cronMatches(parseCron('30 4 * * 7')!, at({ dow: 1 }))).toBe(false);
    });

    it('cả ngày-tháng lẫn thứ bị giới hạn → khớp MỘT trong hai là đủ', () => {
        const e = parseCron('30 4 13 * 1')!; // ngày 13 HOẶC Thứ Hai
        expect(cronMatches(e, at({ dom: 13, dow: 3 }))).toBe(true); // đúng ngày, sai thứ
        expect(cronMatches(e, at({ dom: 10, dow: 1 }))).toBe(true); // sai ngày, đúng thứ
        expect(cronMatches(e, at({ dom: 10, dow: 3 }))).toBe(false); // sai cả hai
    });

    it('chỉ một trường ngày bị giới hạn → phải khớp trường đó', () => {
        expect(cronMatches(parseCron('30 4 * * 1-5')!, at({ dow: 1 }))).toBe(true);
        expect(cronMatches(parseCron('30 4 * * 1-5')!, at({ dow: 6 }))).toBe(false);
        expect(cronMatches(parseCron('30 4 15 * *')!, at({ dom: 15 }))).toBe(true);
        expect(cronMatches(parseCron('30 4 15 * *')!, at({ dom: 16 }))).toBe(false);
    });
});
