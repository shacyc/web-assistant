import { sign, verify } from 'hono/jwt';

export type Scope = 'bot' | 'admin';

export interface SessionPayload {
    scope: Scope;
    iat: number;
    exp: number;
}

// Bot: 2 giờ. Đủ cho một phiên làm việc, và ngắn đủ để token rò ra ngoài không sống lâu.
const TTL_SECONDS: Record<Scope, number> = { bot: 2 * 3600, admin: 12 * 3600 };

export async function issue(scope: Scope, secret: string): Promise<{ token: string; expiresAt: number }> {
    const now = Math.floor(Date.now() / 1000);
    const exp = now + TTL_SECONDS[scope];
    const token = await sign({ scope, iat: now, exp } satisfies SessionPayload, secret);
    return { token, expiresAt: exp };
}

/** Trả null cho MỌI lý do thất bại — chữ ký sai, hết hạn, sai scope đều như nhau. */
export async function read(token: string, secret: string, expected: Scope): Promise<SessionPayload | null> {
    try {
        // Ghim thuật toán tường minh. Từ hono 4.13 tham số này bắt buộc, và đó là điều
        // tốt: không ghim thì token tự khai `alg` và mở đường cho đòn đổi thuật toán.
        const payload = (await verify(token, secret, 'HS256')) as unknown as SessionPayload;
        if (payload.scope !== expected) return null;
        return payload;
    } catch {
        // `verify` của hono ném khi hết hạn hoặc chữ ký sai. Không phân biệt ra ngoài:
        // client chỉ cần biết "phải lấy token mới".
        return null;
    }
}

/**
 * So sánh secret theo thời gian hằng định.
 *
 * `===` trên chuỗi thoát ngay ở byte đầu khác nhau. Với một endpoint public như cổng
 * bot, chênh lệch thời gian đó đủ để dò từng ký tự của key. `timingSafeEqual` của
 * Workers yêu cầu hai buffer DÀI BẰNG NHAU, nên phải chặn lệch độ dài trước — và chính
 * việc chặn đó đã rò rỉ độ dài, thứ duy nhất chấp nhận rò.
 */
export function secretEquals(a: string, b: string): boolean {
    const ea = new TextEncoder().encode(a);
    const eb = new TextEncoder().encode(b);
    if (ea.byteLength !== eb.byteLength) return false;
    return crypto.subtle.timingSafeEqual(ea, eb);
}
