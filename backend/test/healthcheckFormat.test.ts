import { describe, it, expect } from 'vitest';
import { formatHealthcheckMessage, templateVars, type StateChange } from '../src/telegram/healthcheckFormat';
import type { Probe } from '../src/lib/healthcheck';

const probe = (over: Partial<Probe>): Probe => ({
    url: 'https://api.example/health',
    label: 'API',
    ok: false,
    status: 503,
    statusText: 'Service Unavailable',
    body: '',
    durationMs: 87,
    error: null,
    ...over,
});

const change = (over: Partial<StateChange> = {}): StateChange => ({
    label: 'API prod',
    url: 'https://api.example/health',
    from: 'up',
    to: 'down',
    probe: probe({}),
    checkedAt: '04/09/2026 15:30',
    ...over,
});

describe('templateVars', () => {
    it('down: emoji đỏ, statusLine theo mã HTTP', () => {
        const v = templateVars(change());
        expect(v.stateEmoji).toBe('🔴');
        expect(v.statusCode).toBe('503');
        expect(v.statusLine).toBe('HTTP 503');
        expect(v.previousState).toBe('up');
        expect(v.state).toBe('down');
    });

    it('lỗi mạng: statusCode "—", statusLine mang câu lỗi', () => {
        const v = templateVars(change({ probe: probe({ status: null, error: 'timeout sau 10s' }) }));
        expect(v.statusCode).toBe('—');
        expect(v.statusLine).toBe('Lỗi: timeout sau 10s');
        expect(v.error).toBe('timeout sau 10s');
    });

    it('recovery: emoji xanh', () => {
        const v = templateVars(change({ from: 'down', to: 'up', probe: probe({ ok: true, status: 200, statusText: 'OK', error: null }) }));
        expect(v.stateEmoji).toBe('🟢');
        expect(v.statusLine).toBe('HTTP 200');
    });

    it('transition: có đổi → "from → to"; không đổi → chỉ "to"', () => {
        expect(templateVars(change({ from: 'up', to: 'down' })).transition).toBe('up → down');
        expect(templateVars(change({ from: 'up', to: 'up' })).transition).toBe('up');
    });
});

describe('formatHealthcheckMessage — mẫu mặc định', () => {
    it('có label, url, mã, và escape MarkdownV2 (dấu chấm được escape)', () => {
        const msg = formatHealthcheckMessage(change(), null);
        expect(msg).toContain('🔴');
        expect(msg).toContain('*API prod*');
        // URL có dấu chấm → phải escape thành '\.', nếu không Telegram trả 400.
        expect(msg).toContain('api\\.example');
        expect(msg).toContain('up → down');
        expect(msg).toContain('503');
    });

    it('recovery dùng 🟢 và previousState → state', () => {
        const msg = formatHealthcheckMessage(
            change({ from: 'down', to: 'up', probe: probe({ ok: true, status: 200, statusText: 'OK', error: null }) }),
            null,
        );
        expect(msg).toContain('🟢');
        expect(msg).toContain('down → up');
    });

    it('không đổi (chế độ Luôn gửi) → hiển thị chỉ state, không phải "up → up"', () => {
        const msg = formatHealthcheckMessage(
            change({ from: 'up', to: 'up', probe: probe({ ok: true, status: 200, statusText: 'OK', error: null }) }),
            null,
        );
        expect(msg).toContain('🟢');
        expect(msg).not.toContain('up → up');
        expect(msg).toContain('up · HTTP 200');
    });
});

describe('formatHealthcheckMessage — mẫu tuỳ chỉnh', () => {
    it('thay {label} {state} {statusCode} {checkedAt}', () => {
        const msg = formatHealthcheckMessage(change(), '{label}: {state} ({statusCode}) lúc {checkedAt}');
        expect(msg).toBe('API prod: down \\(503\\) lúc 04/09/2026 15:30');
    });

    it('tham số lạ {foo} giữ literal (escape thành \\{foo\\}), không làm hỏng tin nhắn', () => {
        const msg = formatHealthcheckMessage(change(), 'x {foo} y');
        expect(msg).toBe('x \\{foo\\} y');
    });

    it('{stateEmoji} và markup * _ giữ nguyên', () => {
        const msg = formatHealthcheckMessage(change(), '{stateEmoji} *{label}*');
        expect(msg).toBe('🔴 *API prod*');
    });
});
