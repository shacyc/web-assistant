import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { adminLogin, adminMe, ApiError } from '@/lib/apiClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';

/**
 * Chỉ là lớp trải nghiệm — cổng thật nằm ở `requireAdmin()` trên worker. Đừng bao giờ
 * coi việc render được component con là bằng chứng đã xác thực.
 */
export function AdminGate({ children }: { children: ReactNode }) {
    const [state, setState] = useState<'checking' | 'in' | 'out'>('checking');
    const [password, setPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        adminMe()
            .then(() => setState('in'))
            .catch(() => setState('out'));
    }, []);

    async function submit(e: FormEvent) {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
            await adminLogin(password);
            setState('in');
        } catch (err) {
            setError(err instanceof ApiError ? err.message : 'Không kết nối được máy chủ');
        } finally {
            setBusy(false);
        }
    }

    if (state === 'checking') return <p className="text-muted-foreground p-8 text-sm">Đang kiểm tra phiên…</p>;
    if (state === 'in') return <>{children}</>;

    return (
        <div className="mx-auto flex min-h-dvh max-w-md items-center px-4">
            <Card className="w-full">
                <CardHeader>
                    <CardTitle>Admin</CardTitle>
                    <CardDescription>Đăng nhập để quản lý dữ liệu.</CardDescription>
                </CardHeader>
                <CardContent>
                    <form onSubmit={submit} className="flex flex-col gap-4">
                        <div className="flex flex-col gap-2">
                            <Label htmlFor="admin-password">Mật khẩu</Label>
                            <Input
                                id="admin-password"
                                name="password"
                                type="password"
                                autoComplete="current-password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                            />
                        </div>
                        {error && (
                            <Alert variant="destructive">
                                <AlertDescription>{error}</AlertDescription>
                            </Alert>
                        )}
                        <Button type="submit" disabled={busy || !password}>
                            {busy ? 'Đang vào…' : 'Đăng nhập'}
                        </Button>
                    </form>
                </CardContent>
            </Card>
        </div>
    );
}
