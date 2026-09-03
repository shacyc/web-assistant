import { useState, type FormEvent } from 'react';
import { IconPlayerPlay } from '@tabler/icons-react';
import { runBotAction, ApiError, type ActionMeta, type ActionResult } from '@/lib/apiClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

/**
 * Render một action TỪ metadata của backend — không hardcode tính năng nào. Thêm action
 * mới ở backend là trang này tự mọc thêm form, frontend không phải sửa.
 */
export function ActionCard({ action }: { action: ActionMeta }) {
    const initial = Object.fromEntries(action.fields.map((f) => [f.name, f.default ?? (f.type === 'boolean' ? false : '')]));
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
        <Card>
            <CardHeader>
                <CardTitle>{action.label}</CardTitle>
                <CardDescription>{action.description}</CardDescription>
            </CardHeader>
            <CardContent>
                <form onSubmit={submit} className="flex flex-col gap-4">
                    {action.fields.map((f) => {
                        const id = `${action.id}.${f.name}`;
                        if (f.type === 'boolean') {
                            return (
                                <div key={f.name} className="flex flex-col gap-1">
                                    <Label htmlFor={id} className="cursor-pointer">
                                        <input
                                            id={id}
                                            name={f.name}
                                            type="checkbox"
                                            className="size-4 cursor-pointer accent-primary"
                                            checked={Boolean(values[f.name])}
                                            onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.checked }))}
                                        />
                                        {f.label}
                                    </Label>
                                    {f.help && <p className="text-muted-foreground pl-6 text-xs">{f.help}</p>}
                                </div>
                            );
                        }
                        return (
                            <div key={f.name} className="flex flex-col gap-2">
                                <Label htmlFor={id}>{f.label}</Label>
                                <Input
                                    id={id}
                                    name={f.name}
                                    type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text'}
                                    required={f.required}
                                    value={String(values[f.name] ?? '')}
                                    onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
                                />
                                {f.help && <p className="text-muted-foreground text-xs">{f.help}</p>}
                            </div>
                        );
                    })}

                    <Button type="submit" data-action={action.id} disabled={busy}>
                        <IconPlayerPlay stroke={2} />
                        {busy ? 'Đang chạy…' : 'Thực thi'}
                    </Button>
                </form>

                {/* Bot đọc đúng vùng này để biết kết quả. Giữ nguyên data-testid.
                   aria-live để người vận hành dùng screen reader biết kết quả vừa hiện;
                   viền trái theo status để người nhìn phân biệt ok / lỗi ngay. */}
                {(result || error) && (
                    <pre
                        data-testid="action-result"
                        data-action-id={action.id}
                        data-status={status}
                        aria-live="polite"
                        className={cn(
                            'bg-muted mt-4 max-h-96 overflow-auto rounded-md border-l-4 p-3 text-xs whitespace-pre-wrap',
                            status === 'ok' ? 'border-l-primary' : 'border-l-destructive',
                        )}
                    >
                        {error ?? result?.summary}
                    </pre>
                )}
            </CardContent>
        </Card>
    );
}
