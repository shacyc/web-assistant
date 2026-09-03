import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

// Không có proxy '/api' ở đây, và đó là chủ ý: dev chạy bằng `wrangler dev`, nơi worker
// serve cả SPA lẫn API ở cùng một cổng — giống hệt production. `vite build` chỉ có việc
// sinh ra web/dist cho Static Assets đọc.
export default defineConfig({
    plugins: [react(), tailwindcss()],
    // shadcn/ui bắt buộc alias này. (ummi-reader dùng import tương đối, ở đây phải lệch.)
    resolve: { alias: { '@': path.resolve(import.meta.dirname, './src') } },
    build: { outDir: 'dist', emptyOutDir: true },
});
