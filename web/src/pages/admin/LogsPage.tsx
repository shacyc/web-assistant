import { useEffect, useState } from 'react';
import { listLogs, ApiError, type ExecutionLog } from '@/lib/apiClient';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

export function LogsPage() {
    const [rows, setRows] = useState<ExecutionLog[] | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        listLogs()
            .then(({ logs }) => setRows(logs))
            .catch((err) => setError(err instanceof ApiError ? err.message : 'Không tải được nhật ký'));
    }, []);

    return (
        <div className="mx-auto max-w-4xl px-4 py-8">
            <header className="mb-6">
                <h1 className="text-xl font-semibold">Nhật ký thực thi</h1>
            </header>

            {error && (
                <Alert variant="destructive" className="mb-4">
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
            )}
            {rows === null && !error && (
                <p role="status" className="text-muted-foreground text-sm">
                    Đang tải…
                </p>
            )}
            {rows?.length === 0 && <p className="text-muted-foreground text-sm">Bot chưa chạy lần nào.</p>}

            {rows && rows.length > 0 && (
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Thời điểm</TableHead>
                            <TableHead>Action</TableHead>
                            <TableHead>Kết quả</TableHead>
                            <TableHead>Chi tiết</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {rows.map((log) => (
                            <TableRow key={log.id}>
                                <TableCell className="whitespace-nowrap tabular-nums">
                                    {log.createdAt ? new Date(log.createdAt).toLocaleString('vi-VN') : '—'}
                                </TableCell>
                                <TableCell className="font-mono text-xs">{log.actionId}</TableCell>
                                <TableCell>
                                    <Badge variant={log.status === 'ok' ? 'default' : 'destructive'}>{log.status}</Badge>
                                </TableCell>
                                {/* truncate để hàng không giãn; title cho xem đủ khi rê chuột
                                   — detail có thể chứa lý do lỗi nên không được mất hẳn. */}
                                <TableCell
                                    className="text-muted-foreground max-w-md truncate text-xs"
                                    title={log.detail ?? undefined}
                                >
                                    {log.detail}
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            )}
        </div>
    );
}
