import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

// Bản sao dùng Astryx (Meta design system) thay cho shadcn/ui. Cùng backend, cùng
// hợp đồng API, cùng hợp đồng DOM của trang /bot — chỉ đổi lớp trình bày.
//
// Không proxy '/api': dev chạy bằng `wrangler dev` phục vụ cả SPA lẫn API ở một cổng,
// giống hệt production. `vite build` chỉ sinh ra web-astryx/dist.
//
// Astryx đi theo đường "CSS dựng sẵn" (@astryxdesign/core/astryx.css +
// @astryxdesign/theme-neutral/theme.css) nên KHÔNG cần plugin StyleX / @astryxdesign/build.
export default defineConfig({
    plugins: [react()],
    resolve: { alias: { '@': path.resolve(import.meta.dirname, './src') } },
    build: { outDir: 'dist', emptyOutDir: true },
});
