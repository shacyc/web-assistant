import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listLogs, ApiError, type ExecutionLog } from '@/lib/apiClient';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
            <header className="mb-6 flex items-center justify-between">
                <h1 className="text-xl font-semibold">Nhật ký thực thi</h1>
                <Link to="/admin">
                    <Button variant="outline" size="sm">Quay lại</Button>
                </Link>
            </header>

            {error && <p className="text-destructive text-sm">{error}</p>}
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
                                <TableCell className="text-muted-foreground max-w-md truncate text-xs">
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
