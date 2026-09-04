import { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, Settings2 } from 'lucide-react';
import { listCountdowns, deleteCountdown, ApiError, type CountdownEvent } from '@/lib/apiClient';
import { HStack, VStack } from '@astryxdesign/core/Stack';
import { Heading, Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Badge } from '@astryxdesign/core/Badge';
import { Icon } from '@astryxdesign/core/Icon';
import { Spinner } from '@astryxdesign/core/Spinner';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { Table, proportional, pixel } from '@astryxdesign/core/Table';
import type { TableColumn } from '@astryxdesign/core/Table';
import { PageBody } from '@/components/layout/PageBody';
import { FeedbackError } from '@/components/Feedback';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { CountdownFormDialog } from './CountdownFormDialog';
import { CountdownConfigDialog } from './CountdownConfigDialog';

/** Cùng cách tính "hôm nay" với backend, để admin nhìn thấy đúng thứ bot sẽ gửi. */
const todayVN = () =>
    new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Ho_Chi_Minh',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).format(new Date());

type BadgeVariant = 'neutral' | 'info' | 'success';

// Table<T> đòi `T extends Record<string, unknown>`; interface API không có index
// signature nên bọc lại ở đây thay vì đụng apiClient.ts (bản sao nguyên văn).
interface CountdownRow extends CountdownEvent {
    [key: string]: unknown;
}

function phaseOf(row: CountdownEvent, today: string): { label: string; variant: BadgeVariant } {
    if (!row.enabled) return { label: 'Tắt', variant: 'neutral' };
    if (today < row.startDate) return { label: 'Chưa tới', variant: 'info' };
    if (today > row.endDate) return { label: 'Đã xong', variant: 'neutral' };
    return { label: 'Đang chạy', variant: 'success' };
}

export function CountdownListPage() {
    const [rows, setRows] = useState<CountdownEvent[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    // Form tạo/sửa là modal ngay trên trang này — không còn route riêng.
    // dialogOpen tách khỏi `editing` để lúc đóng vẫn giữ nội dung cũ (không nhấp nháy).
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editing, setEditing] = useState<CountdownEvent | null>(null);
    // Dialog cấu hình gửi (chat/topic key + mẫu tin nhắn) — không đụng danh sách sự kiện.
    const [configOpen, setConfigOpen] = useState(false);
    // Dòng đang chờ xác nhận xoá (null = không mở dialog xoá).
    const [pendingDelete, setPendingDelete] = useState<CountdownEvent | null>(null);
    const [deleting, setDeleting] = useState(false);
    const today = todayVN();

    function openCreate() {
        setEditing(null);
        setError(null);
        setDialogOpen(true);
    }

    function openEdit(row: CountdownEvent) {
        setEditing(row);
        setError(null);
        setDialogOpen(true);
    }

    function reload() {
        listCountdowns()
            .then(({ countdowns }) => setRows(countdowns))
            .catch((err) => setError(err instanceof ApiError ? err.message : 'Không tải được dữ liệu'));
    }

    useEffect(reload, []);

    async function confirmDelete() {
        if (!pendingDelete) return;
        setDeleting(true);
        setError(null);
        try {
            await deleteCountdown(pendingDelete.id);
            reload();
        } catch (err) {
            setError(err instanceof ApiError ? err.message : 'Xoá thất bại');
        } finally {
            setDeleting(false);
            setPendingDelete(null);
        }
    }

    const columns: TableColumn<CountdownRow>[] = [
        {
            key: 'event',
            header: 'Sự kiện',
            width: proportional(3),
            renderCell: (row) => (
                <VStack gap={0}>
                    <Text type="body" weight="medium">
                        {row.event}
                    </Text>
                    {row.description && (
                        <Text type="supporting" color="secondary">
                            {row.description}
                        </Text>
                    )}
                </VStack>
            ),
        },
        {
            key: 'startDate',
            header: 'Bắt đầu',
            width: pixel(120),
            renderCell: (row) => (
                <Text type="body" hasTabularNumbers>
                    {row.startDate}
                </Text>
            ),
        },
        {
            key: 'endDate',
            header: 'Kết thúc',
            width: pixel(120),
            renderCell: (row) => (
                <Text type="body" hasTabularNumbers>
                    {row.endDate}
                </Text>
            ),
        },
        {
            key: 'status',
            header: 'Trạng thái',
            width: pixel(120),
            renderCell: (row) => {
                const phase = phaseOf(row, today);
                return <Badge variant={phase.variant} label={phase.label} />;
            },
        },
        {
            key: 'actions',
            header: '',
            width: pixel(170),
            align: 'end',
            renderCell: (row) => (
                <HStack gap={1} hAlign="end">
                    <Button
                        label="Sửa"
                        onClick={() => openEdit(row)}
                        variant="ghost"
                        size="sm"
                        icon={<Icon icon={Pencil} size="sm" />}
                    />
                    <Button
                        label="Xoá"
                        variant="ghost"
                        size="sm"
                        onClick={() => setPendingDelete(row)}
                        icon={<Icon icon={Trash2} size="sm" color="error" />}
                    />
                </HStack>
            ),
        },
    ];

    return (
        <PageBody>
            <HStack gap={3} vAlign="center" hAlign="between" wrap="wrap">
                <VStack gap={0}>
                    <Heading level={1}>Countdown</Heading>
                    <Text type="supporting" color="secondary">
                        Hôm nay: {today}
                    </Text>
                </VStack>
                <HStack gap={2} vAlign="center">
                    <Button
                        label="Cấu hình gửi"
                        onClick={() => setConfigOpen(true)}
                        variant="secondary"
                        size="sm"
                        icon={<Icon icon={Settings2} size="sm" />}
                    />
                    <Button
                        label="Thêm sự kiện"
                        onClick={openCreate}
                        variant="primary"
                        size="sm"
                        icon={<Icon icon={Plus} size="sm" />}
                    />
                </HStack>
            </HStack>

            {error && <FeedbackError>{error}</FeedbackError>}

            {rows === null && !error && <Spinner label="Đang tải…" />}

            {rows?.length === 0 && (
                <EmptyState
                    title="Chưa có sự kiện nào"
                    description="Thêm một sự kiện để bot bắt đầu đếm ngày."
                />
            )}

            {rows && rows.length > 0 && (
                <Table<CountdownRow>
                    data={rows as CountdownRow[]}
                    columns={columns}
                    idKey="id"
                    density="balanced"
                    dividers="rows"
                    hasHover
                />
            )}

            <CountdownFormDialog
                isOpen={dialogOpen}
                editing={editing}
                onOpenChange={setDialogOpen}
                onSaved={reload}
            />

            <CountdownConfigDialog isOpen={configOpen} onOpenChange={setConfigOpen} />

            <ConfirmDialog
                isOpen={pendingDelete !== null}
                title="Xoá sự kiện"
                message={`Xoá "${pendingDelete?.event}"? Không khôi phục được.`}
                confirmLabel="Xoá"
                tone="destructive"
                isBusy={deleting}
                onConfirm={confirmDelete}
                onOpenChange={(open) => !open && setPendingDelete(null)}
            />
        </PageBody>
    );
}
