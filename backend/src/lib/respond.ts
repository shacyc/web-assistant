import type { Context } from 'hono';

/**
 * Mọi lỗi trả về đều có `code` máy đọc được, không chỉ `error` cho người đọc.
 * AI bot là client chính ở đây — nó cần phân biệt "sai key" với "hết hạn" mà không phải
 * so khớp chuỗi tiếng Việt.
 */
export interface ErrorBody {
    error: string;
    code: string;
    field?: string;
}

export function fail(c: Context, status: 400 | 401 | 403 | 404 | 409 | 429 | 500, code: string, error: string, field?: string) {
    return c.json<ErrorBody>({ error, code, ...(field ? { field } : {}) }, status);
}

export function invalidBody(c: Context, e: { field: string; reason: string }) {
    return fail(c, 400, 'INVALID_BODY', `${e.field} ${e.reason}`, e.field);
}

/**
 * Lỗi 500 luôn được log kèm ngữ cảnh, còn client chỉ nhận thông báo chung.
 * Chi tiết lỗi rò ra ngoài là món quà cho người dò tìm; log là chỗ của nó.
 */
export function serverError(c: Context, err: unknown, where: string, meta?: Record<string, unknown>) {
    console.error(`[${where}]`, err instanceof Error ? err.stack ?? err.message : err, meta ?? '');
    return fail(c, 500, 'SERVER_ERROR', 'Lỗi máy chủ');
}
