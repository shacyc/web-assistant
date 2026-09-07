/**
 * Logic thuần cho health-check: từ kết quả một lần gọi HTTP (`Probe`) suy ra `state`
 * ('up' | 'down' | chuỗi tuỳ admin). Không đụng `fetch`, `db`, `Date.now()` — action
 * `actions/healthcheck.ts` lo phần I/O, ở đây chỉ có quyết định.
 *
 * Vì sao tách ra: cùng tinh thần `lib/schedule.ts` — nhánh "sập hay không" là chỗ dễ
 * sai nhất, tách thành hàm thuần thì test được từng luật một mà không cần dựng worker.
 */

/** Chờ tối đa 10s cho một URL. 10ms CPU của Workers Free là *CPU time*, không phải
 *  wall-clock — `await fetch` là I/O nên chờ 10s không tốn CPU. */
export const TIMEOUT_MS = 10_000;

/** Chỉ đọc body khi target có `checkScript`, và cắt ở đây — đọc + escape body mới là
 *  thứ ăn CPU thật. 100KB đủ cho mọi phép kiểm hợp lý. */
export const BODY_MAX = 100_000;

export interface Probe {
    url: string;
    label: string;
    ok: boolean; // res.ok (status 200–299)
    status: number | null; // null = không nhận được response (lỗi mạng / timeout)
    statusText: string;
    body: string; // '' nếu target không có checkScript (không tốn công đọc)
    durationMs: number;
    error: string | null; // câu lỗi mạng/timeout, null nếu có response
}

/**
 * Luật mặc định khi target KHÔNG có `checkScript`: coi là 'down' khi lỗi mạng, timeout,
 * hoặc HTTP >= 400. Mã 4xx cũng tính 'down' — chủ dự án chọn phương án này: một trang
 * trả 404/403 ở URL gốc thường là hỏng cấu hình chứ không phải "còn sống".
 */
export function defaultState(probe: Probe): 'up' | 'down' {
    if (probe.error || probe.status === null) return 'down';
    return probe.status >= 400 ? 'down' : 'up';
}

// Các global rủi ro bị che thành `undefined` trong thân hàm admin. KHÔNG phải sandbox
// thật (một `new Function` vẫn chạm được globalThis qua nhiều đường vòng) — chỉ chặn
// đường thẳng và ghi rõ chủ ý. Chấp nhận được vì chỉ admin, cùng người chạy
// `wrangler deploy`, mới lưu được `checkScript`.
const SHADOWED = ['fetch', 'globalThis', 'self', 'caches', 'crypto', 'WebSocket', 'Request', 'Response', 'importScripts', 'addEventListener'];

export interface ScriptResult {
    state: string;
    scriptError: string | null;
}

/**
 * Chạy `checkScript` của admin. Thân hàm nhận `probe` (bản freeze, để script không
 * sửa chéo dữ liệu action còn dùng) và return một chuỗi state.
 *
 * Mọi đường hỏng — ném lỗi, return không phải chuỗi, return rỗng — đều quy về
 * `state: 'down'` kèm `scriptError`: script hỏng nghĩa là phép kiểm không đáng tin, và
 * chủ dự án nói chỉ quan tâm cảnh báo sập, nên "kêu" còn hơn im lặng bỏ sót.
 */
export function runCheckScript(script: string, probe: Probe): ScriptResult {
    try {
        // eslint-disable-next-line no-new-func
        const fn = new Function('probe', ...SHADOWED, `"use strict";\n${script}`);
        const raw = fn(Object.freeze({ ...probe }), ...SHADOWED.map(() => undefined));
        if (typeof raw !== 'string' || !raw.trim()) {
            return { state: 'down', scriptError: 'checkScript không trả về chuỗi state' };
        }
        return { state: raw.trim(), scriptError: null };
    } catch (err) {
        return { state: 'down', scriptError: `checkScript lỗi: ${err instanceof Error ? err.message : String(err)}` };
    }
}

/** State cuối cùng cho một target: có `checkScript` thì hỏi nó, không thì luật mặc định. */
export function evaluateTarget(
    target: { checkScript: string | null },
    probe: Probe,
): ScriptResult {
    if (target.checkScript && target.checkScript.trim()) {
        return runCheckScript(target.checkScript, probe);
    }
    return { state: defaultState(probe), scriptError: null };
}

/** Câu tóm tắt cho cột `last_detail` (màn Health check đọc). */
export function probeDetail(probe: Probe): string {
    if (probe.error) return `${probe.error} (sau ${probe.durationMs}ms)`;
    return `HTTP ${probe.status} ${probe.statusText}`.trim() + ` · ${probe.durationMs}ms`;
}

export type NotifyMode = 'always' | 'on_change' | 'on_down';
export const NOTIFY_MODES: NotifyMode[] = ['always', 'on_change', 'on_down'];

/**
 * Có gửi Telegram cho một target không, theo `notify_mode` trong `healthcheck_config`.
 *
 * - `always`   — mọi lần kiểm, bất kể đổi hay không.
 * - `on_change`— khi `state` khác lần trước (cả hai chiều: sập VÀ phục hồi).
 * - `on_down`  — chỉ khi `state` đổi VÀ state mới không phải `'up'` (bỏ qua phục hồi).
 *
 * `prev` là `last_state ?? 'up'` — lần kiểm đầu (chưa có `last_state`) coi như đang 'up'.
 * Nhánh "đổi nhưng không gửi" ở `actions/healthcheck.ts` vẫn ghi `last_state`, nên
 * `on_down` không bỏ sót lần sập kế tiếp chỉ vì đã im lặng ở lần phục hồi.
 */
export function shouldNotify(mode: string, prev: string, state: string): boolean {
    if (mode === 'always') return true;
    if (state === prev) return false;
    if (mode === 'on_down') return state !== 'up';
    return true; // on_change: mọi thay đổi
}
