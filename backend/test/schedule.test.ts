import { describe, it, expect } from 'vitest';
import { isDueStructured, isDueCron, isDueEvery, isDueTick, matchesDay, parsePayload, type DueRow } from '../src/lib/schedule';
import { hhmm, isValidHHMM, weekdayISO, dayOfMonth, daysInMonth, slotKeyUTC, zonedParts } from '../src/lib/dates';

// DueRow đầy đủ, test chỉ ghi đè field cần thiết.
const row = (over: Partial<DueRow>): DueRow => ({
    enabled: true,
    kind: 'daily',
    timeOfDay: '04:30',
    daysOfWeek: null,
    dayOfMonth: null,
    intervalDays: null,
    anchorDate: null,
    cron: null,
    intervalSeconds: null,
    lastRunDate: null,
    lastRunSlot: null,
    lastRunAt: null,
    ...over,
});

describe('isDueStructured', () => {
    it('daily: bật + tới giờ + hôm nay chưa chạy → chạy', () => {
        expect(isDueStructured(row({}), '2026-09-03', '04:30')).toBe(true);
        expect(isDueStructured(row({}), '2026-09-03', '23:59')).toBe(true);
    });

    it('chưa tới giờ → không (canh phép so time_of_day <= now)', () => {
        expect(isDueStructured(row({}), '2026-09-03', '04:29')).toBe(false);
    });

    it('đã chạy hôm nay → không, kể cả khi đã quá giờ (canh chốt mỗi ngày một lần)', () => {
        expect(isDueStructured(row({ lastRunDate: '2026-09-03' }), '2026-09-03', '10:00')).toBe(false);
        expect(isDueStructured(row({ lastRunDate: '2026-09-02' }), '2026-09-03', '10:00')).toBe(true);
    });

    it('enabled = false → không (canh nhánh enabled)', () => {
        expect(isDueStructured(row({ enabled: false }), '2026-09-03', '10:00')).toBe(false);
    });
});

describe('matchesDay', () => {
    // 2026-09-07 là Thứ Hai; 2026-09-08 Thứ Ba.
    it('weekly: chỉ khớp thứ được chọn', () => {
        const r = row({ kind: 'weekly', daysOfWeek: '1,3,5' });
        expect(matchesDay(r, '2026-09-07')).toBe(true); // T2
        expect(matchesDay(r, '2026-09-08')).toBe(false); // T3 không nằm trong 1,3,5
        expect(matchesDay(r, '2026-09-09')).toBe(true); // T4
    });

    it('monthly: khớp đúng ngày, và kẹp về ngày cuối tháng ngắn', () => {
        expect(matchesDay(row({ kind: 'monthly', dayOfMonth: 7 }), '2026-09-07')).toBe(true);
        expect(matchesDay(row({ kind: 'monthly', dayOfMonth: 8 }), '2026-09-07')).toBe(false);
        // Ngày 31 ở tháng 2 (28 ngày, 2026 không nhuận) → chạy 28/02
        expect(matchesDay(row({ kind: 'monthly', dayOfMonth: 31 }), '2026-02-28')).toBe(true);
        expect(matchesDay(row({ kind: 'monthly', dayOfMonth: 31 }), '2026-02-27')).toBe(false);
        // Ngày 31 ở tháng 30 ngày → chạy 30
        expect(matchesDay(row({ kind: 'monthly', dayOfMonth: 31 }), '2026-09-30')).toBe(true);
    });

    it('interval: mỗi N ngày tính từ anchor, không chạy trước anchor', () => {
        const r = row({ kind: 'interval', intervalDays: 3, anchorDate: '2026-09-01' });
        expect(matchesDay(r, '2026-09-01')).toBe(true); // n=0
        expect(matchesDay(r, '2026-09-02')).toBe(false);
        expect(matchesDay(r, '2026-09-04')).toBe(true); // n=3
        expect(matchesDay(r, '2026-08-29')).toBe(false); // trước anchor
    });

    it('kind lạ → false', () => {
        expect(matchesDay(row({ kind: 'kiểu-lạ' }), '2026-09-07')).toBe(false);
    });
});

