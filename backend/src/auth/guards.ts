import { createMiddleware } from 'hono/factory';
import { getCookie } from 'hono/cookie';
import type { Env } from '../types';
import { fail } from '../lib/respond';
import { read } from './session';

/** Bot gắn `Authorization: Bearer <token>` lấy từ POST /api/bot/session. */
export const requireBot = () =>
    createMiddleware<Env>(async (c, next) => {
        const header = c.req.header('Authorization');
        const token = header?.startsWith('Bearer ') ? header.slice(7) : null;
        if (!token) return fail(c, 401, 'UNAUTHORIZED', 'Thiếu token');

        const payload = await read(token, c.env.SESSION_SECRET, 'bot');
        if (!payload) return fail(c, 401, 'UNAUTHORIZED', 'Token không hợp lệ hoặc đã hết hạn');

        await next();
    });

/**
 * Một cổng, hai chiến lược, chọn bằng `ADMIN_AUTH_MODE`.
 *
 * Vì sao chưa mặc định dùng Cloudflare Access: Access gắn được thẳng vào Worker, kể cả
 * trên workers.dev, nhưng đó là công tắc cho CẢ Worker — bật lên thì `/bot` cũng bị
 * chặn, mà `/bot` bắt buộc phải public để AI bot vào được. Access cắt theo path chỉ làm
 * được với self-hosted application trên hostname thuộc zone mình sở hữu. Khi nào có
 * custom domain thì đổi biến này, không phải viết lại route.
 */
export const requireAdmin = () =>
    createMiddleware<Env>(async (c, next) => {
        if (c.env.ADMIN_AUTH_MODE === 'access') {
            const assertion = c.req.header('Cf-Access-Jwt-Assertion');
            if (!assertion) return fail(c, 401, 'UNAUTHORIZED', 'Thiếu Cloudflare Access assertion');
            const ok = await verifyAccessJwt(assertion, c.env);
            if (!ok) return fail(c, 401, 'UNAUTHORIZED', 'Access assertion không hợp lệ');
            await next();
            return;
        }

        const token = getCookie(c, 'admin_session');
        if (!token) return fail(c, 401, 'UNAUTHORIZED', 'Chưa đăng nhập');

        const payload = await read(token, c.env.SESSION_SECRET, 'admin');
        if (!payload) return fail(c, 401, 'UNAUTHORIZED', 'Phiên không hợp lệ hoặc đã hết hạn');

        await next();
    });

/**
 * Verify assertion của Cloudflare Access: RS256, khoá công khai lấy từ JWKS của team.
 * Cache JWKS trong bộ nhớ isolate — mỗi lần fetch là một round-trip ăn vào trần 10ms CPU.
 */
let jwksCache: { keys: CryptoKey[]; fetchedAt: number } | null = null;
const JWKS_TTL_MS = 3600_000;

async function verifyAccessJwt(token: string, env: Env['Bindings']): Promise<boolean> {
    if (!env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD) return false;

    const parts = token.split('.');
    if (parts.length !== 3) return false;
    const [headerB64, payloadB64, signatureB64] = parts;

    let payload: { aud?: string | string[]; exp?: number; iss?: string };
    try {
        payload = JSON.parse(new TextDecoder().decode(b64urlToBytes(payloadB64)));
    } catch {
        return false;
    }

    const now = Math.floor(Date.now() / 1000);
    if (!payload.exp || payload.exp < now) return false;
    if (payload.iss !== `https://${env.ACCESS_TEAM_DOMAIN}`) return false;

    // `aud` của Access là mảng. Không khớp aud = token của MỘT ỨNG DỤNG KHÁC cùng team,
    // và bỏ qua bước này là cho phép bất kỳ app nào trong team vào thẳng admin.
    const auds = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (!auds.includes(env.ACCESS_AUD)) return false;

    const keys = await loadJwks(env.ACCESS_TEAM_DOMAIN);
    const data = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
    const signature = b64urlToBytes(signatureB64);

    for (const key of keys) {
        if (await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, signature, data)) return true;
    }
    return false;
}

async function loadJwks(teamDomain: string): Promise<CryptoKey[]> {
    if (jwksCache && Date.now() - jwksCache.fetchedAt < JWKS_TTL_MS) return jwksCache.keys;

    const res = await fetch(`https://${teamDomain}/cdn-cgi/access/certs`);
    if (!res.ok) throw new Error(`JWKS fetch failed: ${res.status}`);
    const { keys: jwks } = (await res.json()) as { keys: JsonWebKey[] };

    const keys = await Promise.all(
        jwks.map((jwk) =>
            crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']),
        ),
    );
    jwksCache = { keys, fetchedAt: Date.now() };
    return keys;
}

function b64urlToBytes(s: string): Uint8Array {
    const b64 = s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '=');
    const bin = atob(b64);
    return Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
}
