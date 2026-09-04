import { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, Settings2, Play } from 'lucide-react';
import {
    listHealthChecks,
    deleteHealthCheck,
    runHealthChecks,
    ApiError,
    type HealthCheck,
} from '@/lib/apiClient';
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
import { FeedbackError, FeedbackNotice } from '@/components/Feedback';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { HealthCheckFormDialog } from './HealthCheckFormDialog';
import { HealthCheckConfigDialog } from './HealthCheckConfigDialog';

type BadgeVariant = 'neutral' | 'info' | 'success' | 'error';

// Table<T> đòi `T extends Record<string, unknown>`; bọc lại thay vì đụng apiClient.ts.
interface HealthCheckRow extends HealthCheck {
    [key: string]: unknown;
}

function stateBadge(row: HealthCheck): { label: string; variant: BadgeVariant } {
    if (!row.enabled) return { label: 'Tắt', variant: 'neutral' };
    if (row.lastState === null) return { label: 'Chưa kiểm', variant: 'neutral' };
    if (row.lastState === 'up') return { label: 'Bình thường', variant: 'success' };
    // 'down' hoặc chuỗi tuỳ checkScript.
    return { label: row.lastState === 'down' ? 'Sập' : row.lastState, variant: 'error' };
}

/** ISO → 'DD/MM HH:MM' giờ VN. '' nếu chưa có. */
function shortTime(iso: string | null): string {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return new Intl.DateTimeFormat('vi-VN', {
        timeZone: 'Asia/Ho_Chi_Minh',
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    }).format(d);
}

export function HealthCheckListPage() {
    const [rows, setRows] = useState<HealthCheck[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const [checking, setChecking] = useState(false);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editing, setEditing] = useState<HealthCheck | null>(null);
    const [configOpen, setConfigOpen] = useState(false);
    const [pendingDelete, setPendingDelete] = useState<HealthCheck | null>(null);
    const [deleting, setDeleting] = useState(false);

    function openCreate() {
        setEditing(null);
        setError(null);
        setDialogOpen(true);
    }

    function openEdit(row: HealthCheck) {
        setEditing(row);
        setError(null);
        setDialogOpen(true);
    }

    function reload() {
        listHealthChecks()
            .then(({ healthchecks }) => setRows(healthchecks))
            .catch((err) => setError(err instanceof ApiError ? err.message : 'Không tải được dữ liệu'));
    }

    useEffect(reload, []);

    // Chạy healthcheck.run thật ngay bây giờ — cập nhật trạng thái + gửi Telegram nếu có
    // site đổi. `summary` mô tả kết quả (đã kiểm N site, gửi M thông báo / lỗi).
    async function checkNow() {
        setChecking(true);
        setError(null);
        setNotice(null);
        try {
            const res = await runHealthChecks();
            if (res.ok) setNotice(res.summary);
            else setError(res.summary);
            reload();
        } catch (err) {
            setError(err instanceof ApiError ? err.message : 'Kiểm tra thất bại');
        } finally {
            setChecking(false);
        }
    }

    async function confirmDelete() {
        if (!pendingDelete) return;
        setDeleting(true);
        setError(null);
        try {
            await deleteHealthCheck(pendingDelete.id);
            reload();
        } catch (err) {
            setError(err instanceof ApiError ? err.message : 'Xoá thất bại');
        } finally {
            setDeleting(false);
            setPendingDelete(null);
        }
    }

    const columns: TableColumn<HealthCheckRow>[] = [
        {
            key: 'label',
            header: 'Site',
            width: proportional(3),
            renderCell: (row) => (
                <VStack gap={0}>
                    <Text type="body" weight="medium">
                        {row.label}
                    </Text>
                    <Text type="supporting" color="secondary">
                        {row.url}
                    </Text>
                </VStack>
            ),
        },
        {
            key: 'state',
            header: 'Trạng thái',
            width: pixel(130),
            renderCell: (row) => {
                const b = stateBadge(row);
                return <Badge variant={b.variant} label={b.label} />;
            },
        },
        {
            key: 'lastCheckedAt',
            header: 'Kiểm lúc',
            width: proportional(2),
            renderCell: (row) => (
                <VStack gap={0}>
                    <Text type="body" hasTabularNumbers>
                        {shortTime(row.lastCheckedAt) || '—'}
                    </Text>
                    {row.lastDetail && (
                        <Text type="supporting" color="secondary">
                            {row.lastDetail}
                        </Text>
                    )}
                </VStack>
            ),
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
                    <Heading level={1}>Health check</Heading>
                    <Text type="supporting" color="secondary">
                        Cron kiểm các site đang bật mỗi 5 phút; báo Telegram khi trạng thái đổi.
                    </Text>
                </VStack>
                <HStack gap={2} vAlign="center">
                    <Button
                        label={checking ? 'Đang kiểm…' : 'Kiểm tra ngay'}
                        onClick={checkNow}
                        variant="secondary"
                        size="sm"
                        isLoading={checking}
                        isDisabled={rows !== null && rows.length === 0}
                        icon={<Icon icon={Play} size="sm" />}
                    />
                    <Button
                        label="Cấu hình gửi"
                        onClick={() => setConfigOpen(true)}
                        variant="secondary"
                        size="sm"
                        icon={<Icon icon={Settings2} size="sm" />}
                    />
                    <Button
                        label="Thêm site"
                        onClick={openCreate}
                        variant="primary"
                        size="sm"
                        icon={<Icon icon={Plus} size="sm" />}
                    />
                </HStack>
            </HStack>

            {error && <FeedbackError>{error}</FeedbackError>}
            {notice && <FeedbackNotice>{notice}</FeedbackNotice>}

            {rows === null && !error && <Spinner label="Đang tải…" />}

            {rows?.length === 0 && (
                <EmptyState
                    title="Chưa có site nào"
                    description="Thêm một URL để cron bắt đầu theo dõi."
                />
            )}

            {rows && rows.length > 0 && (
                <Table<HealthCheckRow>
                    data={rows as HealthCheckRow[]}
                    columns={columns}
                    idKey="id"
                    density="balanced"
                    dividers="rows"
                    hasHover
                />
            )}

            <HealthCheckFormDialog
                isOpen={dialogOpen}
                editing={editing}
                onOpenChange={setDialogOpen}
                onSaved={reload}
            />

            <HealthCheckConfigDialog isOpen={configOpen} onOpenChange={setConfigOpen} />

            <ConfirmDialog
                isOpen={pendingDelete !== null}
                title="Xoá site"
                message={`Xoá "${pendingDelete?.label}"? Không khôi phục được.`}
                confirmLabel="Xoá"
                tone="destructive"
                isBusy={deleting}
                onConfirm={confirmDelete}
                onOpenChange={(open) => !open && setPendingDelete(null)}
            />
        </PageBody>
    );
}
