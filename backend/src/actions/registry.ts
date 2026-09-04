import type { BotAction } from './types';
import { countdownNotify } from './countdownNotify';
import { healthcheckRun } from './healthcheck';

// Thêm tính năng cho bot = thêm một file trong thư mục này + một dòng ở đây.
// Trang bot tự render UI từ metadata, không cần sửa frontend.
const actions: BotAction[] = [countdownNotify, healthcheckRun];

const byId = new Map(actions.map((a) => [a.id, a]));

export function getAction(id: string): BotAction | undefined {
    return byId.get(id);
}

/** Metadata cho trang bot render form. Cố ý KHÔNG trả `run`. */
export function listActions() {
    return actions.map(({ id, label, description, fields }) => ({ id, label, description, fields }));
}
