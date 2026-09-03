import { Hono } from 'hono';
import type { Env } from './types';
import { fail, serverError } from './lib/respond';
import { botRoutes } from './routes/bot';
import { adminRoutes } from './routes/admin';

const app = new Hono<Env>();

// Không CORS ở đây, và đó là chủ ý: SPA và API cùng một Worker, cùng một origin. Ngày
// nào phải thêm cors() lại thì tức là kiến trúc đã tách origin — xem lại CLAUDE.md trước.

app.use('*', async (c, next) => {
    await next();
    // Trang /bot buộc phải public để AI bot vào được, nhưng không có lý do gì để nó nằm
    // trong index của search engine.
    c.header('X-Robots-Tag', 'noindex, nofollow');
    c.header('X-Content-Type-Options', 'nosniff');
    c.header('Referrer-Policy', 'no-referrer');
});

app.route('/api/bot', botRoutes);
app.route('/api/admin', adminRoutes);

// Chỉ bắt /api/*. Mọi path khác do Static Assets phục vụ (SPA fallback) và không bao giờ
// chạm tới worker — nhờ `run_worker_first: ["/api/*"]` trong wrangler.jsonc.
app.all('/api/*', (c) => fail(c, 404, 'NOT_FOUND', 'Không có endpoint này'));

app.onError((err, c) => serverError(c, err, 'unhandled', { path: c.req.path }));

export default app;
