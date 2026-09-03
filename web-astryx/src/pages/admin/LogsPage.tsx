import { useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { listLogs, clearLogs, ApiError, type ExecutionLog } from '@/lib/apiClient';
import { HStack } from '@astryxdesign/core/Stack';
import { Heading, Text } from '@astryxdesign/core/Text';
import { Badge } from '@astryxdesign/core/Badge';
import { Button } from '@astryxdesign/core/Button';
import { Icon } from '@astryxdesign/core/Icon';
import { Spinner } from '@astryxdesign/core/Spinner';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { Table, proportional, pixel } from '@astryxdesign/core/Table';
import type { TableColumn } from '@astryxdesign/core/Table';
import { PageBody } from '@/components/layout/PageBody';
import { FeedbackError } from '@/components/Feedback';
import { ConfirmDialog } from '@/components/ConfirmDialog';

// Table<T> đòi `T extends Record<string, unknown>` — bọc lại thay vì đụng apiClient.ts.
interface LogRow extends ExecutionLog {
    [key: string]: unknown;
}

export function LogsPage() {
    const [rows, setRows] = useState<ExecutionLog[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [busy, setBusy] = useState(false);

    function reload() {
        listLogs()
            .then(({ logs }) => setRows(logs))
            .catch((err) => setError(err instanceof ApiError ? err.message : 'Không tải được nhật ký'));
    }

    useEffect(reload, []);

    async function empty() {
        setBusy(true);
        setError(null);
        try {
            await clearLogs();
            reload();
        } catch (err) {
            setError(err instanceof ApiError ? err.message : 'Xoá thất bại');
        } finally {
            setBusy(false);
            setConfirmOpen(false);
        }
    }

    const columns: TableColumn<LogRow>[] = [
        {
            key: 'createdAt',
            header: 'Thời điểm',
            width: pixel(180),
            renderCell: (log) => (
                <Text type="body" hasTabularNumbers>
                    {log.createdAt ? new Date(log.createdAt).toLocaleString('vi-VN') : '—'}
                </Text>
            ),
        },
        {
            key: 'actionId',
            header: 'Action',
            width: pixel(160),
            renderCell: (log) => (
                <Text type="code" size="sm">
                    {log.actionId}
                </Text>
            ),
        },
        {
            key: 'status',
            header: 'Kết quả',
            width: pixel(110),
            renderCell: (log) => (
                <Badge variant={log.status === 'ok' ? 'success' : 'error'} label={log.status} />
            ),
        },
        {
            key: 'detail',
            header: 'Chi tiết',
            width: proportional(3),
            // detail có thể chứa lý do lỗi — cho Text tự cắt + hiện tooltip khi rê chuột.
            renderCell: (log) => (
                <Text type="supporting" color="secondary" maxLines={2}>
                    {log.detail}
                </Text>
            ),
        },
    ];

    return (
        <PageBody>
            <HStack gap={3} vAlign="center" hAlign="between" wrap="wrap">
                <Heading level={1}>Nhật ký thực thi</Heading>
                <Button
                    label="Dọn nhật ký"
                    variant="secondary"
                    size="sm"
                    onClick={() => setConfirmOpen(true)}
                    isDisabled={!rows || rows.length === 0}
                    icon={<Icon icon={Trash2} size="sm" color="error" />}
                />
            </HStack>

            {error && <FeedbackError>{error}</FeedbackError>}
            {rows === null && !error && <Spinner label="Đang tải…" />}
            {rows?.length === 0 && <EmptyState title="Bot chưa chạy lần nào" />}

            {rows && rows.length > 0 && (
                <Table<LogRow>
                    data={rows as LogRow[]}
                    columns={columns}
                    idKey="id"
                    density="balanced"
                    dividers="rows"
                    textOverflow="truncate"
                />
            )}

            <ConfirmDialog
                isOpen={confirmOpen}
                title="Dọn nhật ký"
                message="Xoá sạch toàn bộ nhật ký thực thi? Không khôi phục được."
                confirmLabel="Xoá hết"
                tone="destructive"
                isBusy={busy}
                onConfirm={empty}
                onOpenChange={setConfirmOpen}
            />
        </PageBody>
    );
}
