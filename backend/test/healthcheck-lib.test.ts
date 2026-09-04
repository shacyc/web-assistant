import { describe, it, expect } from 'vitest';
import { defaultState, runCheckScript, evaluateTarget, probeDetail, type Probe } from '../src/lib/healthcheck';

const base: Probe = {
    url: 'https://x.example',
    label: 'X',
    ok: true,
    status: 200,
    statusText: 'OK',
    body: '',
    durationMs: 12,
    error: null,
};
const p = (over: Partial<Probe>): Probe => ({ ...base, ...over });

describe('defaultState — luật mặc định khi không có checkScript', () => {
    it('lỗi mạng → down', () => {
        expect(defaultState(p({ status: null, error: 'lỗi mạng: fail', ok: false }))).toBe('down');
    });
    it('status null (không response) → down', () => {
        expect(defaultState(p({ status: null, ok: false }))).toBe('down');
    });
    it('200 → up', () => expect(defaultState(p({ status: 200 }))).toBe('up'));
    it('301 → up', () => expect(defaultState(p({ status: 301, ok: false }))).toBe('up'));
    it('399 → up, 400 → down (ranh giới)', () => {
        expect(defaultState(p({ status: 399, ok: false }))).toBe('up');
        expect(defaultState(p({ status: 400, ok: false }))).toBe('down');
    });
    it('404 → down (chủ dự án chọn tính 4xx là sập)', () => {
        expect(defaultState(p({ status: 404, ok: false }))).toBe('down');
    });
    it('500 / 503 → down', () => {
        expect(defaultState(p({ status: 500, ok: false }))).toBe('down');
        expect(defaultState(p({ status: 503, ok: false }))).toBe('down');
    });
});

describe('runCheckScript — hàm JS của admin', () => {
    it('return chuỗi state, được trim', () => {
        expect(runCheckScript('return "  up  "', base)).toEqual({ state: 'up', scriptError: null });
    });

    it('đọc được probe.status / probe.body', () => {
        const r = runCheckScript('return probe.status === 200 && probe.body.includes("ok") ? "up" : "down"', p({ body: '{"ok":true}' }));
        expect(r.state).toBe('up');
    });

    it('return không phải chuỗi → down + scriptError', () => {
        const r = runCheckScript('return 123', base);
        expect(r.state).toBe('down');
        expect(r.scriptError).toContain('chuỗi');
    });

    it('return rỗng → down + scriptError', () => {
        expect(runCheckScript('return "   "', base).state).toBe('down');
    });

    it('ném lỗi → down + scriptError mang câu lỗi', () => {
        const r = runCheckScript('throw new Error("bể rồi")', base);
        expect(r.state).toBe('down');
        expect(r.scriptError).toContain('bể rồi');
    });

    it('fetch bị che thành undefined trong thân hàm', () => {
        const r = runCheckScript('return typeof fetch', base);
        // typeof undefined === 'undefined' → không phải 'up' → coi như down, nhưng điều
        // quan trọng: script KHÔNG gọi được fetch thật.
        expect(r.state).toBe('undefined');
        const r2 = runCheckScript('fetch("https://evil.example"); return "up"', base);
        expect(r2.state).toBe('down'); // gọi fetch → TypeError (undefined) → catch
    });

    it('globalThis bị che', () => {
        expect(runCheckScript('return typeof globalThis', base).state).toBe('undefined');
    });

    it('probe truyền vào bị freeze — script sửa không ảnh hưởng bên ngoài', () => {
        const probe = p({ status: 200 });
        runCheckScript('probe.status = 500; return "up"', probe);
        expect(probe.status).toBe(200);
    });
});

describe('evaluateTarget', () => {
    it('không có checkScript → dùng defaultState', () => {
        expect(evaluateTarget({ checkScript: null }, p({ status: 503, ok: false })).state).toBe('down');
    });
    it('checkScript rỗng/space → vẫn dùng defaultState', () => {
        expect(evaluateTarget({ checkScript: '   ' }, p({ status: 200 })).state).toBe('up');
    });
    it('có checkScript → hàm quyết định (kể cả ngược luật mặc định)', () => {
        // 500 nhưng admin coi là ổn.
        expect(evaluateTarget({ checkScript: 'return "up"' }, p({ status: 500, ok: false })).state).toBe('up');
    });
});

describe('probeDetail', () => {
    it('có response → HTTP + thời gian', () => {
        expect(probeDetail(p({ status: 200, statusText: 'OK', durationMs: 143 }))).toBe('HTTP 200 OK · 143ms');
    });
    it('lỗi mạng → câu lỗi + thời gian', () => {
        expect(probeDetail(p({ status: null, error: 'timeout sau 10s', durationMs: 10000 }))).toContain('timeout sau 10s');
    });
});
