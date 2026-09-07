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

const WD = ['', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

/** 5400 → "1 giờ 30 phút" */
function fmtDuration(total: number): string {
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    return [h && `${h} giờ`, m && `${m} phút`, s && `${s} giây`].filter(Boolean).join(' ') || '0 giây';
}

/** Một dòng tóm tắt kiểu lặp cho bảng — đọc là hiểu chạy khi nào. */
function describeSchedule(r: Schedule): string {
    switch (r.kind) {
        case 'weekly': {
            const days = (r.daysOfWeek ?? '').split(',').filter(Boolean).map((n) => WD[+n]).join(' ');
            return `${days || '—'} · ${r.timeOfDay}`;
        }
        case 'monthly':
            return `Ngày ${r.dayOfMonth} hằng tháng · ${r.timeOfDay}`;
        case 'interval':
            return `Mỗi ${r.intervalDays} ngày · ${r.timeOfDay}`;
        case 'every':
            return `Mỗi ${fmtDuration(r.intervalSeconds ?? 0)}`;
        case 'cron':
            return `cron: ${r.cron}`;
        case 'tick':
            return 'Mỗi nhịp cron (5 phút)';
        default:
            return `Hằng ngày · ${r.timeOfDay}`;
    }
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
            // Gộp "khi nào chạy" + "chạy cái gì" vào một cột co giãn: bảng chỉ rộng ~830px
            // mà tách 5 cột cố định thì cột nào cũng chật. Hai dòng: lịch (đậm) + việc (mờ).
            key: 'schedule',
            header: 'Lịch',
            width: proportional(3),
            renderCell: (row) => (
                <VStack gap={0}>
                    <Text type="body" weight="medium" hasTabularNumbers>
                        {describeSchedule(row)}
                    </Text>
                    <HStack gap={2} vAlign="center" wrap="wrap">
                        <Text type="supporting" color="secondary">
                            {labelOf(row.actionId)}
                        </Text>
                        {row.payload !== '{}' && (
                            <Text type="code" size="sm" color="secondary">
                                {row.payload}
                            </Text>
                        )}
                    </HStack>
                </VStack>
            ),
        },
        {
            key: 'enabled',
            header: 'Bật',
            width: pixel(52),
            renderCell: (row) => (
                <Switch
                    label={`Bật lịch ${describeSchedule(row)}`}
                    isLabelHidden
                    value={row.enabled}
                    onChange={(checked) => toggleEnabled(row, checked)}
                />
            ),
        },
        {
            // Không còn badge trạng thái riêng: chính ngày giờ đổi màu — xanh nếu lần chạy
            // gần nhất thành công, đỏ nếu lỗi. Chi tiết lỗi vẫn xem ở màn Nhật ký.
            key: 'lastRun',
            header: 'Chạy gần nhất',
            width: pixel(150),
            renderCell: (row) =>
                row.lastRunAt ? (
                    <Text
                        type="supporting"
                        hasTabularNumbers
                        style={{
                            color:
                                row.lastRunStatus === 'ok'
                                    ? 'var(--color-text-green)'
                                    : 'var(--color-text-red)',
                        }}
                    >
                        {new Date(row.lastRunAt).toLocaleString('vi-VN')}
                    </Text>
                ) : (
                    <Text type="supporting" color="secondary">
                        chưa chạy
                    </Text>
                ),
        },
        {
            // Nút chỉ-icon + tooltip: "Chạy ngay / Sửa / Xoá" dạng chữ chiếm ~220px và vẫn
            // bị cắt. `label` giữ nguyên làm tên cho screen reader.
            key: 'actions',
            header: '',
            width: pixel(116),
            align: 'end',
            renderCell: (row) => (
                <HStack gap={1} hAlign="end">
                    <Button
                        label="Chạy ngay"
                        isIconOnly
                        tooltip="Chạy ngay"
                        variant="ghost"
                        size="sm"
                        isLoading={runningId === row.id}
                        isDisabled={runningId !== null}
                        onClick={() => runNow(row)}
                        icon={<Icon icon={Play} size="sm" />}
                    />
                    <Button
                        label="Sửa"
                        isIconOnly
                        tooltip="Sửa"
                        variant="ghost"
                        size="sm"
                        onClick={() => openEdit(row)}
                        icon={<Icon icon={Pencil} size="sm" />}
                    />
                    <Button
                        label="Xoá"
                        isIconOnly
                        tooltip="Xoá"
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
            <VStack gap={1}>
                <HStack gap={3} vAlign="center" hAlign="between" wrap="wrap">
                    <Heading level={1}>Lịch chạy</Heading>
                    <Button
                        label="Thêm lịch"
                        onClick={openCreate}
                        variant="primary"
                        size="sm"
                        isDisabled={actions.length === 0}
                        icon={<Icon icon={Plus} size="sm" />}
                    />
                </HStack>
                <Text type="supporting" color="secondary">
                    Cron chạy mỗi 5 phút theo giờ VN, gọi job nào tới lượt.
                </Text>
            </VStack>

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
                message={`Xoá lịch chạy "${pendingDelete ? labelOf(pendingDelete.actionId) : ''}" (${pendingDelete ? describeSchedule(pendingDelete) : ''})? Không khôi phục được.`}
                confirmLabel="Xoá"
                tone="destructive"
                isBusy={deleting}
                onConfirm={confirmDelete}
                onOpenChange={(open) => !open && setPendingDelete(null)}
            />
        </PageBody>
    );
}
