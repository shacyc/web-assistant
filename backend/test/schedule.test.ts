import { describe, it, expect } from 'vitest';
import { isDue, parsePayload } from '../src/lib/schedule';
import { hhmm, isValidHHMM } from '../src/lib/dates';

// Ba nhánh của isDue, mỗi nhánh phá được một dòng trong hàm là test đỏ.
describe('isDue', () => {
    const base = { enabled: true, timeOfDay: '04:30', lastRunDate: null as string | null };

    it('bật + tới giờ + hôm nay chưa chạy → chạy', () => {
        expect(isDue(base, '2026-09-03', '04:30')).toBe(true);
        expect(isDue(base, '2026-09-03', '23:59')).toBe(true);
    });

    it('chưa tới giờ → không (canh phép so time_of_day <= now)', () => {
        expect(isDue(base, '2026-09-03', '04:29')).toBe(false);
    });

    it('đã chạy hôm nay → không, kể cả khi đã quá giờ (canh chốt mỗi ngày một lần)', () => {
        expect(isDue({ ...base, lastRunDate: '2026-09-03' }, '2026-09-03', '10:00')).toBe(false);
        // ngày khác thì lại chạy
        expect(isDue({ ...base, lastRunDate: '2026-09-02' }, '2026-09-03', '10:00')).toBe(true);
    });

    it('enabled = false → không (canh nhánh enabled)', () => {
        expect(isDue({ ...base, enabled: false }, '2026-09-03', '10:00')).toBe(false);
    });
});

describe('parsePayload', () => {
    it('object JSON → chính nó', () => {
        expect(parsePayload('{"dryRun":true}')).toEqual({ dryRun: true });
    });

    it('hỏng / không phải object → {} chứ không ném', () => {
        expect(parsePayload('không phải json')).toEqual({});
        expect(parsePayload('[1,2,3]')).toEqual({});
        expect(parsePayload('null')).toEqual({});
        expect(parsePayload('42')).toEqual({});
    });
});

describe('hhmm / isValidHHMM', () => {
    it('hhmm ra đúng HH:MM 24h zero-pad', () => {
        const at = (iso: string) => hhmm('Asia/Ho_Chi_Minh', new Date(iso));
        // 2026-09-03T00:15:00Z = 07:15 giờ VN
        expect(at('2026-09-03T00:15:00Z')).toBe('07:15');
        // nửa đêm giờ VN phải là '00:00', không phải '24:00'
        expect(at('2026-09-02T17:00:00Z')).toBe('00:00');
    });

    it('isValidHHMM', () => {
        expect(isValidHHMM('04:30')).toBe(true);
        expect(isValidHHMM('00:00')).toBe(true);
        expect(isValidHHMM('23:59')).toBe(true);
        expect(isValidHHMM('9:05')).toBe(false);
        expect(isValidHHMM('24:00')).toBe(false);
        expect(isValidHHMM('04:60')).toBe(false);
        expect(isValidHHMM('0430')).toBe(false);
    });
});
