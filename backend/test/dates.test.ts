import { describe, it, expect } from 'vitest';
import { today, isValidDate, diffDays, computeCountdown, progressBar, formatVN } from '../src/lib/dates';

describe('today', () => {
    it('trả ngày theo múi giờ VN, không theo UTC', () => {
        // 23:30 UTC ngày 31/08 = 06:30 sáng ngày 01/09 giờ VN. Đây chính là khung giờ
        // mà cách làm ngây thơ (dùng UTC) trả sai một ngày.
        const t = new Date('2026-08-31T23:30:00Z');
        expect(today('Asia/Ho_Chi_Minh', t)).toBe('2026-09-01');
        expect(today('UTC', t)).toBe('2026-08-31');
    });
});

describe('isValidDate', () => {
    it('nhận ngày có thật', () => {
        expect(isValidDate('2026-09-01')).toBe(true);
        expect(isValidDate('2024-02-29')).toBe(true); // năm nhuận
    });

    it('từ chối ngày khớp regex nhưng không tồn tại', () => {
        // Date.UTC âm thầm cuộn 02-31 sang 03-02 thay vì báo lỗi — đây là dòng canh nó.
        expect(isValidDate('2026-02-31')).toBe(false);
        expect(isValidDate('2026-13-01')).toBe(false);
        expect(isValidDate('2025-02-29')).toBe(false); // không nhuận
    });

    it('từ chối định dạng sai', () => {
        expect(isValidDate('01/09/2026')).toBe(false);
        expect(isValidDate('2026-9-1')).toBe(false);
        expect(isValidDate('')).toBe(false);
    });
});

describe('diffDays', () => {
    it('đếm đúng qua ranh giới tháng và năm', () => {
        expect(diffDays('2026-09-01', '2026-09-11')).toBe(10);
        expect(diffDays('2026-12-25', '2027-01-05')).toBe(11);
        expect(diffDays('2026-09-11', '2026-09-01')).toBe(-10);
        expect(diffDays('2026-09-01', '2026-09-01')).toBe(0);
    });
});

describe('computeCountdown', () => {
    it('giữa chừng: chia đúng đã qua / còn lại', () => {
        const cd = computeCountdown('2026-09-01', '2026-10-01', '2026-09-19')!;
        expect(cd).toMatchObject({ totalDays: 30, elapsedDays: 18, remainingDays: 12, percent: 60, phase: 'active' });
    });

    it('đúng ngày bắt đầu: elapsed = 0, vẫn active', () => {
        const cd = computeCountdown('2026-09-01', '2026-09-11', '2026-09-01')!;
        expect(cd.elapsedDays).toBe(0);
        expect(cd.remainingDays).toBe(10);
        expect(cd.phase).toBe('active');
    });

    it('đúng ngày kết thúc: remaining = 0, VẪN active', () => {
        const cd = computeCountdown('2026-09-01', '2026-09-11', '2026-09-11')!;
        expect(cd.remainingDays).toBe(0);
        expect(cd.percent).toBe(100);
        expect(cd.phase).toBe('active');
    });

    it('start === end: không chia cho 0', () => {
        const cd = computeCountdown('2026-09-01', '2026-09-01', '2026-09-01')!;
        expect(cd.totalDays).toBe(0);
        expect(Number.isFinite(cd.percent)).toBe(true);
        expect(cd.percent).toBe(100);
        expect(cd.phase).toBe('active');
    });

    it('chưa tới ngày bắt đầu → pending', () => {
        expect(computeCountdown('2026-09-10', '2026-09-20', '2026-09-01')!.phase).toBe('pending');
    });

    it('đã qua ngày kết thúc → finished', () => {
        expect(computeCountdown('2026-09-01', '2026-09-10', '2026-09-15')!.phase).toBe('finished');
    });

    it('không bao giờ trả số ngày âm ra ngoài', () => {
        const past = computeCountdown('2026-09-01', '2026-09-10', '2026-09-30')!;
        expect(past.remainingDays).toBeGreaterThanOrEqual(0);
        const future = computeCountdown('2026-09-10', '2026-09-20', '2026-08-01')!;
        expect(future.elapsedDays).toBeGreaterThanOrEqual(0);
    });

    it('end trước start → null, không phải số âm', () => {
        expect(computeCountdown('2026-09-10', '2026-09-01', '2026-09-05')).toBeNull();
    });
});

describe('progressBar / formatVN', () => {
    it('thanh tiến độ luôn đúng độ rộng', () => {
        for (const p of [0, 33, 50, 99, 100]) {
            expect(progressBar(p)).toHaveLength(10);
        }
        expect(progressBar(0)).toBe('░░░░░░░░░░');
        expect(progressBar(100)).toBe('▓▓▓▓▓▓▓▓▓▓');
    });

    it('đổi sang định dạng ngày Việt Nam', () => {
        expect(formatVN('2026-09-01')).toBe('01/09/2026');
    });
});
