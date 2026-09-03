import type { DrizzleD1Database } from 'drizzle-orm/d1';
import type * as schema from './db/schema';

export interface RateLimiter {
    limit(options: { key: string }): Promise<{ success: boolean }>;
}

export interface Bindings {
    assistant_db: D1Database;
    ASSETS: Fetcher;

    BOT_LOGIN_LIMITER: RateLimiter;
    BOT_RUN_LIMITER: RateLimiter;
    ADMIN_LOGIN_LIMITER: RateLimiter;

    // vars
    TIMEZONE: string;
    ADMIN_AUTH_MODE: 'password' | 'access';
    ACCESS_TEAM_DOMAIN?: string; // chỉ cần khi ADMIN_AUTH_MODE=access
    ACCESS_AUD?: string;

    // secrets — nạp bằng `wrangler secret put`, không bao giờ đặt vào vars
    SESSION_SECRET: string;
    BOT_SECRET: string;
    ADMIN_PASSWORD: string;
    TELEGRAM_BOT_TOKEN: string;
    TELEGRAM_CHAT_ID: string;
    TELEGRAM_TOPIC_ID?: string; // id topic của forum group; bỏ trống = gửi vào "General"
}

export interface Env {
    Bindings: Bindings;
}

export type Db = DrizzleD1Database<typeof schema>;
