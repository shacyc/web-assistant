export interface SendResult {
    ok: boolean;
    error?: string;
}

/**
 * Gửi một tin nhắn qua Bot API.
 *
 * `botToken` là secret của Worker. `chatId` đến từ bảng `variables` do admin đặt (qua
 * cổng đã xác thực), KHÔNG bao giờ từ request của bot — nếu chat_id đi qua payload thì
 * bất kỳ ai vào được trang bot cũng biến bot thành công cụ spam vào nhóm tuỳ ý.
 */
export async function sendTelegram(
    botToken: string,
    chatId: string,
    text: string,
    threadId?: string,
): Promise<SendResult> {
    if (!botToken || !chatId) {
        return { ok: false, error: 'Thiếu bot token (secret) hoặc chat id (bảng variables)' };
    }

    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
            chat_id: chatId,
            // Nhóm forum: không có message_thread_id thì Telegram gửi vào "General". Chỉ
            // gắn khi có cấu hình — group thường (không bật Topics) mà gửi kèm sẽ 400.
            ...(threadId ? { message_thread_id: Number(threadId) } : {}),
            text,
            parse_mode: 'MarkdownV2',
            disable_web_page_preview: true,
        }),
    });

    if (!res.ok) {
        // Telegram trả JSON có `description` giải thích rất cụ thể (thường là lỗi escape
        // MarkdownV2). Giữ nguyên câu đó, đừng nuốt — nó là manh mối debug duy nhất.
        const body = await res.text().catch(() => '');
        return { ok: false, error: `Telegram ${res.status}: ${body.slice(0, 300)}` };
    }
    return { ok: true };
}