describe('isDueCron', () => {
    const parts = zonedParts('Asia/Ho_Chi_Minh', new Date('2026-09-06T21:30:00Z')); // T2 04:30 giờ VN
    const slot = slotKeyUTC(new Date('2026-09-06T21:30:00Z'));

    it('khớp biểu thức + nhịp chưa chạy → chạy', () => {
        expect(isDueCron(row({ kind: 'cron', cron: '30 4 * * 1' }), parts, slot)).toBe(true);
        expect(isDueCron(row({ kind: 'cron', cron: '*/30 * * * *' }), parts, slot)).toBe(true);
    });

    it('không khớp biểu thức → không', () => {
        expect(isDueCron(row({ kind: 'cron', cron: '35 4 * * 1' }), parts, slot)).toBe(false); // phút 35
        expect(isDueCron(row({ kind: 'cron', cron: '30 4 * * 2' }), parts, slot)).toBe(false); // T3
    });

    it('đã chạy nhịp này rồi → không (canh chốt last_run_slot)', () => {
        expect(isDueCron(row({ kind: 'cron', cron: '30 4 * * 1', lastRunSlot: slot }), parts, slot)).toBe(false);
    });

    it('cron rỗng / hỏng → không, không ném', () => {
        expect(isDueCron(row({ kind: 'cron', cron: null }), parts, slot)).toBe(false);
        expect(isDueCron(row({ kind: 'cron', cron: 'rác' }), parts, slot)).toBe(false);
    });
});

describe('isDueEvery', () => {
    const NOW = new Date('2026-09-06T21:30:00Z');
    const ago = (sec: number) => new Date(NOW.getTime() - sec * 1000);

    it('chưa chạy bao giờ → chạy ngay', () => {
        expect(isDueEvery(row({ kind: 'every', intervalSeconds: 3600, lastRunAt: null }), NOW)).toBe(true);
    });

    it('đủ khoảng thời gian → chạy; chưa đủ → không', () => {
        const r = row({ kind: 'every', intervalSeconds: 3600 });
        expect(isDueEvery({ ...r, lastRunAt: ago(3600) }, NOW)).toBe(true); // đúng đủ
        expect(isDueEvery({ ...r, lastRunAt: ago(3599) }, NOW)).toBe(false); // thiếu 1s
        expect(isDueEvery({ ...r, lastRunAt: ago(7200) }, NOW)).toBe(true);
    });

    it('enabled = false → không (canh nhánh enabled)', () => {
        expect(isDueEvery(row({ kind: 'every', intervalSeconds: 60, enabled: false, lastRunAt: null }), NOW)).toBe(false);
    });

    it('thiếu intervalSeconds → không, không ném', () => {
        expect(isDueEvery(row({ kind: 'every', intervalSeconds: null, lastRunAt: null }), NOW)).toBe(false);
    });
});

describe('isDueTick', () => {
    const slot = '2026-09-06T21:30';

    it('bật + nhịp này chưa chạy → chạy', () => {
        expect(isDueTick(row({ kind: 'tick' }), slot)).toBe(true);
    });

    it('đã chạy nhịp này rồi → không (canh chốt last_run_slot)', () => {
        expect(isDueTick(row({ kind: 'tick', lastRunSlot: slot }), slot)).toBe(false);
    });

    it('nhịp khác → chạy lại', () => {
        expect(isDueTick(row({ kind: 'tick', lastRunSlot: '2026-09-06T21:25' }), slot)).toBe(true);
    });

    it('enabled = false → không (canh nhánh enabled)', () => {
        expect(isDueTick(row({ kind: 'tick', enabled: false }), slot)).toBe(false);
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

describe('helper ngày tháng', () => {
    it('weekdayISO: 1 = T2 … 7 = CN', () => {
        expect(weekdayISO('2026-09-07')).toBe(1); // Thứ Hai
        expect(weekdayISO('2026-09-13')).toBe(7); // Chủ Nhật
    });
    it('dayOfMonth / daysInMonth', () => {
        expect(dayOfMonth('2026-09-07')).toBe(7);
        expect(daysInMonth('2026-02-15')).toBe(28); // 2026 không nhuận
        expect(daysInMonth('2024-02-15')).toBe(29);
        expect(daysInMonth('2026-09-01')).toBe(30);
    });
    it('slotKeyUTC làm tròn xuống mốc 5 phút', () => {
        expect(slotKeyUTC(new Date('2026-09-06T21:32:41Z'))).toBe('2026-09-06T21:30');
        expect(slotKeyUTC(new Date('2026-09-06T21:35:00Z'))).toBe('2026-09-06T21:35');
    });
    it('zonedParts đổi đúng sang giờ VN', () => {
        const p = zonedParts('Asia/Ho_Chi_Minh', new Date('2026-09-06T21:30:00Z'));
        expect(p).toMatchObject({ minute: 30, hour: 4, dom: 7, month: 9, dow: 1 }); // T2 = 1
    });
});

describe('hhmm / isValidHHMM', () => {
    it('hhmm ra đúng HH:MM 24h zero-pad', () => {
        const at = (iso: string) => hhmm('Asia/Ho_Chi_Minh', new Date(iso));
        expect(at('2026-09-03T00:15:00Z')).toBe('07:15');
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
