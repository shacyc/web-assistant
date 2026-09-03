import { useState, type FormEvent } from 'react';
import { Play } from 'lucide-react';
import { runBotAction, ApiError, type ActionMeta, type ActionResult } from '@/lib/apiClient';
import { Card } from '@astryxdesign/core/Card';
import { VStack } from '@astryxdesign/core/Stack';
import { Heading, Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Icon } from '@astryxdesign/core/Icon';

/**
 * Render một action TỪ metadata của backend — không hardcode tính năng nào. Thêm action
 * mới ở backend là trang này tự mọc thêm form.
 *
 * Input/nút/kết quả dùng phần tử native + `id`/`name`/`data-action`/`data-testid` ổn
 * định: đây là HỢP ĐỒNG DOM với AI bot (xem bot.css + CLAUDE.md), không được đổi.
 */
export function ActionCard({ action }: { action: ActionMeta }) {
    const initial = Object.fromEntries(
        action.fields.map((f) => [f.name, f.default ?? (f.type === 'boolean' ? false : '')]),
    );
    const [values, setValues] = useState<Record<string, unknown>>(initial);
    const [result, setResult] = useState<ActionResult | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    async function submit(e: FormEvent) {
        e.preventDefault();
        setBusy(true);
        setError(null);
        setResult(null);
        try {
            // Số gửi đi phải là number thật: backend cố ý không ép kiểu, "42" bị từ chối.
            const payload = Object.fromEntries(
                action.fields.map((f) => [f.name, f.type === 'number' ? Number(values[f.name]) : values[f.name]]),
            );
            setResult(await runBotAction(action.id, payload));
        } catch (err) {
            setError(err instanceof ApiError ? `${err.code}: ${err.message}` : 'Không kết nối được máy chủ');
        } finally {
            setBusy(false);
        }
    }

    const status = error ? 'error' : result?.ok ? 'ok' : 'failed';

    return (
        <Card padding={6}>
            <VStack gap={4}>
                <VStack gap={1}>
                    <Heading level={2}>{action.label}</Heading>
                    <Text type="supporting" color="secondary">
                        {action.description}
                    </Text>
                </VStack>

                <form onSubmit={submit}>
                    <VStack gap={4}>
                        {action.fields.map((f) => {
                            const id = `${action.id}.${f.name}`;
                            if (f.type === 'boolean') {
                                return (
                                    <div key={f.name} className="bot-field">
                                        <div className="bot-checkbox">
                                            <input
                                                id={id}
                                                name={f.name}
                                                type="checkbox"
                                                checked={Boolean(values[f.name])}
                                                onChange={(e) =>
                                                    setValues((v) => ({ ...v, [f.name]: e.target.checked }))
                                                }
                                            />
                                            <label htmlFor={id}>{f.label}</label>
                                        </div>
                                        {f.help && <span className="bot-help">{f.help}</span>}
                                    </div>
                                );
                            }
                            return (
                                <div key={f.name} className="bot-field">
                                    <label htmlFor={id}>{f.label}</label>
                                    <input
                                        id={id}
                                        name={f.name}
                                        className="bot-input"
                                        type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text'}
                                        required={f.required}
                                        value={String(values[f.name] ?? '')}
                                        onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
                                    />
                                    {f.help && <span className="bot-help">{f.help}</span>}
                                </div>
                            );
                        })}

                        <Button
                            type="submit"
                            data-action={action.id}
                            label={busy ? 'Đang chạy…' : 'Thực thi'}
                            variant="primary"
                            isLoading={busy}
                            icon={<Icon icon={Play} size="sm" />}
                        />
                    </VStack>
                </form>

                {/* Bot đọc đúng vùng này để biết kết quả. Giữ nguyên data-testid + data-status. */}
                {(result || error) && (
                    <pre
                        className="bot-result"
                        data-testid="action-result"
                        data-action-id={action.id}
                        data-status={status}
                        aria-live="polite"
                    >
                        {error ?? result?.summary}
                    </pre>
                )}
            </VStack>
        </Card>
    );
}
