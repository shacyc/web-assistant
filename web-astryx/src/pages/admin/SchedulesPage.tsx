import { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, Play } from 'lucide-react';
import {
    listSchedules,
    deleteSchedule,
    updateSchedule,
    runSchedule,
    ApiError,
    type Schedule,
    type ActionMeta,
} from '@/lib/apiClient';
import { HStack, VStack } from '@astryxdesign/core/Stack';
import { Heading, Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Badge } from '@astryxdesign/core/Badge';
import { Switch } from '@astryxdesign/core/Switch';
import { Icon } from '@astryxdesign/core/Icon';
import { Spinner } from '@astryxdesign/core/Spinner';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { Table, proportional, pixel } from '@astryxdesign/core/Table';
import type { TableColumn } from '@astryxdesign/core/Table';
import { PageBody } from '@/components/layout/PageBody';
import { FeedbackError, FeedbackNotice } from '@/components/Feedback';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { ScheduleFormDialog } from './ScheduleFormDialog';

// Table<T> đòi `T extends Record<string, unknown>` — bọc lại thay vì đụng apiClient.ts.
interface ScheduleRow extends Schedule {
    [key: string]: unknown;
}

export function SchedulesPage() {
    const [rows, setRows] = useState<Schedule[] | null>(null);
    const [actions, setActions] = useState<ActionMeta[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);

    const [dialogOpen, setDialogOpen] = useState(false);
    const [editing, setEditing] = useState<Schedule | null>(null);
    const [pendingDelete, setPendingDelete] = useState<Schedule | null>(null);
    const [deleting, setDeleting] = useState(false);
    // id của dòng đang "Chạy ngay" — khoá nút để không bấm chồng.
    const [runningId, setRunningId] = useState<string | null>(null);

    function reload() {
        listSchedules()
            .then(({ schedules, actions }) => {
                setRows(schedules);
                setActions(actions);
            })
            .catch((err) => setError(err instanceof ApiError ? err.message : 'Không tải được lịch'));
    }

    useEffect(reload, []);

    function openCreate() {
        setEditing(null);
        setError(null);
        setDialogOpen(true);
    }

    function openEdit(row: Schedule) {
        setEditing(row);
        setError(null);
        setDialogOpen(true);
    }

    async function toggleEnabled(row: Schedule, next: boolean) {
        // Cập nhật lạc quan: bật/tắt phải cảm giác tức thì.
        setRows((rs) => rs?.map((r) => (r.id === row.id ? { ...r, enabled: next } : r)) ?? null);
        try {
            await updateSchedule(row.id, { enabled: next });
        } catch (err) {
            setError(err instanceof ApiError ? err.message : 'Đổi trạng thái thất bại');
            reload();
        }
    }

    async function runNow(row: Schedule) {
        setRunningId(row.id);
        setError(null);
        setNotice(null);
        try {
            const { ok, summary } = await runSchedule(row.id);
            if (ok) setNotice(summary);
            else setError(summary);
        } catch (err) {
            setError(err instanceof ApiError ? err.message : 'Chạy thất bại');
        } finally {
            setRunningId(null);
        }
    }

    async function confirmDelete() {
        if (!pendingDelete) return;
        setDeleting(true);
        setError(null);
        try {
            await deleteSchedule(pendingDelete.id);
            reload();
        } catch (err) {
            setError(err instanceof ApiError ? err.message : 'Xoá thất bại');
        } finally {
            setDeleting(false);
            setPendingDelete(null);
        }
    }

    const labelOf = (actionId: string) => actions.find((a) => a.id === actionId)?.label ?? actionId;

    const columns: TableColumn<ScheduleRow>[] = [
        {
            key: 'timeOfDay',
            header: 'Giờ',
            width: pixel(80),
            renderCell: (row) => (
                <Text type="body" weight="medium" hasTabularNumbers>
                    {row.timeOfDay}
                </Text>
            ),
        },
        {
            key: 'action',
            header: 'Việc',
            width: proportional(3),
            renderCell: (row) => (
                <VStack gap={0}>
                    <Text type="body">{labelOf(row.actionId)}</Text>
                    <Text type="code" size="sm" color="secondary">
                        {row.actionId}
                        {row.payload !== '{}' && ` ${row.payload}`}
                    </Text>
                </VStack>
            ),
        },
        {
            key: 'enabled',
            header: 'Bật',
            width: pixel(70),
            renderCell: (row) => (
                <Switch
                    label={`Bật lịch ${row.timeOfDay}`}
                    isLabelHidden
                    value={row.enabled}
                    onChange={(checked) => toggleEnabled(row, checked)}
                />
            ),
        },
        {
            key: 'lastRun',
            header: 'Chạy gần nhất',
            width: pixel(200),
            renderCell: (row) =>
                row.lastRunAt ? (
                    <HStack gap={2} vAlign="center" wrap="wrap">
                        <Text type="supporting" color="secondary" hasTabularNumbers>
                            {new Date(row.lastRunAt).toLocaleString('vi-VN')}
                        </Text>
                        <Badge
                            variant={row.lastRunStatus === 'ok' ? 'success' : 'error'}
                            label={row.lastRunStatus ?? '—'}
                        />
                    </HStack>
                ) : (
                    <Text type="supporting" color="secondary">
                        chưa chạy
                    </Text>
                ),
        },
        {
            key: 'actions',
            header: '',
            width: pixel(220),
            align: 'end',
            renderCell: (row) => (
                <HStack gap={1} hAlign="end">
                    <Button
                        label="Chạy ngay"
                        variant="ghost"
                        size="sm"
                        isLoading={runningId === row.id}
                        isDisabled={runningId !== null}
                        onClick={() => runNow(row)}
                        icon={<Icon icon={Play} size="sm" />}
                    />
                    <Button
                        label="Sửa"
                        variant="ghost"
                        size="sm"
                        onClick={() => openEdit(row)}
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
                    <Heading level={1}>Lịch chạy</Heading>
                    <Text type="supporting" color="secondary">
                        Cron bắn mỗi 5 phút và chạy job nào tới giờ (giờ VN), mỗi ngày một lần.
                    </Text>
                </VStack>
                <Button
                    label="Thêm lịch"
                    onClick={openCreate}
                    variant="primary"
                    size="sm"
                    isDisabled={actions.length === 0}
                    icon={<Icon icon={Plus} size="sm" />}
                />
            </HStack>

            {error && <FeedbackError>{error}</FeedbackError>}
            {notice && <FeedbackNotice>{notice}</FeedbackNotice>}

            {rows === null && !error && <Spinner label="Đang tải…" />}

            {rows?.length === 0 && (
                <EmptyState
                    title="Chưa có lịch nào"
                    description="Cron vẫn chạy nhưng không có job nào để làm. Thêm một lịch để bắt đầu."
                />
            )}

            {rows && rows.length > 0 && (
                <Table<ScheduleRow>
                    data={rows as ScheduleRow[]}
                    columns={columns}
                    idKey="id"
                    density="balanced"
                    dividers="rows"
                    hasHover
                />
            )}

            <ScheduleFormDialog
                isOpen={dialogOpen}
                editing={editing}
                actions={actions}
                onOpenChange={setDialogOpen}
                onSaved={reload}
            />

            <ConfirmDialog
                isOpen={pendingDelete !== null}
                title="Xoá lịch"
                message={`Xoá lịch chạy "${pendingDelete ? labelOf(pendingDelete.actionId) : ''}" lúc ${pendingDelete?.timeOfDay}? Không khôi phục được.`}
                confirmLabel="Xoá"
                tone="destructive"
                isBusy={deleting}
                onConfirm={confirmDelete}
                onOpenChange={(open) => !open && setPendingDelete(null)}
            />
        </PageBody>
    );
}
