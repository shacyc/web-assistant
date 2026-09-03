import { describe, it, expect } from 'vitest';
import { env } from './helpers';

/**
 * Miniflare nạp `.dev.vars` của máy dev vào test (nó in "Using secrets defined in
 * .dev.vars" mỗi lần chạy). Binding khai trong vitest.config.ts phải THẮNG — nếu không,
 * kết quả test đổi theo từng máy: ai để `ADMIN_AUTH_MODE=access` trong `.dev.vars` sẽ
 * thấy toàn bộ test admin đỏ vì lý do chẳng liên quan gì tới code.
 */
describe('cấu hình test', () => {
    it('binding của vitest.config.ts ghi đè .dev.vars', () => {
        expect(env.BOT_SECRET).toBe('test-bot-secret');
        expect(env.ADMIN_PASSWORD).toBe('test-admin-password');
        expect(env.ADMIN_AUTH_MODE).toBe('password');
        expect(env.TELEGRAM_BOT_TOKEN).toBe('test:token');
    });
});
