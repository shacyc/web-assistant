/**
 * Cổng DUY NHẤT gọi API. Tuyệt đối không rải `fetch('/api/...')` trong component.
 *
 * Cùng origin với worker, nên base là '/api' ở cả dev lẫn production — không có
 * VITE_API_URL, không có CORS, không có proxy trong vite.
 */

const BASE = '/api';

export class ApiError extends Error {
    // Khai báo field rồi gán trong constructor, KHÔNG dùng parameter property
    // (`constructor(readonly status: number)`). `erasableSyntaxOnly` cấm cú pháp đó vì
    // nó sinh code lúc chạy — mà Vite chỉ strip type, không transform TS thật.
    readonly status: number;
    readonly code: string;
    readonly field?: string;

    constructor(status: number, code: string, message: string, field?: string) {
        super(message);
        this.name = 'ApiError';
        this.status = status;
        this.code = code;
        this.field = field;
    }
}

// Token bot sống trong sessionStorage chứ không localStorage: đóng tab là mất, không
// nằm lại trên máy dùng chung.
const BOT_TOKEN_KEY = 'wa-bot-token';

export const botToken = {
    get: () => sessionStorage.getItem(BOT_TOKEN_KEY),
    set: (t: string) => sessionStorage.setItem(BOT_TOKEN_KEY, t),
    clear: () => sessionStorage.removeItem(BOT_TOKEN_KEY),
};

