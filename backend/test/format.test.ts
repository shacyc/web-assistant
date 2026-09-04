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
        // % mỗi ngày, dấu chấm thập phân đã được escape cho MarkdownV2.
        expect(msg).toContain('Mỗi ngày trôi qua mất \\~3\\.33%');
    });

    it('escape dấu chấm thập phân của phần trăm đã qua', () => {
        // 1/3 chặng → 33.33% → dấu chấm phải được escape, không thì Telegram trả 400.
        const msg = formatCountdownMessage([row({ startDate: '2026-09-01', endDate: '2026-09-04' })], '2026-09-02')!;
        expect(msg).toContain('đã qua 1/3 \\(33\\.33%\\)');
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

describe('formatCountdownMessage với mẫu tuỳ chỉnh (header / body / footer)', () => {
    // row() mặc định: 2026-09-01 → 2026-10-01 (30 ngày). today 2026-09-19 → còn 12 ngày.
    const BODY = '{eventName}: còn {remainDays} ngày ({remainWeeks} tuần, {remainDaysPercent}%) {progress} [{startDate}→{endDate}]';

    it('body thay mọi tham số bằng giá trị của event', () => {
        const msg = formatCountdownMessage([row({ event: 'Ra mắt' })], '2026-09-19', { body: BODY })!;
        expect(msg).toContain('Ra mắt: còn 12 ngày');
        expect(msg).toContain('[01/09/2026→01/10/2026]'); // start/end của event, không phải hôm nay
        expect(msg).toContain('40%'); // 12/30
    });

    it('tham số tổng/đã qua của chặng: totalDays, totalWeeks, passedDays, passedWeeks, dailyPercent', () => {
        // row() mặc định: chặng 30 ngày, hôm nay đã qua 18.
        const msg = formatCountdownMessage([row()], '2026-09-19', {
            body: 'T{totalDays}/{totalWeeks} · Q{passedDays}/{passedWeeks} · ngày {dailyPercent}%',
        })!;
        // 30/7 = 4.29 · 18/7 = 2.57 · 100/30 = 3.33 — dấu chấm đều đã escape.
        expect(msg).toBe('T30/4\\.29 · Q18/2\\.57 · ngày 3\\.33%');
    });

    it('có mẫu tuỳ chỉnh → KHÔNG còn dòng "⏳ Countdown" mặc định', () => {
        const msg = formatCountdownMessage([row()], '2026-09-19', { body: '{eventName}' })!;
        expect(msg).not.toContain('⏳');
    });

    it('escape giá trị thay vào — số tuần có dấu chấm, không thì Telegram 400', () => {
        // 12/7 = 1.71 → dấu chấm phải được escape. Bỏ escapeMd trong fillTemplate là dòng này đỏ.
        const msg = formatCountdownMessage([row()], '2026-09-19', { body: '{remainWeeks} tuần' })!;
        expect(msg).toContain('1\\.71 tuần');
        expect(msg).not.toMatch(/1\.71/); // dấu chấm trần (chưa escape) là đỏ
    });

    it('escape tên sự kiện chứa ký tự Markdown nhưng KHÔNG escape chữ literal của mẫu', () => {
        const msg = formatCountdownMessage([row({ event: 'Deadline #1 (gấp!)' })], '2026-09-19', { body: '*{eventName}*' })!;
        expect(msg).toContain('*Deadline \\#1 \\(gấp\\!\\)*');
    });

    it('tham số lạ giữ nguyên {tên} thay vì làm hỏng cả tin nhắn', () => {
        const msg = formatCountdownMessage([row()], '2026-09-19', { body: 'còn {remainDays} — {khongCoThamSoNay}' })!;
        expect(msg).toContain('còn 12 — {khongCoThamSoNay}');
    });

    it('header ghép một lần ở đầu, footer một lần ở cuối; {today} và {count} được thay', () => {
        const msg = formatCountdownMessage([row({ event: 'A' }), row({ event: 'B' })], '2026-09-19', {
            header: 'CÓ {count} sự kiện — {today}',
            body: '{eventName} còn {remainDays}',
            footer: '— hết —',
        })!;
        const lines = msg.split('\n\n');
        expect(lines[0]).toBe('CÓ 2 sự kiện — 19/09/2026');
        expect(lines[lines.length - 1]).toBe('— hết —');
        expect(msg).toContain('A còn 12');
        expect(msg).toContain('B còn 12');
    });

    it('không set header/footer → KHÔNG ghép mảnh đó vào tin nhắn', () => {
        const msg = formatCountdownMessage([row({ event: 'A' })], '2026-09-19', { body: '{eventName}' })!;
        expect(msg).toBe('A');
    });

    it('chỉ set header (body rỗng) → block mỗi sự kiện vẫn dùng định dạng mặc định', () => {
        const msg = formatCountdownMessage([row({ event: 'A' })], '2026-09-19', { header: 'TIÊU ĐỀ' })!;
        expect(msg.startsWith('TIÊU ĐỀ\n\n')).toBe(true);
        expect(msg).toContain('*A*'); // block mặc định
        expect(msg).toContain('Còn 12 ngày');
        expect(msg).not.toContain('⏳');
    });

    it('không mảnh nào được set → giữ nguyên định dạng mặc định (kèm "⏳")', () => {
        const def = formatCountdownMessage([row()], '2026-09-19')!;
        expect(def).toContain('⏳ *Countdown*');
        expect(formatCountdownMessage([row()], '2026-09-19', {})).toBe(def);
        expect(formatCountdownMessage([row()], '2026-09-19', { header: '', body: '  ', footer: '\n' })).toBe(def);
    });

    it('không có event active → null kể cả khi có mẫu', () => {
        expect(formatCountdownMessage([], '2026-09-19', { header: 'x', body: BODY, footer: 'y' })).toBeNull();
    });
});
