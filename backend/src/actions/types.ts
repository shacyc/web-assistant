import type { Bindings, Db } from '../types';

/**
 * Mô tả một ô input. Trang bot render form TỪ đây, không hardcode field nào — thêm
 * tính năng mới là thêm một file trong thư mục này, frontend không phải sửa.
 */
export interface ActionField {
    name: string;
    label: string;
    type: 'text' | 'number' | 'boolean' | 'date';
    required: boolean;
    default?: string | number | boolean;
    help?: string; // AI bot đọc dòng này để quyết định điền gì
}

export interface ActionContext {
    db: Db;
    env: Bindings;
    today: string; // 'YYYY-MM-DD' theo TIMEZONE, tính một lần cho cả request
}

export interface ActionResult {
    ok: boolean;
    /** Text ngắn gọn hiển thị cho bot đọc. Đây là thứ bot "nhìn thấy". */
    summary: string;
    /** Dữ liệu thô, để bot phân tích nếu cần. */
    data?: unknown;
}

export interface BotAction {
    id: string; // 'countdown.notify'
    label: string; // nhãn trên nút
    description: string; // bot đọc để biết nút làm gì
    fields: ActionField[]; // [] = nút bấm thuần
    run(ctx: ActionContext, payload: Record<string, unknown>): Promise<ActionResult>;
}
