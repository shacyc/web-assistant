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
