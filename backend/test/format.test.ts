import { describe, it, expect } from 'vitest';
import { escapeMd, formatCountdownMessage } from '../src/telegram/format';

const row = (over: Partial<Parameters<typeof formatCountdownMessage>[0][0]> = {}) => ({
    event: 'Sự kiện',
    description: null,
    startDate: '2026-09-01',
    endDate: '2026-10-01',
    ...over,
});

describe('escapeMd', () => {
    it('escape đủ bộ ký tự đặc biệt của MarkdownV2', () => {
        // Thiếu một ký tự nào ở đây là Telegram trả 400 lúc chạy thật, không phải lúc build.
        for (const ch of '_*[]()~`>#+-=|{}.!\\') {
            expect(escapeMd(ch)).toBe(`\\${ch}`);
        }
    });

    it('giữ nguyên chữ thường và tiếng Việt có dấu', () => {
        expect(escapeMd('Sinh nhật mẹ')).toBe('Sinh nhật mẹ');
    });
});

describe('formatCountdownMessage', () => {
    it('null khi không có event nào active', () => {
        expect(formatCountdownMessage([], '2026-09-19')).toBeNull();
    });

    it('bỏ qua event pending và finished', () => {
        const rows = [
            row({ event: 'Chưa tới', startDate: '2026-10-10', endDate: '2026-10-20' }),
            row({ event: 'Đã xong', startDate: '2026-08-01', endDate: '2026-08-10' }),
        ];
        expect(formatCountdownMessage(rows, '2026-09-19')).toBeNull();
    });

    it('bỏ qua dòng dữ liệu hỏng mà không làm hỏng cả tin nhắn', () => {
        const rows = [
            row({ event: 'Hỏng', startDate: '2026-10-01', endDate: '2026-09-01' }),
            row({ event: 'Tốt' }),
        ];
        const msg = formatCountdownMessage(rows, '2026-09-19')!;
        expect(msg).toContain('Tốt');
        expect(msg).not.toContain('Hỏng');
    });

    it('gộp nhiều event vào MỘT tin nhắn', () => {
        const msg = formatCountdownMessage([row({ event: 'Một' }), row({ event: 'Hai' })], '2026-09-19')!;
        expect(msg).toContain('Một');
        expect(msg).toContain('Hai');
        expect(msg).toContain('Còn 12 ngày');
        expect(msg).toContain('đã qua 18/30');
    });

    it('escape tên sự kiện chứa ký tự Markdown', () => {
        const msg = formatCountdownMessage([row({ event: 'Deadline #1 (gấp!)' })], '2026-09-19')!;
        expect(msg).toContain('Deadline \\#1 \\(gấp\\!\\)');
        // Dấu * bao quanh tên là markup thật, không được escape.
        expect(msg).toContain('*Deadline');
    });

    it('escape cả description', () => {
        const msg = formatCountdownMessage([row({ description: 'Nhớ đặt bánh (trước 1 tuần).' })], '2026-09-19')!;
        expect(msg).toContain('\\(trước 1 tuần\\)\\.');
    });

    it('mọi dấu chấm ngoài markup đều được escape', () => {
        const msg = formatCountdownMessage([row()], '2026-09-19')!;
        // Ngày ở tiêu đề là 19/09/2026 — các dấu '/' không cần escape, nhưng nếu có dấu
        // chấm nào lọt ra chưa escape thì Telegram sẽ từ chối cả tin nhắn.
        const unescapedDot = /(?<!\\)\./.test(msg);
        expect(unescapedDot).toBe(false);
    });
});