async function request<T>(method: string, path: string, body?: unknown, auth: 'bot' | 'admin' = 'admin'): Promise<T> {
    const headers: Record<string, string> = {};
    if (body !== undefined) headers['content-type'] = 'application/json';

    if (auth === 'bot') {
        const t = botToken.get();
        if (t) headers.Authorization = `Bearer ${t}`;
    }

    const res = await fetch(`${BASE}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        // Cookie admin là HttpOnly + SameSite=Strict; 'same-origin' là đủ và đúng.
        credentials: 'same-origin',
    });

    if (!res.ok) {
        const parsed = (await res.json().catch(() => null)) as { error?: string; code?: string; field?: string } | null;
        throw new ApiError(res.status, parsed?.code ?? 'UNKNOWN', parsed?.error ?? `HTTP ${res.status}`, parsed?.field);
    }

    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
}

/* ---------- Bot ---------- */

export interface ActionField {
    name: string;
    label: string;
    type: 'text' | 'number' | 'boolean' | 'date';
    required: boolean;
    default?: string | number | boolean;
    help?: string;
}

export interface ActionMeta {
    id: string;
    label: string;
    description: string;
    fields: ActionField[];
}

export interface ActionResult {
    ok: boolean;
    summary: string;
    data?: unknown;
}

export async function openBotSession(secret: string): Promise<void> {
    const { token } = await request<{ token: string; expiresAt: number }>('POST', '/bot/session', { secret }, 'bot');
    botToken.set(token);
}

export const listBotActions = () => request<{ actions: ActionMeta[] }>('GET', '/bot/actions', undefined, 'bot');

export const runBotAction = (id: string, payload: Record<string, unknown>) =>
    request<ActionResult>('POST', `/bot/actions/${encodeURIComponent(id)}/run`, { payload }, 'bot');

/* ---------- Admin ---------- */

export interface CountdownEvent {
    id: string;
    event: string;
    description: string | null;
    startDate: string;
    endDate: string;
    enabled: boolean;
    // Drizzle mode:'timestamp' trả về Date, và c.json() serialize Date thành chuỗi ISO.
    // Không phải số epoch — đừng nhân 1000.
    createdAt: string | null;
    updatedAt: string | null;
}

export interface ExecutionLog {
    id: string;
    actionId: string;
    status: string;
    detail: string | null;
    createdAt: string | null; // chuỗi ISO, xem ghi chú ở CountdownEvent
}

export const adminLogin = (password: string) => request<{ ok: true }>('POST', '/admin/session', { password });
export const adminLogout = () => request<{ ok: true }>('POST', '/admin/logout');
export const adminMe = () => request<{ ok: true; mode: string }>('GET', '/admin/me');

export const listCountdowns = () => request<{ countdowns: CountdownEvent[] }>('GET', '/admin/countdowns');

export type CountdownInput = {
    event: string;
    description: string | null;
    startDate: string;
    endDate: string;
    enabled: boolean;
};

export const createCountdown = (input: CountdownInput) => request<{ id: string }>('POST', '/admin/countdowns', input);

export const updateCountdown = (id: string, patch: Partial<CountdownInput>) =>
    request<{ ok: true }>('PATCH', `/admin/countdowns/${id}`, patch);

export const deleteCountdown = (id: string) => request<{ ok: true }>('DELETE', `/admin/countdowns/${id}`);

export const listLogs = () => request<{ logs: ExecutionLog[] }>('GET', '/admin/logs');
export const clearLogs = () => request<{ ok: true }>('DELETE', '/admin/logs');

/* ---------- Variables: kho key-value ---------- */

export interface Variable {
    key: string;
    value: string;
    // Drizzle mode:'timestamp' → Date → chuỗi ISO qua c.json(). Xem ghi chú ở CountdownEvent.
    updatedAt: string | null;
}

export const listVariables = () => request<{ variables: Variable[] }>('GET', '/admin/variables');

// Key có thể chứa khoảng trắng → phải encode. Upsert: có key thì cập nhật, chưa có thì tạo.
export const putVariable = (key: string, value: string) =>
    request<{ ok: true }>('PUT', `/admin/variables/${encodeURIComponent(key)}`, { value });

export const deleteVariable = (key: string) =>
    request<{ ok: true }>('DELETE', `/admin/variables/${encodeURIComponent(key)}`);

export type ImportMode = 'merge' | 'replace';

export const importVariables = (mode: ImportMode, variables: Record<string, string>) =>
    request<{ ok: true; mode: ImportMode; count: number }>('POST', '/admin/variables/import', { mode, variables });

/* ---------- Cấu hình countdown ---------- */

export interface CountdownConfig {
    chatIdKey: string | null;
    topicIdKey: string | null;
    // Ba mảnh mẫu tin nhắn admin tự soạn. Null/rỗng = không ghép mảnh đó; cả ba null = mẫu
    // mặc định. `header`/`footer` ghép một lần ({today}, {count}); `template` mỗi sự kiện.
    header: string | null;
    template: string | null;
    footer: string | null;
}

export const getCountdownConfig = () => request<CountdownConfig>('GET', '/admin/countdown-config');

export const putCountdownConfig = (cfg: CountdownConfig) =>
    request<{ ok: true }>('PUT', '/admin/countdown-config', cfg);

/* ---------- Lịch chạy tự động ---------- */

export type ScheduleKind = 'daily' | 'weekly' | 'monthly' | 'interval' | 'cron' | 'every';

export interface Schedule {
    id: string;
    actionId: string;
    // JSON đã stringify (bảng lưu TEXT). Form dựng lại từ đây; nơi khác chỉ hiển thị.
    payload: string;
    kind: ScheduleKind;
    timeOfDay: string; // 'HH:MM' theo giờ VN — kiểu 'cron' không dùng (lưu '00:00')
    daysOfWeek: string | null; // CSV ISO '1,3,5' (1 = Thứ Hai), kiểu 'weekly'
    dayOfMonth: number | null; // 1..31, kiểu 'monthly'
    intervalDays: number | null; // >= 1, kiểu 'interval'
    anchorDate: string | null; // 'YYYY-MM-DD', mốc đếm kiểu 'interval'
    cron: string | null; // biểu thức 5 trường (giờ VN), kiểu 'cron'
    intervalSeconds: number | null; // khoảng giây, kiểu 'every'
    enabled: boolean;
    lastRunDate: string | null; // 'YYYY-MM-DD'
    lastRunSlot: string | null; // nhịp 5 phút gần nhất kiểu 'cron' đã chạy
    lastRunAt: string | null; // ISO, xem ghi chú ở CountdownEvent
    lastRunStatus: string | null; // 'ok' | 'error' | null
    lastRunDetail: string | null;
    createdAt: string | null;
    updatedAt: string | null;
}

// Chỉ gửi field hợp với `kind`; backend null hoá phần còn lại.
export type ScheduleInput = {
    actionId: string;
    kind: ScheduleKind;
    timeOfDay?: string;
    daysOfWeek?: number[];
    dayOfMonth?: number;
    intervalDays?: number;
    anchorDate?: string;
    cron?: string;
    intervalSeconds?: number;
    payload: Record<string, unknown>;
    enabled: boolean;
};

// `actions` là cùng metadata trang /bot dùng — kèm sẵn để form dựng ô payload mà không
// phải gọi thêm lượt (và không cần bot token).
export const listSchedules = () =>
    request<{ schedules: Schedule[]; actions: ActionMeta[] }>('GET', '/admin/schedules');

export const createSchedule = (input: ScheduleInput) =>
    request<{ id: string }>('POST', '/admin/schedules', input);

export const updateSchedule = (id: string, patch: Partial<ScheduleInput>) =>
    request<{ ok: true }>('PATCH', `/admin/schedules/${id}`, patch);

export const deleteSchedule = (id: string) => request<{ ok: true }>('DELETE', `/admin/schedules/${id}`);

// "Chạy ngay": luôn 200 kèm {ok, summary} — không đụng last_run_date, lịch tự động vẫn chạy.
export const runSchedule = (id: string) =>
    request<{ ok: boolean; summary: string }>('POST', `/admin/schedules/${id}/run`);
