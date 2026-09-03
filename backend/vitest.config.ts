import { join } from 'node:path';
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-pool-workers';
import { defineConfig } from 'vitest/config';

/**
 * Test chạy trong workerd thật với D1 + rate limiter local, không phải Node giả lập.
 * Nhờ vậy những thứ chỉ tồn tại ở runtime Cloudflare (binding `ratelimits`, D1 batch,
 * `crypto.subtle.timingSafeEqual`) mới kiểm chứng được — lý do chọn pool này thay vì mock.
 *
 * Lưu ý API: từ pool 0.22 (Vitest 4) cấu hình đi qua plugin `cloudflareTest()` chứ
 * KHÔNG còn `defineWorkersConfig` + `test.poolOptions.workers` như các bản trước.
 */
export default defineConfig(async () => {
    // Đọc thẳng thư mục migration của drizzle-kit: schema trong test luôn khớp với
    // schema sẽ apply lên D1, không phải chép tay `CREATE TABLE` lần thứ hai.
    // `import.meta.dirname` chứ không phải './drizzle': đường dẫn tương đối phụ thuộc
    // cwd, mà cwd đổi khi chạy vitest từ root workspace thay vì từ backend/.
    const migrations = await readD1Migrations(join(import.meta.dirname, 'drizzle'));

    return {
        plugins: [
            cloudflareTest({
                // Lấy binding từ chính wrangler.jsonc của production — cấu hình lệch
                // nhau thì test mất ý nghĩa.
                wrangler: { configPath: './wrangler.jsonc' },
                miniflare: {
                    // Pool yêu cầu `nodejs_compat`. Khai ở đây chứ không thêm vào
                    // wrangler.jsonc: đó là nhu cầu của test runner, không phải của worker.
                    compatibilityFlags: ['nodejs_compat'],
                    bindings: {
                        // Production lấy từ secret; test cần giá trị bất kỳ khác rỗng.
                        // Ghi đè luôn `.dev.vars` của máy dev để test không phụ thuộc máy.
                        SESSION_SECRET: 'test-session-secret-do-not-use-anywhere',
                        BOT_SECRET: 'test-bot-secret',
                        ADMIN_PASSWORD: 'test-admin-password',
                        ADMIN_AUTH_MODE: 'password',
                        TELEGRAM_BOT_TOKEN: 'test:token',
                        TELEGRAM_CHAT_ID: '-100123',
                        TELEGRAM_TOPIC_ID: '7',
                        TEST_MIGRATIONS: migrations,
                    },
                },
            }),
        ],
    };
});
