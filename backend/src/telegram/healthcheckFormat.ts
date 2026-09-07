import { escapeMd, fillTemplate } from './format';
import type { Probe } from '../lib/healthcheck';

/**
 * Dựng tin nhắn Telegram cho MỘT lần state đổi. Một lần chạy `healthcheck.run` có thể
 * đẻ ra nhiều tin (mỗi target đổi state là một tin) — gộp lại thành một tin dài thì
 * template mỗi-target mất nghĩa, và số target đổi cùng lúc vốn nhỏ.
 */
export interface StateChange {
    label: string;
    url: string;
    from: string; // state trước ('up' nếu chưa từng check)
    to: string; // state mới
    probe: Probe;
    checkedAt: string; // 'DD/MM/YYYY HH:MM' theo TIMEZONE — action tính sẵn
}

/**
 * Tham số dùng được trong `template`. Giá trị thay vào được `escapeMd` tự động (xem
 * `fillTemplate`); chữ literal admin gõ cũng được escape trừ ký tự markup.
 *
 * | `{label}`         | tên site                                         |
 * | `{url}`           | URL                                              |
 * | `{state}`         | state mới ('up' / 'down' / chuỗi của checkScript) |
 * | `{previousState}` | state trước đó                                    |
 * | `{transition}`    | `'up → down'`, hoặc chỉ `'up'` khi không đổi (chế độ "luôn gửi") |
 * | `{stateEmoji}`    | 🟢 nếu state mới = 'up', 🔴 nếu khác              |
 * | `{statusCode}`    | mã HTTP, hoặc '—' nếu lỗi mạng                    |
 * | `{statusLine}`    | 'HTTP 503' hoặc 'Lỗi: <câu lỗi mạng>'             |
 * | `{error}`         | câu lỗi mạng/timeout, hoặc '—'                    |
 * | `{durationMs}`    | thời gian phản hồi, mili-giây                     |
 * | `{checkedAt}`     | lúc kiểm, DD/MM/YYYY HH:MM                        |
 */
export function templateVars(c: StateChange): Record<string, string> {
    const statusCode = c.probe.status === null ? '—' : String(c.probe.status);
    const statusLine = c.probe.error ? `Lỗi: ${c.probe.error}` : `HTTP ${statusCode}`;
    return {
        label: c.label,
        url: c.url,
        state: c.to,
        previousState: c.from,
        // Chế độ "luôn gửi" có thể gửi cả khi state không đổi → 'up → up' đọc dở.
        transition: c.from === c.to ? c.to : `${c.from} → ${c.to}`,
        stateEmoji: c.to === 'up' ? '🟢' : '🔴',
        statusCode,
        statusLine,
        error: c.probe.error ?? '—',
        durationMs: String(c.probe.durationMs),
        checkedAt: c.checkedAt,
    };
}

/**
 * `template` null/rỗng → định dạng mặc định. Có → admin nắm toàn quyền, `fillTemplate`
 * lo phần escape MarkdownV2.
 */
export function formatHealthcheckMessage(c: StateChange, template: string | null): string {
    const vars = templateVars(c);
    if (template && template.trim()) return fillTemplate(template, vars);

    // Mặc định: một khối gọn, tự escape. Dấu '→', ':' là ký tự reserved của MarkdownV2
    // nên phải qua escapeMd cùng với phần chữ.
    return [
        `${vars.stateEmoji} *${escapeMd(c.label)}*`,
        escapeMd(c.url),
        escapeMd(`${vars.transition} · ${vars.statusLine}`),
        escapeMd(c.checkedAt),
    ].join('\n');
}
