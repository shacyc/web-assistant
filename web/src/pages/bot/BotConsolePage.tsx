import { useEffect, useState } from 'react';
import { listBotActions, botToken, ApiError, type ActionMeta } from '@/lib/apiClient';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ActionCard } from './ActionCard';

export function BotConsolePage({ onLocked }: { onLocked: () => void }) {
    const [actions, setActions] = useState<ActionMeta[] | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        listBotActions()
            .then(({ actions }) => setActions(actions))
            .catch((err) => {
                // Token hết hạn giữa chừng thì đá về cổng, đừng để bot nhìn màn hình trống.
                if (err instanceof ApiError && err.status === 401) {
                    botToken.clear();
                    onLocked();
                    return;
                }
                setError(err instanceof ApiError ? err.message : 'Không tải được danh sách action');
            });
    }, [onLocked]);

    function lock() {
        botToken.clear();
        onLocked();
    }

    return (
        <div className="mx-auto max-w-3xl px-4 py-8">
            <header className="mb-6 flex items-center justify-between">
                <div>
                    <h1 className="text-xl font-semibold">Bot execute</h1>
                    <p className="text-muted-foreground text-sm">Chọn một action, điền form nếu có, rồi ấn Thực thi.</p>
                </div>
                <Button variant="outline" size="sm" data-action="bot.lock" onClick={lock}>
                    Khoá lại
                </Button>
            </header>

            {error && (
                <Alert variant="destructive">
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
            )}

            {actions === null && !error && <p className="text-muted-foreground text-sm">Đang tải…</p>}

            {actions?.length === 0 && <p className="text-muted-foreground text-sm">Chưa có action nào.</p>}

            <div className="flex flex-col gap-4">
                {actions?.map((a) => (
                    <ActionCard key={a.id} action={a} />
                ))}
            </div>
        </div>
    );
}
