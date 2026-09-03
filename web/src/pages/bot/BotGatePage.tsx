import { useState, type FormEvent } from 'react';
import { openBotSession, ApiError } from '@/lib/apiClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';

/**
 * Cổng vào trang bot. Trang này public — ai cũng tải được HTML — nhưng không có API nào
 * trả dữ liệu trước khi đổi được secret lấy token.
 *
 * `id`/`name` ở đây là hợp đồng với AI bot, không phải chi tiết trình bày. Đổi tên =
 * breaking change. Xem CLAUDE.md.
 */
export function BotGatePage({ onUnlocked }: { onUnlocked: () => void }) {
    const [secret, setSecret] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    async function submit(e: FormEvent) {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
            await openBotSession(secret);
            onUnlocked();
        } catch (err) {
            setError(err instanceof ApiError ? err.message : 'Không kết nối được máy chủ');
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="mx-auto flex min-h-dvh max-w-md items-center px-4">
            <Card className="w-full">
                <CardHeader>
                    <CardTitle>Bot execute</CardTitle>
                    <CardDescription>Nhập secret key để mở bảng điều khiển.</CardDescription>
                </CardHeader>
                <CardContent>
                    <form onSubmit={submit} className="flex flex-col gap-4">
                        <div className="flex flex-col gap-2">
                            <Label htmlFor="secret">Secret key</Label>
                            <Input
                                id="secret"
                                name="secret"
                                type="password"
                                autoComplete="off"
                                value={secret}
                                onChange={(e) => setSecret(e.target.value)}
                                required
                            />
                        </div>

                        {error && (
                            <Alert variant="destructive" data-testid="gate-error">
                                <AlertDescription>{error}</AlertDescription>
                            </Alert>
                        )}

                        <Button type="submit" data-action="bot.unlock" disabled={busy || !secret}>
                            {busy ? 'Đang kiểm tra…' : 'Mở khoá'}
                        </Button>
                    </form>
                </CardContent>
            </Card>
        </div>
    );
}
