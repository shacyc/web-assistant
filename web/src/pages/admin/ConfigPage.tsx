import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { IconDeviceFloppy, IconAlertTriangle } from '@tabler/icons-react';
import {
    listVariables,
    getCountdownConfig,
    putCountdownConfig,
    ApiError,
    type Variable,
} from '@/lib/apiClient';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

/** Options = key hiện có. Nếu config đang trỏ tới key đã bị xoá, vẫn hiện nó ra để không
 *  âm thầm mất lựa chọn — kèm nhãn cảnh báo. */
function optionKeys(keys: string[], selected: string): string[] {
    return selected && !keys.includes(selected) ? [selected, ...keys] : keys;
}

export function ConfigPage() {
    const [vars, setVars] = useState<Variable[] | null>(null);
    const [chatIdKey, setChatIdKey] = useState('');
    const [topicIdKey, setTopicIdKey] = useState('');
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);

    useEffect(() => {
        Promise.all([listVariables(), getCountdownConfig()])
            .then(([{ variables }, cfg]) => {
                setVars(variables);
                setChatIdKey(cfg.chatIdKey ?? '');
                setTopicIdKey(cfg.topicIdKey ?? '');
            })
            .catch((err) => setError(err instanceof ApiError ? err.message : 'Không tải được cấu hình'))
            .finally(() => setLoading(false));
    }, []);

    const keys = vars?.map((v) => v.key) ?? [];
    const valueOf = (key: string) => vars?.find((v) => v.key === key)?.value;

    function preview(key: string): { text: string; warn: boolean } {
        if (!key) return { text: 'Chưa chọn', warn: true };
        if (!keys.includes(key)) return { text: `Key "${key}" không còn trong Variables`, warn: true };
        const v = valueOf(key);
        if (!v) return { text: 'Key này đang rỗng', warn: true };
        return { text: `→ ${v}`, warn: false };
    }

    async function submit(e: FormEvent) {
        e.preventDefault();
        setBusy(true);
        setError(null);
        setNotice(null);
        try {
            await putCountdownConfig({ chatIdKey: chatIdKey || null, topicIdKey: topicIdKey || null });
            setNotice('Đã lưu cấu hình countdown');
        } catch (err) {
            setError(err instanceof ApiError ? err.message : 'Lưu thất bại');
        } finally {
            setBusy(false);
        }
    }

    if (loading)
        return (
            <p role="status" className="text-muted-foreground p-8 text-sm">
                Đang tải…
            </p>
        );

    const chatPreview = preview(chatIdKey);
    const topicPreview = topicIdKey ? preview(topicIdKey) : null;

    return (
        <div className="mx-auto max-w-xl px-4 py-8">
            <header className="mb-6">
                <h1 className="text-xl font-semibold">Cấu hình</h1>
                <p className="text-muted-foreground text-sm">
                    Chọn key trong{' '}
                    <Link to="/admin/variables" className="text-primary underline-offset-4 hover:underline">
                        Variables
                    </Link>{' '}
                    để mỗi tính năng lấy cấu hình.
                </p>
            </header>

            {error && (
                <Alert variant="destructive" className="mb-4">
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
            )}
            {notice && (
                <Alert className="mb-4">
                    <AlertDescription>{notice}</AlertDescription>
                </Alert>
            )}

            <Card>
                <CardHeader>
                    <CardTitle>Countdown</CardTitle>
                </CardHeader>
                <CardContent>
                    {keys.length === 0 ? (
                        <p className="text-muted-foreground text-sm">
                            Chưa có key nào. Thêm ở màn{' '}
                            <Link to="/admin/variables" className="text-primary underline-offset-4 hover:underline">
                                Variables
                            </Link>{' '}
                            trước.
                        </p>
                    ) : (
                        <form onSubmit={submit} className="flex flex-col gap-5">
                            <div className="flex flex-col gap-2">
                                <Label htmlFor="chatIdKey">Key chứa Telegram chat ID</Label>
                                <Select
                                    id="chatIdKey"
                                    name="chatIdKey"
                                    value={chatIdKey}
                                    onChange={(e) => setChatIdKey(e.target.value)}
                                >
                                    <option value="">— chọn key —</option>
                                    {optionKeys(keys, chatIdKey).map((k) => (
                                        <option key={k} value={k}>
                                            {k}
                                            {keys.includes(k) ? '' : ' (đã xoá)'}
                                        </option>
                                    ))}
                                </Select>
                                <p
                                    className={
                                        chatPreview.warn
                                            ? 'text-destructive text-xs'
                                            : 'text-muted-foreground font-mono text-xs'
                                    }
                                >
                                    {chatPreview.text}
                                </p>
                            </div>

                            <div className="flex flex-col gap-2">
                                <Label htmlFor="topicIdKey">Key chứa Topic ID</Label>
                                <Select
                                    id="topicIdKey"
                                    name="topicIdKey"
                                    value={topicIdKey}
                                    onChange={(e) => setTopicIdKey(e.target.value)}
                                >
                                    <option value="">— không dùng (gửi vào General) —</option>
                                    {optionKeys(keys, topicIdKey).map((k) => (
                                        <option key={k} value={k}>
                                            {k}
                                            {keys.includes(k) ? '' : ' (đã xoá)'}
                                        </option>
                                    ))}
                                </Select>
                                {topicPreview && (
                                    <p
                                        className={
                                            topicPreview.warn
                                                ? 'text-destructive text-xs'
                                                : 'text-muted-foreground font-mono text-xs'
                                        }
                                    >
                                        {topicPreview.text}
                                    </p>
                                )}
                            </div>

                            {!chatIdKey && (
                                <p className="text-muted-foreground flex items-center gap-2 text-xs">
                                    <IconAlertTriangle className="size-4 shrink-0" stroke={2} />
                                    Chưa chọn key chat ID — countdown.notify sẽ báo lỗi thay vì gửi.
                                </p>
                            )}

                            <div className="border-border flex gap-2 border-t pt-4">
                                <Button type="submit" disabled={busy}>
                                    <IconDeviceFloppy stroke={2} />
                                    {busy ? 'Đang lưu…' : 'Lưu'}
                                </Button>
                            </div>

                            <p className="text-muted-foreground text-xs">
                                Sửa giá trị của các key ở màn{' '}
                                <Link to="/admin/variables" className="text-primary underline-offset-4 hover:underline">
                                    Variables
                                </Link>
                                .
                            </p>
                        </form>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
