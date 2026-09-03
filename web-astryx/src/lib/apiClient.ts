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
}

export const getCountdownConfig = () => request<CountdownConfig>('GET', '/admin/countdown-config');

export const putCountdownConfig = (cfg: CountdownConfig) =>
    request<{ ok: true }>('PUT', '/admin/countdown-config', cfg);
