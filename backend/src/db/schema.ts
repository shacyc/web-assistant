import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';

export const countdownEvents = sqliteTable('countdown_events', {
    id: text('id').primaryKey(), // UUID
    event: text('event').notNull(), // tên sự kiện, in đậm trong tin nhắn
    description: text('description'), // nullable — dòng phụ dưới tên

    // Lưu 'YYYY-MM-DD' dạng TEXT, cố ý KHÔNG dùng mode:'timestamp'.
    // Countdown đếm theo ngày, không có giờ. Worker chạy theo giờ UTC; nếu lưu epoch thì
    // ranh giới ngày lệch 7 tiếng so với Asia/Ho_Chi_Minh — từ 0h tới 7h sáng giờ VN sẽ
    // trả sai đúng một ngày. Chuỗi ISO ngày so sánh được bằng '<=' theo thứ tự từ điển,
    // nên vẫn lọc được ngay trong SQL.
    startDate: text('start_date').notNull(),
    endDate: text('end_date').notNull(),

    enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
    createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
}, (table) => [
    // Truy vấn nóng duy nhất: "event nào đang active hôm nay".
    index('countdown_active_idx').on(table.enabled, table.startDate, table.endDate),
]);

// Kho key-value dùng chung cho mọi tính năng. Không phải secret — đây là cấu hình admin
// tự nhập và sửa được qua UI (chat id Telegram, topic id...). Trước đây các giá trị này
// nằm trong secret của Worker; chuyển vào DB để admin đổi đích gửi mà không cần deploy.
// Vẫn KHÔNG chứa thứ thật sự bí mật như bot token — cái đó vẫn là secret.
export const variables = sqliteTable('variables', {
    key: text('key').primaryKey(), // free-form, cho phép khoảng trắng: 'secretary telegram chat id'
    // notNull nhưng cho phép chuỗi rỗng: "chưa đặt giá trị" khác với "không có key".
    value: text('value').notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});

// Bảng một dòng (id luôn = 1). Mỗi tính năng cần cấu hình riêng thì thêm cột ở đây thay
// vì rải cấu hình vào bảng `variables` — người dùng xoá nhầm một dòng key không được làm
// hỏng mapping của countdown.
export const countdownConfig = sqliteTable('countdown_config', {
    id: integer('id').primaryKey(),
    // Trỏ tới `variables.key`. Nullable = chưa cấu hình; countdown.notify sẽ báo lỗi rõ
    // ràng thay vì gửi nhầm chỗ. Cố ý KHÔNG đặt foreign key: đổi tên key trong UI không
    // nên bị chặn bởi ràng buộc, countdown tự kiểm lúc chạy.
    chatIdKey: text('chat_id_key'),
    topicIdKey: text('topic_id_key'),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});

// Lịch chạy tự động. Cloudflare chỉ có MỘT cron trigger (wrangler.jsonc), bắn mỗi 5
// phút; nó không hardcode việc gì mà đọc bảng này rồi chạy job nào tới giờ. Đổi giờ /
// bật tắt job = sửa dòng ở /admin/schedules, KHÔNG deploy. Cùng tinh thần registry của
// trang /bot: cron là hạ tầng, "chạy gì lúc nào" là dữ liệu.
export const schedules = sqliteTable('schedules', {
    id: text('id').primaryKey(), // UUID
    // Trỏ tới action trong registry (src/actions/registry.ts). KHÔNG foreign key — registry
    // là code chứ không phải bảng. Handler `scheduled` ghi log 'error' rồi bỏ qua nếu id lạ.
    actionId: text('action_id').notNull(),
    // JSON các field truyền vào action.run(). '{}' = không field nào. Với countdown.notify
    // đây là chỗ đặt {"dryRun": false}. Không parse được → coi như '{}'.
    payload: text('payload').notNull().default('{}'),
    // 'HH:MM' 24h theo TIMEZONE. So sánh chuỗi '<=' đúng vì luôn zero-pad (giống start_date).
    timeOfDay: text('time_of_day').notNull(),
    enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
    // 'YYYY-MM-DD' lần chạy gần nhất, thành công HAY lỗi. Đây là chốt "mỗi ngày một lần":
    // handler bỏ qua dòng có last_run_date = hôm nay. Job lỗi KHÔNG tự thử lại trong ngày
    // — đánh đổi lấy việc không bao giờ gửi trùng. null = chưa chạy bao giờ.
    lastRunDate: text('last_run_date'),
    lastRunAt: integer('last_run_at', { mode: 'timestamp' }),
    lastRunStatus: text('last_run_status'), // 'ok' | 'error' | null
    lastRunDetail: text('last_run_detail'), // tóm tắt kết quả gần nhất, cho màn Lịch đọc
    createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
}, (table) => [
    // Truy vấn nóng: mỗi 5 phút quét "job nào đang bật, tới giờ chưa".
    index('schedules_due_idx').on(table.enabled, table.timeOfDay),
]);

// Khi một AI bot tự ấn nút, đây là chỗ duy nhất trả lời được "hôm qua nó có chạy không,
// gửi cái gì". Không có bảng này thì mọi lần debug đều phải đoán.
export const executionLogs = sqliteTable('execution_logs', {
    id: text('id').primaryKey(),
    actionId: text('action_id').notNull(), // 'countdown.notify'
    status: text('status').notNull(), // 'ok' | 'skipped' | 'error'
    detail: text('detail'), // tóm tắt kết quả, hoặc message lỗi
    createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
}, (table) => [
    index('logs_created_idx').on(table.createdAt),
]);
